"""Check the global food model's parts against values worked out by hand, on fake data."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

# Skip quietly where PyTorch is not installed, as in CI
try:
    import numpy as np
    import torch
    from torch import nn
    from vision.global_model import FoodMatcher
    from vision.export import halve_weights, run_onnx
    from vision.isia import blocks_to_fetch, names_by_split, names_seen, split_of
    from vision.lora import LoRALinear, add_lora, merge_lora
    from vision.config import STORED_SIZE
    from vision.prepare import DROPPED, SEALED, TRAIN, VALIDATION
    from vision.prepare_global import global_names, isia_splits, label_lookup, main as join_photos
    from vision.run_global import confidence_bands, group_scores, in_blocks, names_with_unseen, rounded_evenly, rounded_per_row, rounded_to_half
except ImportError as missing:
    raise unittest.SkipTest(f'The vision environment is not installed: {missing}.')


class FakeVision(nn.Module):
    """Stand in for SigLIP2's vision half: one block, and the photo as its own feature."""

    def __init__(self):
        super().__init__()
        self.encoder = SimpleNamespace(layers=nn.ModuleList([nn.Sequential(nn.Linear(2, 2))]))
        self.block = self.encoder.layers

    def forward(self, pixel_values):
        return SimpleNamespace(pooler_output=self.block[0](pixel_values))


def fake_photos(count, seed):
    """Return fake photos at the stored size, each one different."""
    return np.random.default_rng(seed).integers(0, 256, size=(count, STORED_SIZE, STORED_SIZE, 3), dtype=np.uint8)


class WholeJoinTests(unittest.TestCase):
    def test_joins_a_photo_count_that_is_not_a_multiple_of_the_copy_step(self):
        # Found on 9 Nov: the last short step of the first experiment's photos crashed the join
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            old, blocks, joined, results = (Path(folder) / name for name in ('old', 'blocks', 'joined', 'results'))
            for path in (old, blocks, results):
                path.mkdir()

            # Three photos from the first experiment
            old_photos = fake_photos(3, seed=1)
            (old / 'dishes.json').write_text(json.dumps(['apple_pie', 'satay']), encoding='utf-8')
            np.save(old / 'images.npy', old_photos)
            np.save(old / 'labels.npy', np.array([0, 1, 0], dtype=np.int32))
            np.save(old / 'origins.npy', np.array([0, 1, 0], dtype=np.int8))
            np.save(old / 'splits.npy', np.array([TRAIN, VALIDATION, SEALED], dtype=np.int8))

            # Three ISIA photos in two blocks, one of a dish that never received a name; number 0 means a different dish in each split
            new_photos = fake_photos(3, seed=2)
            (blocks / 'names.json').write_text(json.dumps({'train': {'0': 'Apple_pie'}, 'test': {'0': 'Zucchini_bread', '1': 'Abalone'}}), encoding='utf-8')
            np.savez(blocks / 'test_000_000.npz', photos=new_photos[:1], categories=np.array([0]), hashes=np.array([11], dtype=np.uint64))
            np.savez(blocks / 'train_000_000.npz', photos=new_photos[1:], categories=np.array([0, 7]), hashes=np.array([12, 13], dtype=np.uint64))

            with patch.multiple('vision.prepare_global', PREPARED=old, GLOBAL_PREPARED=joined, RESULTS=results, BLOCKS=blocks), patch('builtins.print'):
                join_photos()

            # By hand: the trained dishes are apple pie and satay, the test dishes sort to abalone and
            # zucchini bread, so the test photo is label 1 of those, and the unnamed photo's slot stays unused
            images = np.load(joined / 'images.npy')
            self.assertTrue((images[:3] == old_photos).all() and (images[3:5] == new_photos[:2]).all() and (images[5] == 0).all())
            self.assertEqual(json.loads((joined / 'dishes.json').read_text(encoding='utf-8')), ['apple pie', 'satay'])
            self.assertEqual(json.loads((joined / 'test_dishes.json').read_text(encoding='utf-8')), ['abalone', 'zucchini bread'])
            self.assertEqual(np.load(joined / 'labels.npy').tolist(), [0, 1, 0, 1, 0, -1])
            self.assertEqual(np.load(joined / 'origins.npy').tolist(), [0, 1, 0, 2, 2, 2])
            self.assertEqual(np.load(joined / 'splits.npy').tolist(), [TRAIN, VALIDATION, SEALED, SEALED, VALIDATION, DROPPED])


class UnseenDishTests(unittest.TestCase):
    def test_a_test_dish_the_phone_already_knows_is_not_offered_twice(self):
        self.assertEqual(names_with_unseen(['rice', 'satay'], ['satay', 'crudo']), ['rice', 'satay', 'crudo'])

    def test_each_group_is_scored_on_its_own_photos(self):
        # By hand: the first photo is right first time, the second only at its fifth guess, the third never
        top = torch.tensor([[7, 1, 2, 3, 4], [1, 2, 3, 4, 7], [1, 2, 3, 4, 5]])
        wanted = torch.tensor([7, 7, 7])
        groups = {'first': torch.tensor([True, False, False]), 'rest': torch.tensor([False, True, True])}
        self.assertEqual(group_scores(top, wanted, groups), {'first': {'photos': 1, 'top1': 1.0, 'top5': 1.0}, 'rest': {'photos': 2, 'top1': 0.0, 'top5': 0.5}})


class ShrinkingTests(unittest.TestCase):
    def test_even_rounding_uses_one_scale_for_the_whole_tensor(self):
        # By hand: 255 steps of 1 from 0 to 255, so 1.4 rounds down to 1 and 1.6 up to 2
        weight = torch.tensor([0.0, 1.4, 1.6, 255.0])
        self.assertTrue(torch.allclose(rounded_evenly(weight), torch.tensor([0.0, 1.0, 2.0, 255.0])))

    def test_per_row_rounding_gives_each_row_its_own_scale(self):
        # By hand: the first row spans 255 and the second 2.55, so only the first loses its small value
        weight = torch.tensor([[0.0, 0.004, 255.0], [0.0, 0.014, 2.55]])
        self.assertTrue(torch.allclose(rounded_per_row(weight), torch.tensor([[0.0, 0.0, 255.0], [0.0, 0.01, 2.55]])))

    def test_sixteen_bits_keep_about_three_significant_figures(self):
        self.assertAlmostEqual(rounded_to_half(torch.tensor([0.1234567])).item(), 0.1234567, places=3)

    def test_block_numbers_are_matched_whole(self):
        # Block 1 must not catch block 11, which is why the match includes the dots
        self.assertTrue(in_blocks('encoder.layers.1.mlp.fc1.weight', [1]))
        self.assertFalse(in_blocks('encoder.layers.11.mlp.fc1.weight', [1]))


class HalvingTests(unittest.TestCase):
    def test_the_answers_stay_the_same_and_the_file_shrinks(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            full, small = Path(folder) / 'full.onnx', Path(folder) / 'small.onnx'
            torch.onnx.export(nn.Linear(64, 32).eval(), torch.zeros(1, 64), str(full), input_names=['pixels'], output_names=['logits'], opset_version=18, dynamo=False)
            halve_weights(full, small)

            inputs = torch.randn(3, 64, generator=torch.Generator().manual_seed(1)).numpy()
            self.assertTrue(np.allclose(run_onnx(small, inputs), run_onnx(full, inputs), atol=1e-2))
            self.assertLess(small.stat().st_size, full.stat().st_size * 0.7)


class ConfidenceBandTests(unittest.TestCase):
    def test_each_photo_counts_once_and_an_empty_band_has_no_rate(self):
        # By hand: 0.1 is alone in the first band, 0.2 and 0.25 share the next, 0.85 is in the last
        bands = confidence_bands(torch.tensor([0.1, 0.2, 0.25, 0.85]), torch.tensor([False, True, False, True]))
        self.assertEqual([band['photos'] for band in bands], [1, 2, 0, 0, 0, 0, 0, 1])
        self.assertEqual([bands[0]['right'], bands[1]['right'], bands[7]['right']], [0.0, 0.5, 1.0])
        self.assertIsNone(bands[2]['right'])


class FoodMatcherTests(unittest.TestCase):
    def matcher(self):
        """Return a matcher whose block does nothing, and whose two names are the axes."""
        vision = FakeVision()
        vision.block[0][0].weight.data = torch.eye(2)
        vision.block[0][0].bias.data = torch.zeros(2)
        return FoodMatcher(vision, torch.eye(2), scale=10.0)

    def test_scores_are_scaled_cosines(self):
        # The photo normalises to [0.6, 0.8], so the scores are 10 times that
        self.assertTrue(torch.allclose(self.matcher()(torch.tensor([[3.0, 4.0]])), torch.tensor([[6.0, 8.0]])))

    def test_lora_leaves_the_name_vectors_fixed(self):
        matcher = add_lora(self.matcher(), rank=1, alpha=1.0, train_head=False)
        self.assertFalse(matcher.head.weight.requires_grad)
        self.assertEqual(sum(isinstance(module, LoRALinear) for module in matcher.modules()), 1)

    def test_lora_can_still_train_a_head_when_asked(self):
        self.assertTrue(add_lora(self.matcher(), rank=1, alpha=1.0).head.weight.requires_grad)

    def test_merging_keeps_the_output(self):
        matcher = add_lora(self.matcher(), rank=1, alpha=1.0, train_head=False)
        matcher.blocks[0][0].up.weight.data = torch.tensor([[0.1], [0.2]])
        inputs = torch.tensor([[3.0, 4.0]])
        before = matcher(inputs).detach()
        merge_lora(matcher)
        self.assertTrue(torch.allclose(matcher(inputs), before, atol=1e-5))


class SamplingTests(unittest.TestCase):
    def test_every_fourth_block_starting_somewhere_different_in_each_file(self):
        self.assertEqual(blocks_to_fetch(9, 0), [0, 4, 8])
        self.assertEqual(blocks_to_fetch(9, 1), [1, 5])
        self.assertEqual(blocks_to_fetch(9, 5), [1, 5])

    def test_only_rows_with_a_name_teach_a_name(self):
        self.assertEqual(names_seen([2, 2, 5], ['satay', None, None]), {2: 'satay'})

    def test_each_split_keeps_its_own_numbers(self):
        # Found on 9 Nov: ISIA's test files number 100 different dishes from zero, so 0 means two dishes
        found = [('test', {0: 'Crudo'}), ('train', {0: 'Abalone'}), ('train', {1: 'Aligot'})]
        self.assertEqual(names_by_split(found), {'train': {0: 'Abalone', 1: 'Aligot'}, 'test': {0: 'Crudo'}})

    def test_the_split_comes_from_the_file_name(self):
        self.assertEqual((split_of('x/test-00.parquet'), split_of('x/train-00.parquet')), ('test', 'train'))


class JoiningTests(unittest.TestCase):
    def test_a_dish_in_two_datasets_becomes_one_class(self):
        self.assertEqual(global_names(['apple_pie', 'satay'], ['Apple_pie', 'Abalone']), ['abalone', 'apple pie', 'satay'])

    def test_labels_move_to_the_shared_list(self):
        self.assertEqual(label_lookup(['satay', 'Apple_pie'], ['abalone', 'apple pie', 'satay']).tolist(), [2, 1])

    def test_a_sealed_photo_seen_in_training_elsewhere_is_dropped(self):
        labels = np.array([0, 0, 0, 0])
        sealed = np.array([False, False, True, True])
        hashes = np.array([1, 2, 3, 4], dtype=np.uint64)
        splits = isia_splits(labels, sealed, hashes, np.array([3], dtype=np.uint64), share=0.5)
        self.assertEqual(int(splits[2]), DROPPED)
        self.assertEqual(int(splits[3]), SEALED)


if __name__ == '__main__':
    unittest.main()
