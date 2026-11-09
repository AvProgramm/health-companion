"""Check the global food model's parts against values worked out by hand, on fake data."""
import unittest
from types import SimpleNamespace

# Skip quietly where PyTorch is not installed, as in CI
try:
    import numpy as np
    import torch
    from torch import nn
    from vision.global_model import FoodMatcher
    from vision.isia import blocks_to_fetch, names_seen, split_of
    from vision.lora import LoRALinear, add_lora, merge_lora
    from vision.prepare import DROPPED, SEALED
    from vision.prepare_global import global_names, isia_splits, label_lookup
    from vision.run_global import confidence_bands
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
