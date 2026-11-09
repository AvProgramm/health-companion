"""Check the hold-out comparison's parts against values worked out by hand, on fake data."""
import unittest
from types import SimpleNamespace

# Skip quietly where PyTorch is not installed, as in CI
try:
    import numpy as np
    import torch
    from torch import nn
    from vision.global_model import FoodMatcher
    from vision.lora import LoRALinear, add_lora, merge_lora, set_lora_strength
    from vision.prepare import DROPPED, SEALED, TRAIN, VALIDATION
    from vision.run_holdout import average_top1, best_version, free_norms, held_out_dishes, kept_names_and_lookup, kept_positions, norm_counts, photo_groups
except ImportError as missing:
    raise unittest.SkipTest(f'The vision environment is not installed: {missing}.')


class FakeVision(nn.Module):
    """Stand in for SigLIP2's vision half: one block holding a LayerNorm and a linear layer."""

    def __init__(self):
        super().__init__()
        self.encoder = SimpleNamespace(layers=nn.ModuleList([nn.Sequential(nn.LayerNorm(2), nn.Linear(2, 2))]))
        self.block = self.encoder.layers

    def forward(self, pixel_values):
        return SimpleNamespace(pooler_output=self.block[0](pixel_values))


def fake_matcher():
    """Return a matcher over two names around the fake block."""
    return FoodMatcher(FakeVision(), torch.eye(2), scale=1.0)


def trainable_names(model):
    """Return the names of the weights that can learn."""
    return {name for name, parameter in model.named_parameters() if parameter.requires_grad}


class HeldOutDishTests(unittest.TestCase):
    def test_every_named_dish_and_a_share_of_the_rest_are_held_out(self):
        # By hand: a quarter of the twenty other dishes is five, plus the one always held out
        trained = {f'dish {index}' for index in range(20)} | {'nasi lemak'}
        held_out = held_out_dishes(trained, {'nasi lemak'}, share=0.25, seed=1)
        self.assertIn('nasi lemak', held_out)
        self.assertEqual(len(held_out), 6)

    def test_the_same_seed_picks_the_same_dishes(self):
        trained = {f'dish {index}' for index in range(20)}
        self.assertEqual(held_out_dishes(trained, set(), 0.25, 1), held_out_dishes(trained, set(), 0.25, 1))

    def test_labels_move_to_the_kept_list_and_a_held_out_dish_has_no_position(self):
        kept, lookup = kept_names_and_lookup(['abalone', 'laksa', 'satay'], {'laksa'})
        self.assertEqual(kept, ['abalone', 'satay'])
        self.assertEqual(lookup.tolist(), [0, -1, 1])

    def test_only_kept_dishes_in_the_chosen_split_are_served(self):
        # By hand: photo 1 is the held-out dish, 2 is in another split, 4 is sealed and 5 was dropped
        labels = np.array([0, 1, 2, 2, 0, -1])
        splits = np.array([TRAIN, TRAIN, VALIDATION, TRAIN, SEALED, DROPPED])
        lookup = np.array([0, -1, 1])
        self.assertEqual(kept_positions(labels, splits, TRAIN, lookup).tolist(), [0, 3])

    def test_photos_are_grouped_by_what_happened_to_their_dish(self):
        # By hand: satay was trained, crudo held out, and laksa is a Malaysian dish held out
        groups = photo_groups(torch.tensor([2, 0, 1, 1]), ['crudo', 'laksa', 'satay'], {'crudo', 'laksa'}, {'laksa'})
        self.assertEqual(groups['trained'].tolist(), [True, False, False, False])
        self.assertEqual(groups['held_out'].tolist(), [False, True, False, False])
        self.assertEqual(groups['malaysian_held_out'].tolist(), [False, False, True, True])
        self.assertEqual(groups['dish: laksa'].tolist(), [False, False, True, True])


class NormTuningTests(unittest.TestCase):
    def test_only_the_norms_in_the_blocks_can_learn(self):
        matcher = free_norms(fake_matcher().requires_grad_(False))
        self.assertEqual(trainable_names(matcher), {'vision.block.0.0.weight', 'vision.block.0.0.bias'})

    def test_lora_and_the_norms_can_learn_together(self):
        matcher = free_norms(add_lora(fake_matcher(), rank=1, alpha=1.0, train_head=False))
        self.assertEqual(trainable_names(matcher), {'vision.block.0.0.weight', 'vision.block.0.0.bias', 'vision.block.0.1.down.weight', 'vision.block.0.1.up.weight'})

    def test_counting_finds_the_norm_weights_and_no_batch_norm(self):
        # By hand: one LayerNorm over two values holds two weights and two offsets
        self.assertEqual(norm_counts(fake_matcher()), {'batch_norm_layers': 0, 'block_layer_norm_weights': 4})


class StrengthTests(unittest.TestCase):
    def corrected(self):
        """Return a layer computing 2x, whose correction at full strength adds 3x."""
        base = nn.Linear(1, 1, bias=False)
        base.weight.data = torch.tensor([[2.0]])
        wrapped = LoRALinear(base, rank=1, alpha=1.0)
        wrapped.up.weight.data, wrapped.down.weight.data = torch.tensor([[3.0]]), torch.tensor([[1.0]])
        return nn.Sequential(wrapped)

    def test_half_strength_adds_half_the_correction(self):
        self.assertAlmostEqual(set_lora_strength(self.corrected(), alpha=1.0, strength=0.5)(torch.tensor([[1.0]])).item(), 3.5)

    def test_zero_strength_is_the_untouched_layer(self):
        self.assertAlmostEqual(set_lora_strength(self.corrected(), alpha=1.0, strength=0.0)(torch.tensor([[1.0]])).item(), 2.0)

    def test_merging_keeps_the_chosen_strength(self):
        merged = merge_lora(set_lora_strength(self.corrected(), alpha=1.0, strength=0.5))
        self.assertAlmostEqual(merged[0].weight.item(), 3.5)


class ChoosingTests(unittest.TestCase):
    def report(self, trained, held_out):
        """Return the two scores a version is chosen by."""
        return {'trained': {'top1': trained}, 'held_out': {'top1': held_out}}

    def test_both_groups_count_equally(self):
        self.assertAlmostEqual(average_top1(self.report(0.8, 0.4)), 0.6)

    def test_lora_stays_unless_another_version_is_clearly_better(self):
        # By hand: LoRA averages 0.600 and the other 0.605, a gap of only half a point
        reports = {'lora at strength 1.0': self.report(0.8, 0.4), 'norm at strength 1.0': self.report(0.7, 0.51)}
        self.assertEqual(best_version(reports), 'lora at strength 1.0')

    def test_a_clearly_better_version_is_chosen(self):
        # By hand: LoRA averages 0.60 and the other 0.62, a gap of two points
        reports = {'lora at strength 1.0': self.report(0.8, 0.4), 'lora at strength 0.5': self.report(0.74, 0.5)}
        self.assertEqual(best_version(reports), 'lora at strength 0.5')

    def test_the_references_cannot_be_chosen(self):
        # The shipped model saw the held-out dishes, and SigLIP2 alone is not a way of fine-tuning
        reports = {'lora at strength 1.0': self.report(0.8, 0.4), 'shipped_model': self.report(0.99, 0.99), 'siglip2_alone': self.report(0.9, 0.9)}
        self.assertEqual(best_version(reports), 'lora at strength 1.0')


if __name__ == '__main__':
    unittest.main()
