"""Check the full retrain's parts against values worked out by hand, on fake data."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

# Skip quietly where PyTorch is not installed, as in CI
try:
    import numpy as np
    import torch
    from torch import nn
    from vision.config import FULL_PREPARED, STORED_SIZE, Settings
    from vision.global_model import FoodMatcher
    from vision.lora import add_lora
    from vision.prepare import DROPPED, SEALED, TRAIN, VALIDATION, difference_hash
    from vision.prepare_full import FRESH_TRAINED, FRESH_UNSEEN, fresh_splits, main as join_photos, new_positions
    from vision.run_full import FULL_CHECKPOINT, NEW_MODEL, PHONE_MODEL, average_top1, export, final, replaces_phone, train
    from vision.run_global import trained_matcher, unseen_report
except ImportError as missing:
    raise unittest.SkipTest(f'The vision environment is not installed: {missing}.')


def fake_photos(count, seed):
    """Return fake photos at the stored size, each one different."""
    return np.random.default_rng(seed).integers(0, 256, size=(count, STORED_SIZE, STORED_SIZE, 3), dtype=np.uint8)


class FakeVision(nn.Module):
    """Stand in for SigLIP2's vision half: one block whose only layer leaves a photo as it is."""

    def __init__(self):
        super().__init__()
        self.encoder = SimpleNamespace(layers=nn.ModuleList([nn.Sequential(nn.Linear(2, 2, bias=False))]))
        self.block = self.encoder.layers
        self.block[0][0].weight.data = torch.eye(2)


def fake_matcher():
    """Return a matcher over two names around the fake block."""
    return FoodMatcher(FakeVision(), torch.eye(2), scale=1.0)


class NewPhotoTests(unittest.TestCase):
    def test_a_photo_already_held_or_with_no_dish_name_is_not_new(self):
        # By hand: the first photo is new, the second's dish has no name, and the third is already held
        categories, hashes = np.array([0, 7, 0]), np.array([5, 6, 8], dtype=np.uint64)
        self.assertEqual(new_positions(categories, hashes, {0: 'satay'}, np.array([8], dtype=np.uint64)).tolist(), [0])


class FreshSplitTests(unittest.TestCase):
    def splits(self, labels, is_test, hashes, share=0.5):
        """Return the split codes for these plain lists."""
        return fresh_splits(np.array(labels, dtype=np.int32), np.array(is_test, dtype=bool), np.array(hashes, dtype=np.uint64), share).tolist()

    def test_every_tenth_fingerprint_of_a_trained_dish_is_held_back(self):
        # By hand: 20 and 30 divide by ten, and half of the two other photos go to validation
        result = self.splits([0, 0, 0, 0], [False] * 4, [20, 21, 22, 30])
        self.assertEqual((result[0], result[3]), (FRESH_TRAINED, FRESH_TRAINED))
        self.assertEqual(sorted(result[1:3]), [TRAIN, VALIDATION])

    def test_copies_of_a_held_back_photo_are_held_back_with_it(self):
        result = self.splits([0, 0, 0], [False] * 3, [20, 20, 21])
        self.assertEqual(result[:2], [FRESH_TRAINED, FRESH_TRAINED])

    def test_copies_in_the_training_pool_stay_together(self):
        # By hand: the first two photos share a fingerprint, so they must land on the same side
        result = self.splits([0, 0, 0, 0], [False] * 4, [21, 21, 22, 23])
        self.assertEqual(result[0], result[1])

    def test_a_test_photo_is_fresh_even_when_its_fingerprint_divides_by_ten(self):
        self.assertEqual(self.splits([0], [True], [40]), [FRESH_UNSEEN])

    def test_a_test_photo_copying_a_training_pool_photo_is_dropped(self):
        # By hand: the second test photo has the fingerprint of the pool photo that follows it
        result = self.splits([0, 0, 0], [True, True, False], [31, 32, 32])
        self.assertEqual(result[:2], [FRESH_UNSEEN, DROPPED])


class WholeJoinTests(unittest.TestCase):
    def test_new_photos_are_added_after_a_first_join_that_keeps_its_splits(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            first, blocks, joined, results = (Path(folder) / name for name in ('first', 'blocks', 'joined', 'results'))
            for path in (first, blocks, results):
                path.mkdir()

            # The first join holds three photos
            first_photos = fake_photos(3, seed=1)
            np.save(first / 'images.npy', first_photos)
            np.save(first / 'labels.npy', np.array([0, 1, 0], dtype=np.int32))
            np.save(first / 'origins.npy', np.array([0, 1, 2], dtype=np.int8))
            np.save(first / 'splits.npy', np.array([TRAIN, VALIDATION, SEALED], dtype=np.int8))
            (first / 'dishes.json').write_text(json.dumps(['apple pie', 'satay']), encoding='utf-8')
            (first / 'test_dishes.json').write_text(json.dumps(['abalone', 'zucchini bread']), encoding='utf-8')

            # A training block: one photo already held, one with no dish name, one held back by its fingerprint and two for the pool
            block_photos = fake_photos(5, seed=2)
            (blocks / 'names.json').write_text(json.dumps({'train': {'0': 'Apple_pie', '1': 'Satay'}, 'test': {'0': 'Zucchini_bread', '1': 'Abalone'}}), encoding='utf-8')
            np.savez(blocks / 'train_000_000.npz', photos=block_photos, categories=np.array([0, 7, 0, 1, 1]), hashes=np.array([difference_hash(first_photos[0]), 11, 20, 21, 22], dtype=np.uint64))

            # A test block: one new photo, and one with the fingerprint of a pool photo
            test_photos = fake_photos(2, seed=3)
            np.savez(blocks / 'test_000_000.npz', photos=test_photos, categories=np.array([1, 0]), hashes=np.array([33, 21], dtype=np.uint64))

            with patch('vision.prepare_global.BLOCKS', blocks), patch.multiple('vision.prepare_full', GLOBAL_PREPARED=first, FULL_PREPARED=joined, RESULTS=results), patch('builtins.print'):
                join_photos()

            # By hand: the test block sorts first, abalone is label 0 of its own list, and only new photos follow the first join
            images = np.load(joined / 'images.npy')
            self.assertEqual(len(images), 8)
            self.assertTrue((images[:3] == first_photos).all() and (images[3:5] == test_photos).all() and (images[5:] == block_photos[2:]).all())
            self.assertEqual(np.load(joined / 'labels.npy').tolist(), [0, 1, 0, 0, 1, 0, 1, 1])
            self.assertEqual(np.load(joined / 'origins.npy').tolist(), [0, 1, 2, 2, 2, 2, 2, 2])
            self.assertEqual(json.loads((joined / 'test_dishes.json').read_text(encoding='utf-8')), ['abalone', 'zucchini bread'])

            # By hand: the first join keeps its splits, the copy is dropped, and one of the dish's two pool photos goes to validation
            splits = np.load(joined / 'splits.npy').tolist()
            self.assertEqual(splits[:6], [TRAIN, VALIDATION, SEALED, FRESH_UNSEEN, DROPPED, FRESH_TRAINED])
            self.assertEqual(sorted(splits[6:]), [TRAIN, VALIDATION])


class StrengthTests(unittest.TestCase):
    def merged_weight(self, **options):
        """Return the fake block's weight after loading a checkpoint whose correction adds 0.2 and 0.4 to the first column."""
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            checkpoint = Path(folder) / 'lora.pt'
            trained = add_lora(fake_matcher(), rank=1, alpha=1.0, train_head=False)
            trained.blocks[0][0].up.weight.data = torch.tensor([[0.2], [0.4]])
            trained.blocks[0][0].down.weight.data = torch.tensor([[1.0, 0.0]])
            torch.save(trained.state_dict(), checkpoint)
            with patch.multiple('vision.run_global', GLOBAL_SETTINGS=Settings(rank=1, alpha=1.0), matcher_for=lambda *args: fake_matcher(), read_global_dishes=lambda: ['a', 'b'], with_names=lambda vision, names, device: vision):
                return trained_matcher(['a', 'b'], 'cpu', checkpoint=checkpoint, **options).block[0][0].weight

    def test_the_phone_model_is_merged_at_full_strength_by_default(self):
        self.assertTrue(torch.allclose(self.merged_weight(), torch.tensor([[1.2, 0.0], [0.4, 1.0]])))

    def test_the_new_model_is_merged_at_the_chosen_strength(self):
        # By hand: the identity plus half of the correction
        self.assertTrue(torch.allclose(self.merged_weight(strength=0.5), torch.tensor([[1.1, 0.0], [0.2, 1.0]])))


class UnseenReportTests(unittest.TestCase):
    def test_a_test_label_is_turned_into_a_name_before_it_is_scored(self):
        # By hand: test label 1 is crudo, at position 2 on offer, and is right first time; abalone is at position 1, found only in the top five
        top = torch.tensor([[2, 0, 0, 0, 0], [0, 1, 1, 1, 1]])
        report = unseen_report(top, torch.tensor([1, 0]), ['abalone', 'crudo'], {'satay': 0, 'abalone': 1, 'crudo': 2}, {'abalone'})
        self.assertEqual(report, {'never_trained': {'photos': 1, 'top1': 1.0, 'top5': 1.0}, 'trained_under_that_name': {'photos': 1, 'top1': 0.0, 'top5': 1.0}})


class ShipRuleTests(unittest.TestCase):
    def report(self, trained, never_trained, malaysian):
        """Return the three scores the rule reads."""
        return {'fresh_trained': {'top1': trained}, 'never_trained': {'top1': never_trained}, 'malaysian_validation': {'top1': malaysian}}

    def test_both_groups_count_equally(self):
        self.assertAlmostEqual(average_top1(self.report(0.8, 0.4, 0.9)), 0.6)

    def test_a_higher_average_and_a_steady_malaysian_score_ship(self):
        self.assertTrue(replaces_phone(self.report(0.75, 0.5, 0.9), self.report(0.8, 0.35, 0.9)))

    def test_an_equal_average_does_not_ship(self):
        self.assertFalse(replaces_phone(self.report(0.75, 0.5, 0.9), self.report(0.75, 0.5, 0.9)))

    def test_a_malaysian_fall_beyond_the_margin_does_not_ship(self):
        # By hand: the average is far better, but the Malaysian score falls by a half and only a quarter is allowed here
        self.assertFalse(replaces_phone(self.report(0.9, 0.9, 0.25), self.report(0.5, 0.5, 0.75), margin=0.25))

    def test_a_malaysian_fall_of_exactly_the_margin_still_ships(self):
        self.assertTrue(replaces_phone(self.report(0.9, 0.9, 0.5), self.report(0.5, 0.5, 0.75), margin=0.25))


class FullTrainingTests(unittest.TestCase):
    def test_training_reads_the_full_join_and_leaves_the_phone_checkpoint_alone(self):
        make_loader, save_result = MagicMock(), MagicMock()
        trained = {'state_dict': {}, 'best_epoch': 1, 'best_valid': 0.5, 'history': []}
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            with patch.multiple('vision.run_global', CHECKPOINTS=Path(folder), make_loader=make_loader, matcher_for=lambda *args: fake_matcher(), read_global_dishes=lambda: ['a', 'b'], save_result=save_result, train_lora=MagicMock(return_value=trained)), patch('vision.run_global.torch.save') as saved, patch('builtins.print'):
                train()
        self.assertEqual([call.args[0] for call in make_loader.call_args_list], [FULL_PREPARED, FULL_PREPARED])
        self.assertEqual(saved.call_args.args[1], FULL_CHECKPOINT)
        self.assertEqual(save_result.call_args.args[0], 'global_full_lora.json')


class FinalStageTests(unittest.TestCase):
    def run_final(self, new_is_right_on_malaysian):
        """Run the sealed stage on fake versions, where only the new model knows the unseen dish, and return what it records and builds."""
        right = {(PHONE_MODEL, 'trained'), (PHONE_MODEL, 'malaysian'), (NEW_MODEL, 'trained'), (NEW_MODEL, 'unseen')} | ({(NEW_MODEL, 'malaysian')} if new_is_right_on_malaysian else set())
        built, saved = [], MagicMock()

        def builder(version):
            """Return a stand-in for building a version, which notes the names it was given."""
            def build(names):
                built.append((version, names))
                return version
            return build

        def guesses(version, loader, device):
            """Return one photo of dish 0, which on the unseen list is the name at position 2."""
            correct = 2 if loader == 'unseen' else 0
            return torch.tensor([[correct if (version, loader) in right else 1, 3, 4, 5, 6]]), torch.tensor([0])

        fake_versions = {version: builder(version) for version in ('siglip2_alone', PHONE_MODEL, NEW_MODEL, 'new_model_at_full_strength')}
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            (Path(folder) / 'test_dishes.json').write_text(json.dumps(['crudo']), encoding='utf-8')
            with patch.multiple('vision.run_full', RESULTS=Path(folder), FULL_PREPARED=Path(folder), read_global_dishes=lambda: ['rice'], food_names=lambda dishes: ['rice', 'satay'], dishes_with_training_photos=lambda dishes, joined: {'rice'}, versions=lambda device: fake_versions, predict_top=guesses, save_result=saved,
                                centre_loader=lambda split, settings: {FRESH_TRAINED: 'trained', FRESH_UNSEEN: 'unseen'}[split], malaysian_loader=lambda settings: 'malaysian'), patch('builtins.print'):
                final()
        return saved.call_args.args, built

    def test_the_rule_decides_from_the_scores_of_the_new_and_phone_models(self):
        # By hand: the new model averages 1.0 against the phone's 0.5, and both are right on the Malaysian photo
        (name, record), _built = self.run_final(new_is_right_on_malaysian=True)
        self.assertEqual(name, 'global_full_final.json')
        self.assertTrue(record['ships'])
        self.assertEqual(record['averages'][NEW_MODEL], 1.0)
        self.assertEqual(record['averages'][PHONE_MODEL], 0.5)

    def test_a_better_average_cannot_outvote_the_malaysian_check(self):
        (_name, record), _built = self.run_final(new_is_right_on_malaysian=False)
        self.assertFalse(record['ships'])

    def test_a_dish_known_only_by_name_is_scored_with_that_name_on_offer(self):
        (_name, record), built = self.run_final(new_is_right_on_malaysian=True)
        self.assertIn((NEW_MODEL, ['rice', 'satay', 'crudo']), built)
        self.assertEqual(record['reports'][NEW_MODEL]['never_trained'], {'photos': 1, 'top1': 1.0, 'top5': 1.0})
        self.assertEqual(record['names_on_offer'], {'phone': 2, 'with_test_dishes': 3})


class OnceOnlyTests(unittest.TestCase):
    def test_the_fresh_photos_cannot_be_scored_twice(self):
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as folder:
            (Path(folder) / 'global_full_final.json').write_text('{}', encoding='utf-8')
            with patch('vision.run_full.RESULTS', Path(folder)), self.assertRaises(SystemExit):
                final()

    def test_a_model_that_did_not_pass_is_never_installed(self):
        with patch('vision.run_full.read_result', return_value={'ships': False}), patch('vision.run_full.install_checked') as install:
            with self.assertRaises(SystemExit):
                export()
        install.assert_not_called()


if __name__ == '__main__':
    unittest.main()
