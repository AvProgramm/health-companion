"""Check the frozen encoder's pooling, with the real model only when it is already downloaded."""
import importlib.util
import unittest

# PyTorch is only installed in the router environment, not in CI
HAS_TORCH = importlib.util.find_spec('torch') is not None


@unittest.skipUnless(HAS_TORCH, 'PyTorch is only installed in the router environment')
class PoolingTests(unittest.TestCase):
    """Average real tokens only, then scale every sentence vector to length one."""

    def test_mean_pool_ignores_padding(self):
        """Leave the padded third token out of the average."""
        import torch
        from router.encoder import mean_pool
        last_hidden = torch.tensor([[[1.0, 1.0], [3.0, 3.0], [100.0, 100.0]]])
        mask = torch.tensor([[1, 1, 0]])
        self.assertTrue(torch.equal(mean_pool(last_hidden, mask), torch.tensor([[2.0, 2.0]])))

    def test_sentence_vectors_have_unit_length(self):
        """Normalise each pooled vector, so cosine similarity is a dot product."""
        import torch
        from router.encoder import sentence_vectors
        last_hidden = torch.randn(4, 5, 384)
        mask = torch.tensor([[1, 1, 1, 0, 0]] * 4)
        vectors = sentence_vectors(last_hidden, mask)
        self.assertEqual(tuple(vectors.shape), (4, 384))
        self.assertTrue(torch.allclose(vectors.norm(dim=1), torch.ones(4), atol=1e-6))


@unittest.skipUnless(HAS_TORCH, 'PyTorch is only installed in the router environment')
class EncoderTests(unittest.TestCase):
    """Load the pinned MiniLM from the local cache only, and keep every weight frozen."""

    def setUp(self):
        """Skip when the pinned model has not been downloaded on this machine."""
        from router.encoder import model_available
        if not model_available():
            self.skipTest('The pinned all-MiniLM-L6-v2 files are not in the local Hugging Face cache.')

    def test_encoder_is_frozen_and_returns_384_numbers(self):
        """Encode two messages with no trainable encoder parameter."""
        import torch
        from router.encoder import encode, load_encoder
        tokenizer, model = load_encoder(local_only=True)
        self.assertFalse(any(parameter.requires_grad for parameter in model.parameters()))
        self.assertFalse(model.training)
        vectors = encode(['ate 2 eggs', 'slept 8 hours'], tokenizer, model)
        self.assertEqual(tuple(vectors.shape), (2, 384))
        self.assertTrue(torch.allclose(vectors.norm(dim=1), torch.ones(2), atol=1e-5))


if __name__ == '__main__':
    unittest.main()
