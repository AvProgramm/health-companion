"""
Fetch an even sample of ISIA Food-500, one block of 100 photos at a time.

All 44 GB would take nearly five hours on this connection. The files are sorted by dish and
stored in blocks of 100 photos, so taking every fourth block keeps every dish represented
at about a quarter of the cost. The rest can be fetched later by lowering SAMPLE_EVERY.
"""
import json
import random
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import pyarrow.parquet as pq
from huggingface_hub import HfFileSystem
from .config import DATA_ROOT, LARGE_DATASETS, SEED
from .prepare import decode_row

# Keep one block in this many
SAMPLE_EVERY = 4
# Where the decoded blocks are kept, so a dropped connection loses one block at most
BLOCKS = DATA_ROOT / 'isia'
# Several connections at once, so the line stays busy while one of them waits
CONNECTIONS = 6
# How many times to retry one file before moving on; a later run picks up what is left
ATTEMPTS = 4
# Read-ahead per request; the default of 5 MB would fetch most of a file just to read its small columns
READ_AHEAD = 2 ** 16


def shard_paths(system):
    """Return every parquet file of the pinned ISIA snapshot, in a fixed order."""
    repo, revision = LARGE_DATASETS['isia']
    return sorted(system.glob(f'datasets/{repo}@{revision}/data/*.parquet'))


def blocks_to_fetch(count, shard, every=SAMPLE_EVERY):
    """Return which blocks of a file to fetch, starting somewhere different in each file."""
    return list(range(shard % every, count, every))


def split_of(path):
    """Return 'train' or 'test' from a parquet file's name."""
    return 'test' if path.rsplit('/', 1)[1].startswith('test') else 'train'


def names_seen(categories, names):
    """Return the dish name of each category number that has one in these rows."""
    return {int(category): name for category, name in zip(categories, names) if name is not None}


def fetch_names(paths):
    """Save the dish name of every category, read from two small columns of each file."""
    BLOCKS.mkdir(parents=True, exist_ok=True)

    def read_one(path):
        """Return the names found in one file."""
        with HfFileSystem(skip_instance_cache=True).open(path, 'rb', block_size=READ_AHEAD) as handle:
            table = pq.ParquetFile(handle).read(columns=['category', 'cat'])
        return names_seen(table.column('category').to_pylist(), table.column('cat').to_pylist())

    # Merge what every file knows, because only some rows carry a name
    found = {}
    with ThreadPoolExecutor(max_workers=CONNECTIONS) as pool:
        for names in pool.map(read_one, paths):
            found.update(names)
    (BLOCKS / 'names.json').write_text(json.dumps(found), encoding='utf-8')
    print('dish names', len(found), flush=True)


def fetch_block(parquet, block, target):
    """Decode one block and save it, writing to a temporary name so a crash leaves nothing half-done."""
    table = parquet.read_row_group(block, columns=['image', 'category'])
    decoded = [decode_row(item['bytes']) for item in table.column('image').to_pylist()]
    keep = [position for position, item in enumerate(decoded) if item is not None]
    categories = table.column('category').to_pylist()

    # Save only readable photos, with what is needed to split them later
    partial = target.with_suffix('.partial.npz')
    np.savez(partial, photos=np.stack([decoded[position][0] for position in keep]), categories=np.array([categories[position] for position in keep], dtype=np.int32),
             hashes=np.array([decoded[position][1] for position in keep], dtype=np.uint64))
    partial.replace(target)


def fetch_shard(job):
    """Fetch the chosen blocks of one file, skipping any already saved, and return how many are missing."""
    shard, path = job
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with HfFileSystem(skip_instance_cache=True).open(path, 'rb', block_size=READ_AHEAD) as handle:
                parquet = pq.ParquetFile(handle)
                for block in blocks_to_fetch(parquet.metadata.num_row_groups, shard):
                    target = BLOCKS / f'{split_of(path)}_{shard:03d}_{block:03d}.npz'
                    if not target.exists():
                        fetch_block(parquet, block, target)
            return 0
        except (OSError, ValueError) as problem:
            # Ignore a dropped connection for now, because the blocks already saved are kept
            print('retrying', shard, 'attempt', attempt, type(problem).__name__, flush=True)
    return 1


def main():
    """Fetch the dish names and the sampled blocks, reporting progress file by file."""
    paths = shard_paths(HfFileSystem())
    if not (BLOCKS / 'names.json').exists():
        fetch_names(paths)

    # Fetch in a random order, so stopping early still leaves every dish represented
    jobs = list(enumerate(paths))
    random.Random(SEED).shuffle(jobs)

    # Fetch several files at once, and report how many gave up
    failed, done = 0, 0
    with ThreadPoolExecutor(max_workers=CONNECTIONS) as pool:
        for missing in pool.map(fetch_shard, jobs):
            failed += missing
            done += 1
            print('files done', done, 'of', len(paths), 'blocks saved', len(list(BLOCKS.glob('*.npz'))), flush=True)
    print('finished; files that gave up:', failed, flush=True)
    raise SystemExit(1 if failed else 0)


if __name__ == '__main__':
    main()
