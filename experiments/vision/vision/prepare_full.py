"""
Add every ISIA photo the first join does not hold, keeping fresh sealed photos out of training.

From experiments/vision:  python -m vision.prepare_full

The first join stays where it is, because the phone's model was trained from it, and each of
its photos keeps its split here. Only photos it does not hold are added, so no model has been
trained on them and nobody has looked at them.

Two fresh sealed sets are cut from those new photos. One photo in ten of the training dishes
is held back, chosen by its fingerprint so a photo and its copies always fall on the same side.
ISIA's test files hold 100 dishes of their own, so their new photos are a fresh test of dishes
known only by name.

Written by Claude Code at Yash's request on 9 Nov 2026, for him to cross-check.
"""
import json
import numpy as np
from .config import FULL_PREPARED, GLOBAL_PREPARED, RESULTS, STORED_SIZE, Settings
from .prepare import DROPPED, TRAIN, VALIDATION, assign_splits
from .prepare_global import ISIA_ORIGIN, block_paths, copy_in_steps, fingerprints, read_isia_names
from .zero_shot import readable

# One fingerprint in this many is held back as fresh sealed photos of the trained dishes
HELD_BACK_EVERY = 10
# The two fresh sealed sets: dishes that are trained, and dishes known only by name; unlike any earlier split code
FRESH_TRAINED, FRESH_UNSEEN = 3, 4
# Blocks written between flushes, because 100 GB of unwritten pages would crowd out everything else on a 32 GB laptop
FLUSH_EVERY = 64


def new_positions(categories, hashes, named, held):
    """Return where a block's new photos are: those with a dish name that the first join does not hold."""
    return np.flatnonzero(np.isin(categories, list(named)) & ~np.isin(hashes, held))


def fresh_splits(labels, is_test, hashes, share):
    """
    Return one split code per new photo, so that no copy of a fresh sealed photo is ever trained on.

    A held-back photo and its copies share a fingerprint, so they stay together. A test
    photo with the fingerprint of a photo in the training pool is dropped, as a copy.
    """
    # Hold back one fingerprint in every few of the trained dishes, and pool the rest
    held_back = ~is_test & (hashes % HELD_BACK_EVERY == 0)
    pool = ~is_test & ~held_back
    splits = np.full(len(labels), DROPPED, dtype=np.int8)
    splits[held_back] = FRESH_TRAINED

    # Hold back a share of each dish for validation, moving copies together
    pool_size = int(pool.sum())
    splits[pool] = assign_splits(labels[pool], np.full(pool_size, ISIA_ORIGIN, dtype=np.int8), np.zeros(pool_size, dtype=bool), hashes[pool], share)

    # Seal the test photos, except any copy of a photo in the training pool
    splits[is_test & ~np.isin(hashes, hashes[pool])] = FRESH_UNSEEN
    return splits


def find_new_photos(paths, named, held):
    """Return (path, is a test file, positions, categories, fingerprints) of the new photos in each block."""
    found = []
    for path in paths:
        # A test photo's category counts along the test dishes, because those are different dishes
        is_test = path.name.startswith('test')
        with np.load(path) as block:
            categories, hashes = block['categories'], block['hashes']
        keep = new_positions(categories, hashes, named['test' if is_test else 'train'], held)
        found.append((path, is_test, keep, categories[keep], hashes[keep]))
    return found


def main():
    """Write the first join and every new photo into one array, mark the fresh sealed sets, and record the counts."""
    # Read the first join, which is only ever read here
    FULL_PREPARED.mkdir(parents=True, exist_ok=True)
    old_labels, old_origins, old_splits = (np.load(GLOBAL_PREPARED / f'{name}.npy') for name in ('labels', 'origins', 'splits'))
    old_images = np.load(GLOBAL_PREPARED / 'images.npy', mmap_mode='r')
    dishes, test_dishes = (json.loads((GLOBAL_PREPARED / name).read_text(encoding='utf-8')) for name in ('dishes.json', 'test_dishes.json'))

    # Find the new photos, because nothing the first join holds can count as fresh
    named = read_isia_names()
    found = find_new_photos(block_paths(), named, fingerprints(old_images, np.flatnonzero(old_labels >= 0)))
    added = sum(len(keep) for _path, _is_test, keep, _categories, _hashes in found)
    print('new photos', added, 'in', len(found), 'blocks', flush=True)

    # Make one slot per photo, and copy the first join unchanged
    images = np.lib.format.open_memmap(FULL_PREPARED / 'images.npy', mode='w+', dtype=np.uint8, shape=(len(old_labels) + added, STORED_SIZE, STORED_SIZE, 3))
    copy_in_steps(old_images, images)
    print('first join copied', flush=True)

    # Add the new photos, numbering each one along its own list of dishes
    position_of = {dish: index for index, dish in enumerate(dishes)}
    position_of_test = {dish: index for index, dish in enumerate(test_dishes)}
    position, new_labels, new_is_test, new_hashes = len(old_labels), [], [], []
    for count, (path, is_test, keep, categories, hashes) in enumerate(found, start=1):
        names, lookup = (named['test'], position_of_test) if is_test else (named['train'], position_of)
        with np.load(path) as block:
            images[position:position + len(keep)] = block['photos'][keep]
        new_labels += [lookup[readable(names[category])] for category in categories.tolist()]
        new_is_test += [is_test] * len(keep)
        new_hashes.append(hashes)
        position += len(keep)
        if count % FLUSH_EVERY == 0:
            images.flush()
            print('blocks written', count, 'of', len(found), flush=True)
    images.flush()

    # Fix the splits of the new photos, then join every array in the same order as the photos
    labels_array, is_test_array, hashes_array = np.array(new_labels, dtype=np.int32), np.array(new_is_test, dtype=bool), np.concatenate(new_hashes)
    splits = fresh_splits(labels_array, is_test_array, hashes_array, Settings().validation_share)
    np.save(FULL_PREPARED / 'labels.npy', np.concatenate([old_labels, labels_array]))
    np.save(FULL_PREPARED / 'origins.npy', np.concatenate([old_origins, np.full(added, ISIA_ORIGIN, dtype=np.int8)]))
    np.save(FULL_PREPARED / 'splits.npy', np.concatenate([old_splits, splits]))
    for name, values in (('dishes.json', dishes), ('test_dishes.json', test_dishes)):
        (FULL_PREPARED / name).write_text(json.dumps(values), encoding='utf-8')

    # Record the counts, including how many test photos were dropped as copies
    counts = {'photos_in_total': len(old_labels) + added, 'isia_blocks': len(found), 'new_photos': added, 'new_train': int((splits == TRAIN).sum()), 'new_validation': int((splits == VALIDATION).sum()), 'fresh_trained': int((splits == FRESH_TRAINED).sum()),
              'fresh_unseen': int((splits == FRESH_UNSEEN).sum()), 'fresh_unseen_dropped_as_copies': int((is_test_array & (splits == DROPPED)).sum())}
    (RESULTS / 'prepare_full.json').write_text(json.dumps(counts, indent=2) + '\n', encoding='utf-8')
    print(counts, flush=True)


if __name__ == '__main__':
    main()
