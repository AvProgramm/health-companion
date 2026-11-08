"""Check the router head and its training code against small problems with known answers."""
import importlib.util
import unittest

# PyTorch and scikit-learn are only installed in the router environment, not in CI
HAS_TORCH = all(importlib.util.find_spec(name) is not None for name in ('torch', 'sklearn'))


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


@unittest.skipUnless(HAS_TORCH, 'PyTorch and scikit-learn are only installed in the router environment')
class HeadTests(unittest.TestCase):
    """Check the layer, seeding and the checkpoint record."""

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


@unittest.skipUnless(HAS_TORCH, 'PyTorch and scikit-learn are only installed in the router environment')
class TrainingTests(unittest.TestCase):
    """Check the Dataset, forward pass, training loop, scoring and confusion matrix."""

    def test_dataset_returns_a_vector_and_a_label(self):
        """Return one 384-number vector and its label index."""
        import torch
        from router.train import VectorDataset
        dataset = VectorDataset(torch.randn(5, 384), [0, 1, 2, 3, 4])
        vector, label = dataset[2]
        self.assertEqual(len(dataset), 5)
        self.assertEqual(tuple(vector.shape), (384,))
        self.assertEqual(int(label), 2)

    def test_forward_returns_one_logit_per_class(self):
        """Map a batch of 8 vectors to 8 rows of 6 raw logits."""
        import torch
        from router.train import IntentHead
        self.assertEqual(tuple(IntentHead()(torch.randn(8, 384)).shape), (8, 6))

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

    def test_confusion_matrix_counts_each_pair(self):
        """Count true labels by row and predictions by column."""
        from router.train import confusion_matrix
        self.assertEqual(confusion_matrix([0, 0, 1], [0, 1, 1], classes=3), [[1, 1, 0], [0, 1, 0], [0, 0, 0]])

    def test_keeps_the_best_validation_weights_and_stops_after_patience(self):
        """Return the best epoch's weights rather than the last, and stop PATIENCE epochs after it."""
        import copy
        from unittest.mock import patch
        import torch
        from torch.utils.data import DataLoader
        from router import train as training
        labels, right, wrong = torch.arange(6), torch.eye(6), torch.eye(6)[[0, 1, 2, 0, 1, 2]]
        seen = []

        def scripted_score(model, loader, device='cpu'):
            """Record each epoch's weights, and make only the second epoch score perfectly."""
            seen.append(copy.deepcopy(model.state_dict()))
            return (right if len(seen) == 2 else wrong), labels

        vectors, targets = toy_vectors(5, seed=3)
        loader = DataLoader(training.VectorDataset(vectors, targets.tolist()), batch_size=8)
        with patch.object(training, 'score', scripted_score):
            result = training.train_model(training.IntentHead(), loader, loader, learning_rate=0.01)
        self.assertEqual(result['best_epoch'], 2)
        self.assertEqual(len(result['history']), 2 + training.PATIENCE)
        self.assertTrue(torch.equal(result['state_dict']['linear.weight'], seen[1]['linear.weight']))
        self.assertFalse(torch.equal(result['state_dict']['linear.weight'], seen[-1]['linear.weight']))

    def test_epoch_loss_is_averaged_over_every_message(self):
        """Match the whole-dataset loss, even with a short last batch (the old BaseTrainer bug)."""
        import torch
        from torch.utils.data import DataLoader
        from router.train import IntentHead, VectorDataset, seed_all, train_model
        seed_all()
        vectors, targets = toy_vectors(5, seed=4)
        head = IntentHead()
        # A learning rate of zero leaves the weights alone, so the loss can be worked out directly
        expected = torch.nn.functional.cross_entropy(head.linear(vectors), targets).item()
        loader = DataLoader(VectorDataset(vectors, targets.tolist()), batch_size=8)
        result = train_model(head, loader, loader, learning_rate=0.0, max_epochs=1)
        self.assertAlmostEqual(result['history'][0]['train_loss'], expected, places=5)


if __name__ == '__main__':
    unittest.main()
