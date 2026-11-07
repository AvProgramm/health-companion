"""Check the evaluation numbers against values worked out by hand."""
import importlib.util
import unittest

# Scikit-learn computes macro-F1, and is only installed in the router environment
HAS_SKLEARN = importlib.util.find_spec('sklearn') is not None


@unittest.skipUnless(HAS_SKLEARN, 'scikit-learn is only installed in the router environment')
class MetricTests(unittest.TestCase):
    """Report accuracy, macro-F1, coverage and critical errors honestly."""

    def test_macro_f1_matches_a_hand_calculation(self):
        """Average F1 over all six classes, counting a class nobody predicted as zero."""
        from router.metrics import macro_f1
        true = ['meal', 'meal', 'sleep', 'sleep']
        predicted = ['meal', 'sleep', 'sleep', 'sleep']
        # meal: precision 1, recall 0.5, F1 2/3; sleep: precision 2/3, recall 1, F1 0.8; four absent classes: 0
        self.assertAlmostEqual(macro_f1(true, predicted), (2 / 3 + 0.8) / 6)
        # A training loop passes label indices (meal is 0, sleep is 3); the answer must not change
        self.assertAlmostEqual(macro_f1([0, 0, 3, 3], [0, 3, 3, 3]), (2 / 3 + 0.8) / 6)

    def test_report_counts_coverage_and_errors_among_accepted(self):
        """Measure errors only on the messages the router did not abstain on."""
        from router.metrics import report
        true = ['meal', 'sleep', 'other', 'workout']
        predicted = ['meal', 'workout', 'meal', 'workout']
        accepted = [True, True, True, False]
        result = report(true, predicted, accepted)
        self.assertEqual(result['coverage'], 0.75)
        self.assertAlmostEqual(result['error_among_accepted'], 2 / 3)
        # Opening a meal form for an "other" message is critical; a wrong log class is not
        self.assertEqual(result['critical_errors'], 1)

    def test_threshold_is_the_smallest_with_few_enough_errors(self):
        """Choose the lowest confidence that keeps accepted errors at or under the limit."""
        from router.metrics import choose_threshold
        confidences = [0.95, 0.9, 0.6, 0.55]
        correct = [True, True, False, True]
        self.assertEqual(choose_threshold(confidences, correct, max_error=0.0), 0.65)
        self.assertEqual(choose_threshold(confidences, correct, max_error=0.34), 0.3)
        # With every message wrong, nothing is safe to accept
        self.assertEqual(choose_threshold([0.9, 0.8], [False, False], max_error=0.0), 1.0)


if __name__ == '__main__':
    unittest.main()
