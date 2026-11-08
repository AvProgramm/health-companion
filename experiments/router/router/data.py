"""Load the fictional intent families and assign them to splits by family, not by message."""
import json
import random
import re
from dataclasses import dataclass
from pathlib import Path

# The six things a diary message can ask for, in the fixed order used for tensor indices
LABELS = ['meal', 'correction', 'workout', 'sleep', 'daily_summary', 'other']
# Families per class in each split, assigned before any variant is read
SPLIT_SIZES = {'train': 12, 'validation': 3, 'test': 3}
# Yash's FIT3181 seed, reused so every run assigns the same families
SEED = 34871500
# The folder holding families.json and the committed split manifest
DATA = Path(__file__).resolve().parents[1] / 'data'


@dataclass
class Split:
    """Hold one split's messages with their labels and families, index for index."""
    texts: list
    labels: list
    families: list


def normalise(text):
    """Return a message in lower case with single spaces, for duplicate checks."""
    return re.sub(r'\s+', ' ', text.strip().lower())


def load_families(document=None):
    """
    Return the families from families.json after checking every label and message.

    A malformed family raises ValueError rather than being skipped, because a silently
    missing family would unbalance the classes.
    """
    if document is None:
        document = json.loads((DATA / 'families.json').read_text(encoding='utf-8'))
    families = document['families']
    for family in families:
        # Refuse an unknown label or an empty message, because training on it would be silently wrong
        if family.get('label') not in LABELS:
            raise ValueError(f"Family {family.get('id')} has an unknown label {family.get('label')!r}.")
        if not family.get('utterances') or any(not isinstance(text, str) or not text.strip() for text in family['utterances']):
            raise ValueError(f"Family {family.get('id')} needs at least one non-empty message.")
    return families


def assign_splits(families, seed=SEED):
    """
    Return the family IDs in each split: each class shuffled with a fixed seed, then cut 12 / 3 / 3.

    Whole families move together, so a variant of a training scenario can never be used to test it.
    """
    rng = random.Random(seed)
    manifest = {split: [] for split in SPLIT_SIZES}
    for label in LABELS:
        # Shuffle this class's families in a fixed order so the cut is the same every run
        ids = sorted(family['id'] for family in families if family['label'] == label)
        rng.shuffle(ids)
        start = 0
        for split, size in SPLIT_SIZES.items():
            manifest[split].extend(sorted(ids[start:start + size]))
            start += size
    return manifest


def load_split(name, final=False):
    """
    Return one split's messages, labels and family IDs from the committed manifest.

    The test split is sealed: it is read only when final=True, by the one final evaluation.
    """
    # Ignore a request for the test families before the final evaluation, because looking early leaks them
    if name == 'test' and not final:
        raise PermissionError('The test split is sealed until the final evaluation.')
    manifest = json.loads((DATA / 'split_manifest.json').read_text(encoding='utf-8'))
    chosen = set(manifest['families'][name])
    split = Split(texts=[], labels=[], families=[])
    for family in load_families():
        if family['id'] in chosen:
            for text in family['utterances']:
                split.texts.append(text)
                split.labels.append(family['label'])
                split.families.append(family['id'])
    return split


def write_manifest():
    """Write the seeded split manifest next to the families, for review in Git."""
    manifest = {'seed': SEED, 'sizes': SPLIT_SIZES, 'families': assign_splits(load_families())}
    (DATA / 'split_manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')


# Write the manifest only when run as a command, never on import
if __name__ == '__main__':
    write_manifest()
