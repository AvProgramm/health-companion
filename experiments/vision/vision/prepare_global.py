"""Join the first experiment's photos and the ISIA sample into one array with shared dish names."""
import json
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from .config import GLOBAL_PREPARED, PREPARED, RESULTS, STORED_SIZE, Settings
from .isia import BLOCKS
from .prepare import DROPPED, assign_splits, difference_hash
from .zero_shot import readable

# Marks a photo as coming from ISIA; the first experiment's photos are 0 and 1
ISIA_ORIGIN = 2
# Decoding threads for the fingerprints of the first experiment's photos
THREADS = 12
# Photos copied per step, to keep memory use small
COPY_STEP = 4096


def global_names(old_dishes, isia_names):
    """Return every dish once, as words, so a dish in two datasets is one class."""
    return sorted({readable(name) for name in old_dishes} | {readable(name) for name in isia_names})


def label_lookup(names, dishes):
    """Return the global index of each name, as an array in the order given."""
    position = {dish: index for index, dish in enumerate(dishes)}
    return np.array([position[readable(name)] for name in names], dtype=np.int32)


def isia_splits(labels, sealed, hashes, training_hashes, share):
    """
    Return one split code per ISIA photo, keeping copies of any training photo out of the sealed set.

    ISIA's published test split becomes the new sealed set. A photo seen in the first
    experiment's training photos is dropped from it too, because that would be a copy.
    """
    splits = assign_splits(labels, np.full(len(labels), ISIA_ORIGIN, dtype=np.int8), sealed, hashes, share)
    splits[sealed & np.isin(hashes, training_hashes)] = DROPPED
    return splits


def block_paths():
    """Return every finished block, in a fixed order."""
    return sorted(path for path in BLOCKS.glob('*.npz') if not path.name.endswith('.partial.npz'))


def read_isia_names():
    """Return each split's dish names, with the category numbers as integers."""
    stored = json.loads((BLOCKS / 'names.json').read_text(encoding='utf-8'))
    return {split: {int(key): value for key, value in names.items()} for split, names in stored.items()}


def copy_in_steps(source, target):
    """Copy photos to the start of a larger array, a step at a time to keep memory use small."""
    for start in range(0, len(source), COPY_STEP):
        # The last step can be short, so size the target from what was actually read
        step_photos = source[start:start + COPY_STEP]
        target[start:start + len(step_photos)] = step_photos

        # Write this step out now, because gigabytes of unwritten pages would crowd out everything else
        target.flush()


def fingerprints(images, positions):
    """Return the fingerprint of the photo at each of these positions."""
    with ThreadPoolExecutor(max_workers=THREADS) as pool:
        return np.array(list(pool.map(lambda index: difference_hash(images[index]), positions.tolist())), dtype=np.uint64)


def main():
    """Write one array of photos with labels, origins and splits, and record the counts."""
    # Read the first experiment's facts and the ISIA dish names
    GLOBAL_PREPARED.mkdir(parents=True, exist_ok=True)
    old_dishes = json.loads((PREPARED / 'dishes.json').read_text(encoding='utf-8'))
    old_labels, old_origins, old_splits = np.load(PREPARED / 'labels.npy'), np.load(PREPARED / 'origins.npy'), np.load(PREPARED / 'splits.npy')
    old_images = np.load(PREPARED / 'images.npy', mmap_mode='r')
    isia_named = read_isia_names()
    dishes = global_names(old_dishes, isia_named['train'].values())
    test_dishes = sorted({readable(name) for name in isia_named['test'].values()})

    # Count the ISIA photos, then make one fixed-size slot per photo
    paths = block_paths()
    rows = [np.load(path)['categories'] for path in paths]
    total = len(old_labels) + sum(len(row) for row in rows)
    images = np.lib.format.open_memmap(GLOBAL_PREPARED / 'images.npy', mode='w+', dtype=np.uint8, shape=(total, STORED_SIZE, STORED_SIZE, 3))

    # Copy the first experiment's photos unchanged, moving their labels to the shared list
    copy_in_steps(old_images, images)
    old_lookup = label_lookup(old_dishes, dishes)
    new_old_labels = np.where(old_labels >= 0, old_lookup[old_labels.clip(min=0)], -1)
    position_of = {dish: index for index, dish in enumerate(dishes)}
    position_of_test = {dish: index for index, dish in enumerate(test_dishes)}

    # Copy the ISIA photos, leaving out any whose dish never received a name
    position = len(old_labels)
    isia_labels, isia_sealed, isia_hashes = [], [], []
    for path, categories in zip(paths, rows):
        # A test photo's label counts along the test dishes, because those are different dishes
        is_test = path.name.startswith('test')
        named, lookup = (isia_named['test'], position_of_test) if is_test else (isia_named['train'], position_of)
        with np.load(path) as block:
            photos, hashes = block['photos'], block['hashes']
        for index, category in enumerate(categories.tolist()):
            if category in named:
                images[position] = photos[index]
                isia_labels.append(lookup[readable(named[category])])
                isia_sealed.append(is_test)
                isia_hashes.append(hashes[index])
                position += 1
    images.flush()

    # Fingerprint the first experiment's training photos, so copies stay out of the new sealed set
    training_hashes = fingerprints(old_images, np.flatnonzero(old_splits != 2))

    # Split ISIA, then join every array in the same order as the photos
    labels_array, sealed_array, hashes_array = np.array(isia_labels, dtype=np.int32), np.array(isia_sealed, dtype=bool), np.array(isia_hashes, dtype=np.uint64)
    splits = isia_splits(labels_array, sealed_array, hashes_array, training_hashes, Settings().validation_share)
    unused = total - position
    np.save(GLOBAL_PREPARED / 'labels.npy', np.concatenate([new_old_labels, labels_array, np.full(unused, -1, dtype=np.int32)]))
    np.save(GLOBAL_PREPARED / 'origins.npy', np.concatenate([old_origins, np.full(len(labels_array) + unused, ISIA_ORIGIN, dtype=np.int8)]))
    np.save(GLOBAL_PREPARED / 'splits.npy', np.concatenate([old_splits, splits, np.full(unused, DROPPED, dtype=np.int8)]))
    (GLOBAL_PREPARED / 'dishes.json').write_text(json.dumps(dishes), encoding='utf-8')
    (GLOBAL_PREPARED / 'test_dishes.json').write_text(json.dumps(test_dishes), encoding='utf-8')

    # Record the counts
    counts = {'dishes': len(dishes), 'isia_dish_names': len(isia_named['train']), 'isia_test_dishes': len(test_dishes), 'isia_blocks': len(paths), 'isia_photos': len(labels_array), 'isia_train': int((splits == 0).sum()), 'isia_validation': int((splits == 1).sum()), 'isia_sealed': int((splits == 2).sum()), 'isia_sealed_dropped_as_copies': int((sealed_array & (splits == DROPPED)).sum()), 'photos_in_total': int(position)}
    (RESULTS / 'prepare_global.json').write_text(json.dumps(counts, indent=2) + '\n', encoding='utf-8')
    print(counts, flush=True)



if __name__ == '__main__':
    main()
