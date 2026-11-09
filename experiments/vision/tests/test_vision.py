"""Check each step of the dish-photo pipeline against values worked out by hand, on tiny fake data."""
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np

# Skip quietly where PyTorch and timm are not installed, as in CI
try:
    import onnxruntime
    import timm
    import torch
except ImportError as missing:
    raise unittest.SkipTest(f'The vision environment is not installed: {missing}.')
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from vision import export, run
from vision.config import Settings
from vision.data import FoodPhotos, photo_transform
from vision.lora import LoRALinear, add_lora, merge_lora
from vision.prepare import DROPPED, SEALED, TRAIN, VALIDATION, assign_splits, difference_hash, merged_labels, square_photo
from vision.train import fit_head, predict_top, seed_all, top_k_accuracy, train_lora

# Small enough to run on the CPU in a moment
TINY = {'img_size': 32, 'patch_size': 8, 'embed_dim': 24, 'depth': 2, 'num_heads': 2, 'num_classes': 5}


def tiny_vit():
    """Return a fresh, untrained two-block ViT with a five-dish head."""
    return timm.create_model('vit_tiny_patch16_224', pretrained=False, **TINY)


def png_bytes(width, height):
    """Return a fictional flat grey photo as PNG bytes."""
    stream = io.BytesIO()
    Image.new('RGB', (width, height), (128, 128, 128)).save(stream, format='PNG')
    return stream.getvalue()


class LoraTests(unittest.TestCase):
    def layer(self):
        """Return a LoRA layer with weights chosen so the output can be worked out by hand."""
        base = nn.Linear(2, 2, bias=False)
        base.weight.data = torch.tensor([[1.0, 0.0], [0.0, 1.0]])
        layer = LoRALinear(base, rank=1, alpha=1.0)
        layer.down.weight.data = torch.tensor([[1.0, 1.0]])
        layer.up.weight.data = torch.tensor([[2.0], [0.0]])
        return layer

    def test_a_new_correction_changes_nothing(self):
        base = nn.Linear(4, 3)
        inputs = torch.randn(5, 4)
        self.assertTrue(torch.equal(LoRALinear(base, 2, 2.0)(inputs), base(inputs)))

    def test_output_matches_the_values_worked_by_hand(self):
        # Base gives [3, 4]; down gives 3 + 4 = 7; up gives [14, 0]; scale is 1
        self.assertEqual(self.layer()(torch.tensor([[3.0, 4.0]])).tolist(), [[17.0, 4.0]])

    def test_merged_weight_matches_the_values_worked_by_hand(self):
        # W + (alpha / rank) U D = [[1, 0], [0, 1]] + [[2, 2], [0, 0]]
        self.assertEqual(self.layer().merged().weight.tolist(), [[3.0, 2.0], [0.0, 1.0]])

    def test_merged_layer_computes_the_same_function(self):
        seed_all()
        layer = LoRALinear(nn.Linear(6, 4), 3, 3.0)
        nn.init.normal_(layer.up.weight)
        inputs = torch.randn(8, 6)
        self.assertTrue(torch.allclose(layer.merged()(inputs), layer(inputs), atol=1e-6))

    def test_a_correction_is_built_on_the_same_device_as_its_layer(self):
        layer = LoRALinear(nn.Linear(4, 4, device='meta'), 2, 2.0)
        self.assertEqual((layer.down.weight.device.type, layer.up.weight.device.type), ('meta', 'meta'))

    def test_rank_cannot_exceed_the_layer(self):
        self.assertEqual(LoRALinear(nn.Linear(2, 9), 16, 16.0).rank, 2)

    def test_only_the_corrections_and_head_can_learn(self):
        model = add_lora(tiny_vit(), rank=4, alpha=4.0)
        # Each block: qkv 4 x (24 + 72), proj 4 x (24 + 24), fc1 4 x (24 + 96), fc2 4 x (96 + 24) = 1,536. Head: 24 x 5 + 5 = 125
        self.assertEqual(sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad), 2 * 1536 + 125)

    def test_every_block_linear_layer_is_wrapped_once(self):
        model = add_lora(tiny_vit(), rank=4, alpha=4.0)
        self.assertEqual(sum(isinstance(module, LoRALinear) for module in model.modules()), 2 * 4)

    def test_merging_gives_an_ordinary_vit_with_the_same_output(self):
        seed_all()
        model = add_lora(tiny_vit(), rank=4, alpha=4.0).eval()
        for module in model.modules():
            if isinstance(module, LoRALinear):
                nn.init.normal_(module.up.weight, std=0.01)
        inputs = torch.randn(2, 3, 32, 32)
        before = model(inputs).detach()
        merge_lora(model)
        self.assertFalse(any(isinstance(module, LoRALinear) for module in model.modules()))
        self.assertTrue(torch.allclose(model(inputs), before, atol=1e-5))
        self.assertEqual(sum(parameter.numel() for parameter in model.parameters()), sum(parameter.numel() for parameter in tiny_vit().parameters()))


class PrepareTests(unittest.TestCase):
    def test_a_dish_in_two_datasets_becomes_one_class(self):
        self.assertEqual(merged_labels({'a': ['satay', 'fried_rice'], 'b': ['fried_rice', 'apple_pie']}), ['apple_pie', 'fried_rice', 'satay'])

    def test_a_wide_photo_becomes_a_centred_square(self):
        self.assertEqual(square_photo(png_bytes(512, 384)).shape, (256, 256, 3))

    def test_an_unreadable_photo_is_refused(self):
        self.assertIsNone(square_photo(b'not a picture'))

    def test_fingerprint_of_a_rising_brightness_is_all_ones(self):
        ramp = np.tile(np.linspace(0, 255, 256, dtype=np.uint8)[:, np.newaxis], (1, 256)).T[..., np.newaxis].repeat(3, axis=2)
        self.assertEqual(difference_hash(ramp), 2 ** 64 - 1)

    def test_fingerprint_of_a_flat_photo_is_zero(self):
        self.assertEqual(difference_hash(np.zeros((256, 256, 3), dtype=np.uint8)), 0)

    def split(self):
        """Return the splits of a fictional pool: positions 0-3 are one dish, 4 and 5 are sealed, 6 is unreadable."""
        labels = np.array([0, 0, 0, 0, 0, 0, -1])
        origins = np.zeros(7, dtype=np.int8)
        sealed = np.array([False, False, False, False, True, True, False])
        hashes = np.array([1, 1, 2, 3, 2, 9, 0], dtype=np.uint64)
        return assign_splits(labels, origins, sealed, hashes, share=0.34)

    def test_a_sealed_photo_also_in_training_is_dropped(self):
        splits = self.split()
        self.assertEqual(int(splits[4]), DROPPED)
        self.assertEqual(int(splits[5]), SEALED)

    def test_an_unreadable_photo_is_never_used(self):
        self.assertEqual(int(self.split()[6]), DROPPED)

    def test_copies_stay_together_and_one_group_is_held_back(self):
        splits = self.split()
        self.assertEqual(int(splits[0]), int(splits[1]))
        # Three fingerprint groups at a 34% share round to one held-back group
        self.assertEqual(len({int(splits[0]), int(splits[2]), int(splits[3])}), 2)
        self.assertTrue(set(splits[:4].tolist()) == {TRAIN, VALIDATION})

    def test_the_split_repeats_exactly(self):
        self.assertEqual(self.split().tolist(), self.split().tolist())


class DataTests(unittest.TestCase):
    def test_a_photo_comes_back_cropped_scaled_and_labelled(self):
        with tempfile.TemporaryDirectory() as folder:
            np.save(Path(folder) / 'images.npy', np.full((2, 256, 256, 3), 128, dtype=np.uint8))
            photos = FoodPhotos(folder, np.array([1]), np.array([7, 3]), photo_transform([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], training=False))
            picture, label = photos[0]
            photos.images = None
        self.assertEqual(label, 3)
        self.assertEqual(tuple(picture.shape), (3, 224, 224))
        # Grey 128 scales to 128 / 255, then (value - 0.5) / 0.5
        self.assertAlmostEqual(picture[0, 0, 0].item(), (128 / 255 - 0.5) / 0.5, places=5)


class TrainingTests(unittest.TestCase):
    def test_top_k_accuracy_matches_the_values_worked_by_hand(self):
        top = torch.tensor([[1, 2], [3, 0], [4, 5]])
        labels = torch.tensor([1, 0, 9])
        self.assertAlmostEqual(top_k_accuracy(top, labels, 1), 1 / 3, places=6)
        self.assertAlmostEqual(top_k_accuracy(top, labels, 2), 2 / 3, places=6)

    def test_a_head_learns_separable_features(self):
        seed_all()
        features = torch.eye(3).repeat(10, 1) + 0.01 * torch.randn(30, 3)
        labels = torch.tensor([0, 1, 2]).repeat(10)
        result = fit_head((features, labels), (features, labels), 6, 0.05, Settings(), 'cpu', epochs=30)
        self.assertEqual(result['top1'], 1.0)

    def test_lora_training_changes_the_corrections_but_not_the_frozen_weights(self):
        seed_all()
        model = add_lora(tiny_vit(), rank=4, alpha=4.0)
        frozen_before = next(iter(model.blocks[0].attn.qkv.base.parameters())).clone()
        pictures, labels = torch.randn(8, 3, 32, 32), torch.arange(8) % 5
        loader = DataLoader(TensorDataset(pictures, labels), batch_size=4)
        result = train_lora(model, loader, loader, Settings(epochs=2, workers=0), 'cpu', report=lambda _line: None)
        self.assertTrue(torch.equal(next(iter(model.blocks[0].attn.qkv.base.parameters())), frozen_before))
        self.assertGreater(model.blocks[0].attn.qkv.up.weight.abs().sum().item(), 0.0)
        self.assertEqual([entry['epoch'] for entry in result['history']], [1, 2])

    def test_predictions_keep_five_guesses_per_photo(self):
        pictures, labels = torch.randn(4, 3, 32, 32), torch.arange(4)
        top, returned = predict_top(tiny_vit(), DataLoader(TensorDataset(pictures, labels), batch_size=2), 'cpu')
        self.assertEqual(tuple(top.shape), (4, 5))
        self.assertTrue(torch.equal(returned, labels))


class SealedAndExportTests(unittest.TestCase):
    def test_a_second_sealed_run_is_refused(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(run, 'RESULTS', Path(folder)):
            (Path(folder) / 'final.json').write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(SystemExit, 'already been run'):
                run.final()

    def test_the_sealed_report_slices_by_hand(self):
        top = torch.tensor([[0, 1, 2, 3, 4], [9, 1, 2, 3, 4], [9, 8, 7, 6, 5]])
        labels = torch.tensor([0, 1, 0])
        report = run.sealed_report(top, labels, torch.tensor([False, True, True]), torch.tensor([False, False, True]))
        self.assertEqual(report['all_photos']['photos'], 3)
        self.assertAlmostEqual(report['all_photos']['top1'], 1 / 3, places=6)
        self.assertAlmostEqual(report['malaysian_photos']['top5'], 1 / 2, places=6)
        self.assertEqual(report['malaysian_only_dishes']['top5'], 0.0)

    def test_onnx_output_matches_pytorch(self):
        seed_all()
        model = merge_lora(add_lora(tiny_vit(), rank=4, alpha=4.0)).eval()
        inputs = torch.randn(1, 3, 32, 32)
        with torch.no_grad():
            expected = model(inputs).numpy()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'tiny.onnx'
            export.export_onnx(model, path, image_size=32)
            got = export.run_onnx(path, inputs.numpy())
        self.assertLess(float(np.abs(got - expected).max()), 1e-4)

    def test_web_files_hold_what_the_phone_needs(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'small.onnx'
            source.write_bytes(b'fictional model')
            export.write_web_files(source, ['satay'], [0.5], [0.5], Path(folder) / 'web')
            facts = json.loads((Path(folder) / 'web' / 'labels.json').read_text(encoding='utf-8'))
            self.assertEqual((Path(folder) / 'web' / 'model.onnx').read_bytes(), b'fictional model')
        self.assertEqual((facts['dishes'], facts['storedSize'], facts['imageSize']), (['satay'], 256, 224))


if __name__ == '__main__':
    unittest.main()
