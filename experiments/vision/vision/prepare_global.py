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


def main():
    """Write one array of photos with labels, origins and splits, and record the counts."""
    # Read the first experiment's facts and the ISIA dish names
    GLOBAL_PREPARED.mkdir(parents=True, exist_ok=True)
    old_dishes = json.loads((PREPARED / 'dishes.json').read_text(encoding='utf-8'))
    old_labels, old_origins, old_splits = np.load(PREPARED / 'labels.npy'), np.load(PREPARED / 'origins.npy'), np.load(PREPARED / 'splits.npy')
    old_images = np.load(PREPARED / 'images.npy', mmap_mode='r')
    isia_named = {int(key): value for key, value in json.loads((BLOCKS / 'names.json').read_text(encoding='utf-8')).items()}
    dishes = global_names(old_dishes, isia_named.values())

    # Count the ISIA photos, then make one fixed-size slot per photo
    paths = block_paths()
    rows = [np.load(path)['categories'] for path in paths]
    total = len(old_labels) + sum(len(row) for row in rows)
    images = np.lib.format.open_memmap(GLOBAL_PREPARED / 'images.npy', mode='w+', dtype=np.uint8, shape=(total, STORED_SIZE, STORED_SIZE, 3))

    # Copy the first experiment's photos unchanged, moving their labels to the shared list
    for start in range(0, len(old_labels), COPY_STEP):
        images[start:start + COPY_STEP] = old_images[start:start + COPY_STEP]
    old_lookup = label_lookup(old_dishes, dishes)
    new_old_labels = np.where(old_labels >= 0, old_lookup[old_labels.clip(min=0)], -1)
    position_of = {dish: index for index, dish in enumerate(dishes)}

    # Copy the ISIA photos, leaving out any whose dish never received a name
    position = len(old_labels)
    isia_labels, isia_sealed, isia_hashes = [], [], []
    for path, categories in zip(paths, rows):
        with np.load(path) as block:
            photos, hashes = block['photos'], block['hashes']
        for index, category in enumerate(categories.tolist()):
            if category in isia_named:
                images[position] = photos[index]
                isia_labels.append(position_of[readable(isia_named[category])])
                isia_sealed.append(path.name.startswith('test'))
                isia_hashes.append(hashes[index])
                position += 1
    images.flush()

    # Fingerprint the first experiment's training photos, so copies stay out of the new sealed set
    training = np.flatnonzero(old_splits != 2)
    with ThreadPoolExecutor(max_workers=THREADS) as pool:
        training_hashes = np.array(list(pool.map(lambda index: difference_hash(old_images[index]), training.tolist())), dtype=np.uint64)

    # Split ISIA, then join every array in the same order as the photos
    labels_array, sealed_array, hashes_array = np.array(isia_labels, dtype=np.int32), np.array(isia_sealed, dtype=bool), np.array(isia_hashes, dtype=np.uint64)
    splits = isia_splits(labels_array, sealed_array, hashes_array, training_hashes, Settings().validation_share)
    unused = total - position
    np.save(GLOBAL_PREPARED / 'labels.npy', np.concatenate([new_old_labels, labels_array, np.full(unused, -1, dtype=np.int32)]))
    np.save(GLOBAL_PREPARED / 'origins.npy', np.concatenate([old_origins, np.full(len(labels_array) + unused, ISIA_ORIGIN, dtype=np.int8)]))
    np.save(GLOBAL_PREPARED / 'splits.npy', np.concatenate([old_splits, splits, np.full(unused, DROPPED, dtype=np.int8)]))
    (GLOBAL_PREPARED / 'dishes.json').write_text(json.dumps(dishes), encoding='utf-8')

    # Record the counts
    counts = {'dishes': len(dishes), 'isia_dish_names': len(isia_named), 'isia_blocks': len(paths), 'isia_photos': len(labels_array), 'isia_train': int((splits == 0).sum()), 'isia_validation': int((splits == 1).sum()), 'isia_sealed': int((splits == 2).sum()), 'isia_sealed_dropped_as_copies': int((sealed_array & (splits == DROPPED)).sum()), 'photos_in_total': int(position)}
    (RESULTS / 'prepare_global.json').write_text(json.dumps(counts, indent=2) + '\n', encoding='utf-8')
    print(counts, flush=True)



if __name__ == '__main__':
    main()
