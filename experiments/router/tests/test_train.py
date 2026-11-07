"""
Check the router head and Yash's training code.

YASH: the tests marked expectedFailure fail while your parts in router/train.py raise
NotImplementedError. When one reports "unexpected success", remove its decorator.
"""
import importlib.util
import unittest

# PyTorch is only installed in the router environment, not in CI
HAS_TORCH = importlib.util.find_spec('torch') is not None


def toy_vectors(per_class, seed):
    """
    Return six well-separated clusters of unit vectors with their label indices, for a quick check.

    Every split shares the same six cluster centres; only the noise around them depends on seed.
    """
    import torch
    centres = torch.nn.functional.normalize(torch.randn(6, 384, generator=torch.Generator().manual_seed(0)), dim=1)
    labels = torch.arange(6).repeat_interleave(per_class)
    noise = 0.05 * torch.randn(len(labels), 384, generator=torch.Generator().manual_seed(seed))
    return torch.nn.functional.normalize(centres[labels] + noise, dim=1), labels


@unittest.skipUnless(HAS_TORCH, 'PyTorch is only installed in the router environment')
class HeadTests(unittest.TestCase):
    """Parts already provided: the layer, seeding and the checkpoint record."""

    def test_head_has_2310_trainable_parameters(self):
        """Train only Linear(384, 6): 6 x 384 weights plus 6 biases."""
        from router.train import IntentHead
        head = IntentHead()
        self.assertEqual(sum(parameter.numel() for parameter in head.parameters() if parameter.requires_grad), 2310)

    def test_seed_all_repeats_random_draws(self):
        """Give the same random numbers after seeding twice."""
        import torch
        from router.train import seed_all
        seed_all()
        first = torch.rand(3)
        seed_all()
        self.assertTrue(torch.equal(first, torch.rand(3)))

    def test_checkpoint_records_the_architecture(self):
        """Save what the weights belong to, beside the weights."""
        from router.train import IntentHead, checkpoint
        saved = checkpoint(IntentHead(), learning_rate=0.001, threshold=0.7, revision='abc')
        self.assertIn('Linear(384, 6)', saved['architecture'])
        self.assertEqual(set(saved['state_dict']), {'linear.weight', 'linear.bias'})


@unittest.skipUnless(HAS_TORCH, 'PyTorch is only installed in the router environment')
class YashTrainingTests(unittest.TestCase):
    """Yash's parts: Dataset, forward, training loop, scoring and the confusion matrix."""

    @unittest.expectedFailure
    def test_dataset_returns_a_vector_and_a_label(self):
        """Return one 384-number vector and its label index."""
        import torch
        from router.train import VectorDataset
        dataset = VectorDataset(torch.randn(5, 384), [0, 1, 2, 3, 4])
        vector, label = dataset[2]
        self.assertEqual(len(dataset), 5)
        self.assertEqual(tuple(vector.shape), (384,))
        self.assertEqual(int(label), 2)

    @unittest.expectedFailure
    def test_forward_returns_one_logit_per_class(self):
        """Map a batch of 8 vectors to 8 rows of 6 raw logits."""
        import torch
        from router.train import IntentHead
        self.assertEqual(tuple(IntentHead()(torch.randn(8, 384)).shape), (8, 6))

    @unittest.expectedFailure
    def test_training_learns_a_separable_toy_problem(self):
        """Reach validation macro-F1 of at least 0.95 on six easy clusters, within 20 epochs."""
        import torch
        from torch.utils.data import DataLoader
        from router.metrics import macro_f1
        from router.train import IntentHead, VectorDataset, score, seed_all, train_model
        seed_all()
        train_x, train_y = toy_vectors(30, seed=1)
        valid_x, valid_y = toy_vectors(10, seed=2)
        train_loader = DataLoader(VectorDataset(train_x, train_y.tolist()), batch_size=32, shuffle=True)
        valid_loader = DataLoader(VectorDataset(valid_x, valid_y.tolist()), batch_size=64)
        head = IntentHead()
        result = train_model(head, train_loader, valid_loader, learning_rate=0.003)
        head.load_state_dict(result['state_dict'])
        probabilities, labels = score(head, valid_loader)
        self.assertLessEqual(len(result['history']), 20)
        self.assertGreaterEqual(macro_f1(labels.tolist(), probabilities.argmax(dim=1).tolist()), 0.95)

    @unittest.expectedFailure
    def test_score_runs_in_eval_mode_without_gradients(self):
        """Return probabilities that sum to one, with no gradient attached."""
        import torch
        from torch.utils.data import DataLoader
        from router.train import IntentHead, VectorDataset, score
        loader = DataLoader(VectorDataset(torch.randn(10, 384), [0] * 10), batch_size=4)
        head = IntentHead()
        probabilities, labels = score(head, loader)
        self.assertFalse(head.training)
        self.assertFalse(probabilities.requires_grad)
        self.assertEqual(tuple(probabilities.shape), (10, 6))
        self.assertTrue(torch.allclose(probabilities.sum(dim=1), torch.ones(10), atol=1e-5))

    @unittest.expectedFailure
    def test_confusion_matrix_counts_each_pair(self):
        """Count true labels by row and predictions by column."""
        from router.train import confusion_matrix
        self.assertEqual(confusion_matrix([0, 0, 1], [0, 1, 1], classes=3), [[1, 1, 0], [0, 1, 0], [0, 0, 0]])


if __name__ == '__main__':
    unittest.main()
