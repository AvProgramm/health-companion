"""Check food-name matching against values worked out by hand, with no real model."""
import tempfile
import unittest
from pathlib import Path

# Skip quietly where PyTorch and transformers are not installed, as in CI
try:
    import torch
    from torch import nn
    from vision.zero_shot import PROMPTS, food_names, match, name_vectors, photo_vectors, readable
except ImportError as missing:
    raise unittest.SkipTest(f'The vision environment is not installed: {missing}.')


class FakeTokeniser:
    """Encode each prompt as one number: how many words it has."""

    def __call__(self, texts, **_settings):
        return FakeEncoded(torch.tensor([[float(len(text.split()))] for text in texts]))


class FakeEncoded(dict):
    """Behave like the tokeniser's output, which can be moved to a device."""

    def __init__(self, tokens):
        super().__init__(input_ids=tokens)

    def to(self, _device):
        return self


class FakeModel(nn.Module):
    """Give a text and a photo known vectors, so the results can be worked out by hand."""

    def get_text_features(self, input_ids):
        return torch.cat([input_ids, torch.zeros_like(input_ids)], dim=1)

    def get_image_features(self, pixel_values):
        return pixel_values


class FoodNameTests(unittest.TestCase):
    def test_names_read_as_words(self):
        self.assertEqual(readable(' Nasi_Lemak '), 'nasi lemak')

    def test_dishes_come_first_and_each_name_appears_once(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'foods.txt'
            path.write_text('almonds\nNasi Lemak\n\nalmonds\n', encoding='utf-8')
            self.assertEqual(food_names(['nasi_lemak', 'satay'], path), ['nasi lemak', 'satay', 'almonds'])

    def test_the_real_list_has_what_the_datasets_lack(self):
        names = food_names([])
        for food in ('almonds', 'chicken rice', 'char kuey teow', 'banana', 'teh tarik'):
            self.assertIn(food, names)
        self.assertEqual(len(names), len(set(names)))


class MatchingTests(unittest.TestCase):
    def test_match_ranks_by_cosine_worked_by_hand(self):
        names = torch.eye(6)
        # The photo is closest to name 2, then name 4, then name 0
        photo = torch.tensor([[0.1, 0.0, 0.9, 0.0, 0.4, 0.0]])
        self.assertEqual(match(photo, names).tolist()[0][:3], [2, 4, 0])

    def test_match_copes_with_fewer_names_than_guesses(self):
        self.assertEqual(tuple(match(torch.eye(2), torch.eye(2)).shape), (2, 2))

    def test_name_vectors_are_unit_length(self):
        vectors = name_vectors(FakeModel(), FakeTokeniser(), ['satay', 'nasi lemak'], 'cpu')
        self.assertTrue(torch.allclose(vectors.norm(dim=1), torch.ones(2)))

    def test_wordings_are_averaged(self):
        # Each fake text vector is [words, 0], so every wording points the same way
        vectors = name_vectors(FakeModel(), FakeTokeniser(), ['satay'], 'cpu', prompts=PROMPTS)
        self.assertTrue(torch.allclose(vectors, torch.tensor([[1.0, 0.0]])))

    def test_photo_vectors_are_unit_length_and_keep_their_order(self):
        loader = [(torch.tensor([[3.0, 4.0]]), torch.tensor([7])), (torch.tensor([[0.0, 2.0]]), torch.tensor([1]))]
        vectors, labels = photo_vectors(FakeModel(), loader, 'cpu')
        self.assertTrue(torch.allclose(vectors, torch.tensor([[0.6, 0.8], [0.0, 1.0]])))
        self.assertEqual(labels.tolist(), [7, 1])


if __name__ == '__main__':
    unittest.main()
