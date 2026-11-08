"""Filter the bundled exercise library for the AI Trainer, with no model involved."""
import json
from pathlib import Path

# The index the web app bundles, so the coach and the phone always agree on the facts
LIBRARY = Path(__file__).resolve().parents[3] / 'apps' / 'web' / 'src' / 'data' / 'exercise-index.json'
# Difficulty in increasing order, because a person's level is a ceiling and not an exact match
LEVELS = ('beginner', 'intermediate', 'expert')
# The source categories a training block can be built from; stretches, strongman and Olympic lifts are left out
TRAINABLE_KINDS = ('strength', 'plyometrics', 'powerlifting', 'cardio')


def load_library():
    """Return every entry in the bundled exercise index."""
    return json.loads(LIBRARY.read_text(encoding='utf-8'))['entries']


def can_choose(entry, areas, equipment, level):
    """
    Return whether an exercise may be offered to the Trainer at all.

    These are the filters that must run before a model sees anything, because a model
    cannot pick what it is never shown.
    """
    # Ignore an exercise outside the chosen areas, including one the planner cannot place
    if entry['category'] not in areas:
        return False

    # Ignore unknown kit, because unknown is not the same as bodyweight
    if entry['equipment'] is None or not set(entry['equipment']) <= set(equipment):
        return False

    # Ignore a stretch or specialist lift, because it is not a training block
    if entry['kind'] not in TRAINABLE_KINDS:
        return False

    # Ignore an unknown level or anything harder than the person's level
    return entry['level'] in LEVELS and LEVELS.index(entry['level']) <= LEVELS.index(level)


def preference(entry, level):
    """
    Return the sort key that puts the most useful exercise for a muscle first.

    Compound lifts train more at once, and the level closest to the person's ceiling
    gives enough challenge. The ID settles any tie, so the order never depends on luck.
    """
    return entry['mechanic'] != 'compound', LEVELS.index(level) - LEVELS.index(entry['level']), entry['id']


def spread_by_muscle(entries, limit):
    """
    Return up to limit entries, taking one per primary muscle in each round.

    The library is alphabetical, so a plain slice would keep only names near the start.
    Rounds give every muscle a place before any muscle gets a second one.
    """
    # Group the entries by primary muscle, keeping their order within each group
    groups = {}
    for entry in entries:
        groups.setdefault(entry['primaryMuscles'][0] if entry['primaryMuscles'] else entry['id'], []).append(entry)

    # Take one entry from each group per round until the limit or the entries run out
    chosen = []
    while len(chosen) < limit and any(groups.values()):
        for muscle in sorted(groups):
            if groups[muscle] and len(chosen) < limit:
                chosen.append(groups[muscle].pop(0))

    # Return the entries in the order they were chosen
    return chosen


def search_exercises(entries, areas, equipment, level, limit):
    """
    Return up to limit library entries the Trainer may choose from.

    entries comes from load_library. areas is a list such as ['push', 'legs'], equipment
    is the kit available today ([] means none), and level is 'beginner', 'intermediate'
    or 'expert'. No model runs here, so whatever this leaves out can never reach one.
    """
    # Keep only what the person could actually do today
    allowed = [entry for entry in entries if can_choose(entry, areas, equipment, level)]

    # Put the most useful exercise for each muscle first
    allowed.sort(key=lambda entry: preference(entry, level))

    # Return a varied shortlist rather than the first names in the alphabet
    return spread_by_muscle(allowed, limit)
