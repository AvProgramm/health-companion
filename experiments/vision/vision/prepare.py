"""Decode every photo once into one array, and fix the train, validation and sealed splits."""
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
from PIL import Image
from .config import DATASETS, PREPARED, RESULTS, SEED, STORED_SIZE, Settings
from .download import dataset_folder

# The published split each dataset keeps apart, which becomes the sealed test
SEALED_SPLITS = {'food101': 'validation', 'malaysian': 'test'}
# Decoding threads; decoding a JPEG releases Python's lock, so threads are enough
DECODE_THREADS = 12
# What each photo is used for
TRAIN, VALIDATION, SEALED, DROPPED = 0, 1, 2, -1


def label_names(path):
    """Return the dish names stored in a parquet file's metadata, in label-index order."""
    info = json.loads(pq.read_schema(path).metadata[b'huggingface'])
    return info['info']['features']['label']['names']


def merged_labels(names_by_source):
    """Return one sorted list of dish names, so a dish found in two datasets is one class."""
    return sorted({name for names in names_by_source.values() for name in names})


def square_photo(data, size=STORED_SIZE):
    """Return a photo as a square RGB array, or None if it cannot be read."""
    # Ignore an unreadable photo, because there is nothing to learn from it
    try:
        picture = Image.open(io.BytesIO(data)).convert('RGB')
    except (OSError, ValueError):
        return None

    # Scale the short side to the stored size, keeping the shape of the plate
    width, height = picture.size
    scale = size / min(width, height)
    picture = picture.resize((max(size, round(width * scale)), max(size, round(height * scale))), Image.BILINEAR)

    # Cut out the centre square
    left, top = (picture.width - size) // 2, (picture.height - size) // 2
    return np.asarray(picture.crop((left, top, left + size, top + size)), dtype=np.uint8)


def difference_hash(photo):
    """Return a 64-bit fingerprint of how brightness changes across a small grey copy."""
    small = np.asarray(Image.fromarray(photo).convert('L').resize((9, 8), Image.BILINEAR), dtype=np.int16)
    return int.from_bytes(np.packbits(small[:, 1:] > small[:, :-1]).tobytes(), 'big')


def decode_row(data):
    """Return (square photo, fingerprint) for one stored image, or None if it cannot be read."""
    photo = square_photo(data)
    return None if photo is None else (photo, difference_hash(photo))


def assign_splits(labels, origins, sealed, hashes, share, seed=SEED):
    """
    Return one split code per photo, so that no copy of a sealed photo is ever trained on.

    A photo with the same fingerprint as a training photo is dropped from the sealed set.
    Inside the training pool, copies of a photo move together into train or validation.
    """
    # Start with everything dropped; an unreadable photo has label -1 and stays dropped
    splits = np.full(len(labels), DROPPED, dtype=np.int8)
    usable, generator = labels >= 0, np.random.default_rng(seed)
    pool = usable & ~sealed

    # Seal the published test photos, except any that also appear in the training pool
    seen_in_training = np.unique(hashes[pool])
    splits[usable & sealed & ~np.isin(hashes, seen_in_training)] = SEALED

    # Hold back a share of each dish from each dataset, so every dish is measured
    splits[pool] = TRAIN
    for origin in np.unique(origins[pool]):
        for label in np.unique(labels[pool & (origins == origin)]):
            members = np.flatnonzero(pool & (origins == origin) & (labels == label))
            groups = np.unique(hashes[members])
            generator.shuffle(groups)
            held_back = groups[:max(1, round(share * len(groups)))]
            splits[members[np.isin(hashes[members], held_back)]] = VALIDATION

    # Return the finished assignment
    return splits


def list_sources():
    """Return (dataset name, parquet path, is sealed) for every file, and each dataset's dish names."""
    sources, names_by_source = [], {}
    for name in DATASETS:
        files = sorted(Path(dataset_folder(name)).rglob('*.parquet'))
        names_by_source[name] = label_names(files[0])
        sources += [(name, path, path.name.startswith(SEALED_SPLITS[name])) for path in files]
    return sources, names_by_source


def decode_all(sources, names_by_source, dishes, folder):
    """Write every photo into images.npy, and return its labels, origins, sealed flags and hashes."""
    # Initialise one fixed-size slot per photo
    total = sum(pq.read_metadata(path).num_rows for _name, path, _sealed in sources)
    images = np.lib.format.open_memmap(folder / 'images.npy', mode='w+', dtype=np.uint8, shape=(total, STORED_SIZE, STORED_SIZE, 3))
    labels, origins = np.full(total, -1, dtype=np.int32), np.zeros(total, dtype=np.int8)
    sealed_flags, hashes = np.zeros(total, dtype=bool), np.zeros(total, dtype=np.uint64)
    index_of = {name: position for position, name in enumerate(dishes)}
    source_number = {name: position for position, name in enumerate(DATASETS)}

    # Decode batch by batch, leaving an unreadable photo's slot unlabelled
    position = 0
    with ThreadPoolExecutor(max_workers=DECODE_THREADS) as pool:
        for name, path, sealed in sources:
            for batch in pq.ParquetFile(path).iter_batches(batch_size=256, columns=['image', 'label']):
                rows = batch.to_pylist()
                for row, decoded in zip(rows, pool.map(decode_row, [row['image']['bytes'] for row in rows])):
                    if decoded is not None:
                        images[position], hashes[position] = decoded
                        labels[position] = index_of[names_by_source[name][row['label']]]
                        origins[position], sealed_flags[position] = source_number[name], sealed
                    position += 1
            print('decoded', name, path.name, position, 'of', total, flush=True)

    # Return the facts about each photo
    images.flush()
    return labels, origins, sealed_flags, hashes


def main():
    """Prepare everything training needs, and record the counts."""
    # Merge the dish lists and decode the photos
    PREPARED.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    sources, names_by_source = list_sources()
    dishes = merged_labels(names_by_source)
    labels, origins, sealed, hashes = decode_all(sources, names_by_source, dishes, PREPARED)

    # Fix the splits once, then save them
    splits = assign_splits(labels, origins, sealed, hashes, Settings().validation_share)
    for name, values in (('labels', labels), ('origins', origins), ('splits', splits)):
        np.save(PREPARED / f'{name}.npy', values)
    (PREPARED / 'dishes.json').write_text(json.dumps(dishes), encoding='utf-8')

    # Record the counts, including how many copies were kept out of the sealed set
    counts = {'dishes': len(dishes), 'photos': len(labels), 'unreadable': int((labels < 0).sum()), 'train': int((splits == TRAIN).sum()), 'validation': int((splits == VALIDATION).sum()),
              'sealed': int((splits == SEALED).sum()), 'sealed_dropped_as_copies': int((sealed & (labels >= 0) & (splits == DROPPED)).sum()), 'only_in_malaysian': sorted(set(names_by_source['malaysian']) - set(names_by_source['food101']))}
    (RESULTS / 'prepare.json').write_text(json.dumps(counts, indent=2) + '\n', encoding='utf-8')
    print(counts, flush=True)


if __name__ == '__main__':
    main()
