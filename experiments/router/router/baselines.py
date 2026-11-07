"""
Transparent baselines the learned router has to beat: majority class, keyword rules and TF-IDF.

The keyword lists come from general diary language, written before looking at results.
The same author wrote every split, which held-out families reduce but cannot remove.
"""
import re
from collections import Counter
from .data import LABELS, SEED

# Words that mean a logged entry should change, checked first because they also mention food or sets
CORRECTION = re.compile(r"\b(actually|undo|revert|correction|fix|wrong|instead|rename|restore|undelete|duplicate|delete|remove|swap|replace|change|make (it|that))\b")
# Question shapes and words that ask about the diary rather than add to it
SUMMARY = re.compile(r"\?|\bhow (much|many|long|active|heavy)\b|\bwhat (did|was|have|'s|is)\b|\b(total|totals|so far|summary|overview|show|list|average|compare|streak)\b")
# Words for each logging class; a message matching two of them is about two things
LOGGING = {
    'sleep': re.compile(r"\b(slept|sleep|sleeping|asleep|nap|napped|naps|bed|bedtime|woke|wake|insomnia|siesta)\b"),
    'workout': re.compile(r"\b(ran|run|running|jog|jogged|km|sets?|reps?|\d+ ?x ?\d+|squats?|bench|rows?|deadlifts?|push ?-?ups?|pull ?-?ups?|planks?|gym|workout|training|yoga|swim|swam|walk|walked|cycled|cycling|bike|hiit|lunges?|treadmill|rest day)\b"),
    'meal': re.compile(r"\b(ate|eaten|breakfast|lunch|dinner|supper|snack|ml|plate|cup|slice|slices|bowl|coffee|tea|teh|kopi|milk|rice|nasi|roti|mee|noodles|eggs?|toast|salad|burger|pizza|smoothie|yogh?urt|shake|banana|apple)\b"),
}


def majority_label(labels):
    """Return the most common training label, taking the earlier label in LABELS on a tie."""
    counts = Counter(labels)
    return max(LABELS, key=lambda label: (counts[label], -LABELS.index(label)))


def keyword_rules(text):
    """
    Return (label, accepted) from ordered keyword rules.

    Correction words win, then question shapes; otherwise exactly one logging class must
    match. No match, or a match for two logging classes, abstains as "other", so the app
    shows the buttons instead of guessing.
    """
    lowered = text.lower()
    if CORRECTION.search(lowered):
        return 'correction', True
    if SUMMARY.search(lowered):
        return 'daily_summary', True

    # Ignore a message about two things, because one form cannot hold both
    matched = [label for label, pattern in LOGGING.items() if pattern.search(lowered)]
    if len(matched) == 1:
        return matched[0], True
    return 'other', False


def fit_tfidf(train, validation):
    """
    Return a TF-IDF and logistic regression pipeline, with its strength C chosen on validation.

    Word pairs catch phrases such as "rest day"; character pieces tolerate typos such as
    "protien". Ties between strengths keep the smaller C, the simpler model.
    """
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline, make_union
    from .metrics import macro_f1

    best, best_score, best_strength = None, -1.0, None
    for strength in (0.1, 1.0, 10.0):
        model = make_pipeline(
            make_union(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True),
                       TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5), sublinear_tf=True)),
            LogisticRegression(C=strength, max_iter=2000, class_weight='balanced', random_state=SEED))
        model.fit(train.texts, train.labels)
        score = macro_f1(validation.labels, list(model.predict(validation.texts)))
        # Keep a stronger setting only when it is strictly better on validation
        if score > best_score:
            best, best_score, best_strength = model, score, strength
    return best, best_strength
