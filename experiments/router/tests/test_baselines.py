"""Check the baselines the learned router has to beat."""
import importlib.util
import unittest
from router.baselines import keyword_rules, majority_label
from router.data import load_split

# Scikit-learn is only installed in the router environment, not in CI
HAS_SKLEARN = importlib.util.find_spec('sklearn') is not None


class KeywordTests(unittest.TestCase):
    """Keep the keyword rules readable and predictable; new messages, not dataset ones."""

    def test_one_clear_class_is_accepted(self):
        """Accept a message that matches exactly one class."""
        for text, label in [('ate 3 dumplings', 'meal'), ('slept 10 to 6', 'sleep'), ('ran 8 km', 'workout'),
                            ('actually make it 2 cups', 'correction'), ('how much fat have I eaten?', 'daily_summary')]:
            self.assertEqual(keyword_rules(text), (label, True), text)

    def test_two_logging_classes_abstain_as_other(self):
        """Treat a message about two things as other, and abstain, because the app should ask."""
        self.assertEqual(keyword_rules('ran 8 km then ate dumplings'), ('other', False))

    def test_no_match_abstains_as_other(self):
        """Abstain on a message no rule recognises."""
        self.assertEqual(keyword_rules('lovely day'), ('other', False))

    def test_majority_label_breaks_ties_in_label_order(self):
        """Pick the most common label, and the earlier label on a tie."""
        self.assertEqual(majority_label(['sleep', 'meal', 'meal', 'sleep']), 'meal')
        self.assertEqual(majority_label(['other', 'other', 'workout']), 'other')


@unittest.skipUnless(HAS_SKLEARN, 'scikit-learn is only installed in the router environment')
class TfidfTests(unittest.TestCase):
    """Fit TF-IDF and logistic regression on training families, choosing C on validation."""

    def test_beats_the_majority_baseline_on_validation(self):
        """Learn something real from the training families."""
        from router.baselines import fit_tfidf
        from router.metrics import macro_f1
        train, validation = load_split('train'), load_split('validation')
        model, strength = fit_tfidf(train, validation)
        predicted = list(model.predict(validation.texts))
        majority = [majority_label(train.labels)] * len(validation.texts)
        self.assertIn(strength, (0.1, 1.0, 10.0))
        self.assertGreater(macro_f1(validation.labels, predicted), macro_f1(validation.labels, majority))

    def test_same_data_gives_the_same_model(self):
        """Give identical predictions on a second fit, so results can be reproduced."""
        from router.baselines import fit_tfidf
        train, validation = load_split('train'), load_split('validation')
        first, _ = fit_tfidf(train, validation)
        second, _ = fit_tfidf(train, validation)
        self.assertEqual(list(first.predict(validation.texts)), list(second.predict(validation.texts)))


if __name__ == '__main__':
    unittest.main()
