"""Check the fictional families and the family-grouped split, with no third-party packages."""
import json
import unittest
from collections import Counter
from router.data import DATA, LABELS, SPLIT_SIZES, assign_splits, load_families, load_split, normalise


class FamilyTests(unittest.TestCase):
    """Keep the dataset balanced, unique and free of anything that is not a family."""

    def test_six_labels_with_eighteen_families_each(self):
        """Hold 18 independent scenarios per class, as the router protocol asks."""
        families = load_families()
        self.assertEqual(Counter(family['label'] for family in families), {label: 18 for label in LABELS})

    def test_every_utterance_is_unique_across_families(self):
        """Refuse a message that appears twice, because it could land in two splits."""
        texts = [normalise(text) for family in load_families() for text in family['utterances']]
        self.assertEqual(len(texts), len(set(texts)))

    def test_families_have_variants_and_ids_match_labels(self):
        """Give each family several variants, and an ID that names its class."""
        for family in load_families():
            self.assertGreaterEqual(len(family['utterances']), 4, family['id'])
            self.assertTrue(family['id'].startswith(family['label'] + '-'), family['id'])

    def test_malformed_family_is_rejected(self):
        """Reject an unknown label instead of training on it."""
        path = DATA / 'families.json'
        broken = json.loads(path.read_text(encoding='utf-8'))
        broken['families'][0]['label'] = 'snack'
        with self.assertRaises(ValueError):
            load_families(document=broken)


class SplitTests(unittest.TestCase):
    """Assign whole families to splits before any variant is looked at."""

    def test_committed_manifest_matches_the_seeded_assignment(self):
        """Regenerate the split from the seed, so nobody can hand-edit it unnoticed."""
        manifest = json.loads((DATA / 'split_manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(manifest['families'], assign_splits(load_families()))

    def test_twelve_three_three_families_per_class_and_no_overlap(self):
        """Cut each class 12 / 3 / 3, with every family in exactly one split."""
        manifest = assign_splits(load_families())
        seen = [family_id for ids in manifest.values() for family_id in ids]
        self.assertEqual(len(seen), len(set(seen)))
        self.assertEqual(len(seen), len(LABELS) * 18)
        for split, size in SPLIT_SIZES.items():
            per_class = Counter(family_id.rsplit('-', 1)[0] for family_id in manifest[split])
            self.assertEqual(per_class, {label: size for label in LABELS}, split)

    def test_variants_stay_with_their_family(self):
        """Never let a variant of a training family appear in validation."""
        train_texts = set(normalise(text) for text in load_split('train').texts)
        validation_texts = set(normalise(text) for text in load_split('validation').texts)
        self.assertFalse(train_texts & validation_texts)
        self.assertEqual(len(load_split('validation').texts), len(LABELS) * 3 * 4)

    def test_test_split_is_sealed_until_the_final_evaluation(self):
        """Refuse to read the test families unless the final evaluation asks for them."""
        with self.assertRaises(PermissionError):
            load_split('test')
        self.assertEqual(len(load_split('test', final=True).texts), len(LABELS) * 3 * 4)


if __name__ == '__main__':
    unittest.main()
