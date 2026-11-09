"""Download the food photos and ViT weights at their pinned revisions."""
from huggingface_hub import snapshot_download
from .config import BACKBONES, DATASETS, HUB_CACHE


def dataset_folder(name, offline=True):
    """Return the local snapshot of one dataset, fetching only its parquet files if allowed."""
    repo, revision = DATASETS[name]
    return snapshot_download(repo, repo_type='dataset', revision=revision, allow_patterns=['*.parquet'], cache_dir=HUB_CACHE, local_files_only=offline)


def weights_folder(name, offline=True):
    """Return the local snapshot of one backbone, fetching only safetensors if allowed."""
    repo, revision, _model_name = BACKBONES[name]
    return snapshot_download(repo, revision=revision, allow_patterns=['model.safetensors'], cache_dir=HUB_CACHE, local_files_only=offline)


def main():
    """Fetch every pinned snapshot, resuming anything an earlier run left unfinished."""
    # Fetch the small weights first, so a slow dataset cannot hold them up
    for name in BACKBONES:
        print('weights', name, weights_folder(name, offline=False), flush=True)

    # Then fetch the photos
    for name in DATASETS:
        print('dataset', name, dataset_folder(name, offline=False), flush=True)


if __name__ == '__main__':
    main()
