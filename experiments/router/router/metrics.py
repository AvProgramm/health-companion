"""Measure a router honestly: macro-F1 over all six classes, coverage, and the errors that matter."""
from sklearn.metrics import accuracy_score, f1_score, recall_score
from .data import LABELS

# Classes that open a form to log or change something
LOG_CLASSES = ('meal', 'workout', 'sleep', 'correction')
# Classes that must never be turned into a logging form
NON_LOG_CLASSES = ('daily_summary', 'other')
# Confidence thresholds tried on validation, from permissive to strict
THRESHOLDS = [round(0.3 + 0.05 * step, 2) for step in range(14)]


def names(values):
    """Return label names for label indices (0-5), so callers may pass either."""
    return [LABELS[int(value)] if not isinstance(value, str) else value for value in values]


def macro_f1(true, predicted):
    """
    Return F1 averaged over all six classes, from label names or label indices.

    A class that was never predicted or never present counts as zero, so a router
    cannot look good by ignoring a rare class.
    """
    return float(f1_score(names(true), names(predicted), labels=LABELS, average='macro', zero_division=0))


def report(true, predicted, accepted=None):
    """
    Return the numbers the router is judged on, for one split.

    Accepted messages are the ones the router was confident about; the rest fall back
    to the Meal / Gym / Sleep buttons, so errors are counted among accepted ones only.
    """
    if accepted is None:
        accepted = [True] * len(true)
    kept = [index for index, keep in enumerate(accepted) if keep]

    # Count wrong answers the person would actually see
    wrong = sum(1 for index in kept if predicted[index] != true[index])
    # A critical error opens a logging form for a question or something out of scope
    critical = sum(1 for index in kept if predicted[index] in LOG_CLASSES and true[index] in NON_LOG_CLASSES)
    recalls = recall_score(true, predicted, labels=LABELS, average=None, zero_division=0)
    return {
        'messages': len(true),
        'accuracy': float(accuracy_score(true, predicted)),
        'macro_f1': macro_f1(true, predicted),
        'recall_per_class': {label: float(value) for label, value in zip(LABELS, recalls)},
        'coverage': len(kept) / len(true) if true else 0.0,
        'error_among_accepted': wrong / len(kept) if kept else 0.0,
        'critical_errors': critical,
    }


def choose_threshold(confidences, correct, max_error=0.05):
    """
    Return the lowest confidence threshold whose accepted errors stay within max_error.

    Chosen on validation only. If no threshold accepts anything safely, return 1.0,
    which means the router always abstains and the buttons are shown instead.
    """
    for threshold in THRESHOLDS:
        accepted = [is_correct for confidence, is_correct in zip(confidences, correct) if confidence >= threshold]
        # Ignore a threshold that accepts nothing, because it says nothing about errors
        if accepted and (accepted.count(False) / len(accepted)) <= max_error:
            return threshold
    return 1.0
