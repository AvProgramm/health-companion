"""Download the food photos and ViT weights at their pinned revisions."""
import sys
from huggingface_hub import snapshot_download
from .config import BACKBONES, DATASETS, HUB_CACHE, LARGE_DATASETS, SIGLIP


def dataset_folder(name, offline=True):
    """Return the local snapshot of one dataset, fetching only its parquet files if allowed."""
    repo, revision = DATASETS[name]
    return snapshot_download(repo, repo_type='dataset', revision=revision, allow_patterns=['*.parquet'], cache_dir=HUB_CACHE, local_files_only=offline)


def weights_folder(name, offline=True):
    """Return the local snapshot of one backbone, fetching only safetensors if allowed."""
    repo, revision, _model_name = BACKBONES[name]
    return snapshot_download(repo, revision=revision, allow_patterns=['model.safetensors'], cache_dir=HUB_CACHE, local_files_only=offline)


def large_dataset_folder(name, offline=True):
    """Return the local snapshot of one large dataset, fetching only its parquet files if allowed."""
    repo, revision = LARGE_DATASETS[name]
    return snapshot_download(repo, repo_type='dataset', revision=revision, allow_patterns=['*.parquet'], cache_dir=HUB_CACHE, local_files_only=offline)


def siglip_folder(offline=True):
    """Return the local snapshot of SigLIP2, fetching only safetensors and its text settings if allowed."""
    repo, revision = SIGLIP
    return snapshot_download(repo, revision=revision, allow_patterns=['model.safetensors', '*.json', 'tokenizer.model'], cache_dir=HUB_CACHE, local_files_only=offline)


def download_global():
    """Fetch what the global food model needs, the small model first so it can be tested early."""
    print('siglip', siglip_folder(offline=False), flush=True)
    for name in LARGE_DATASETS:
        print('dataset', name, large_dataset_folder(name, offline=False), flush=True)


def main():
    """Fetch every pinned snapshot, resuming anything an earlier run left unfinished."""
    # Fetch the small weights first, so a slow dataset cannot hold them up
    for name in BACKBONES:
        print('weights', name, weights_folder(name, offline=False), flush=True)

    # Then fetch the photos
    for name in DATASETS:
        print('dataset', name, dataset_folder(name, offline=False), flush=True)


if __name__ == '__main__':
    download_global() if sys.argv[1:] == ['global'] else main()
