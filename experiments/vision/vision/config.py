"""Hold every fixed setting of the dish-photo experiment in one place."""
import os
from dataclasses import dataclass
from pathlib import Path

# Outside OneDrive, because syncing many gigabytes of photos would achieve nothing
DATA_ROOT = Path(os.environ.get('HC_VISION_ROOT', Path.home() / 'hc-vision'))
# The Hugging Face cache for the pinned downloads
HUB_CACHE = DATA_ROOT / 'hub'
# The decoded photos and their labels
PREPARED = DATA_ROOT / 'prepared'
# Trained weights, which never go in Git
CHECKPOINTS = DATA_ROOT / 'checkpoints'
# The committed record of every run
RESULTS = Path(__file__).resolve().parents[1] / 'results'

# The exact dataset snapshots used: repository and commit
DATASETS = {
    'food101': ('ethz/food101', '83488de741c1bd1ce27aa6a2b33e19c7bdf92ca9'),
    'malaysian': ('lowyisan/malaysian_food_images', 'f64a696b071ce2b97830d7864dfee9f8969e3dac'),
}
# The ViT-Small weights compared: repository, commit and timm model name (Apache-2.0)
BACKBONES = {
    'dinov2': ('timm/vit_small_patch14_dinov2.lvd142m', '4610ca143709d58a633b6397a74412c2c3842454', 'vit_small_patch14_dinov2.lvd142m'),
    'augreg': ('timm/vit_small_patch16_224.augreg_in21k_ft_in1k', '7e2c55630205e1266030f18370f4c6ed1a514b52', 'vit_small_patch16_224.augreg_in21k_ft_in1k'),
}

# The side of the square each photo is stored at, leaving room for a random crop
STORED_SIZE = 256
# The photo size the model sees, small enough to run on a phone
IMAGE_SIZE = 224
# Fixed so the same split and shuffles can be reproduced
SEED = 3181


@dataclass(frozen=True)
class Settings:
    """Hold the training choices, frozen before the sealed test is run."""
    # Small enough that the larger backbone stays well inside 8 GB alongside the desktop
    batch_size: int = 96
    workers: int = 8
    epochs: int = 8
    # Dimensions of each low-rank correction, and how strongly it is applied
    rank: int = 16
    alpha: float = 16.0
    # The new head learns faster than the small corrections inside the ViT
    head_lr: float = 1e-3
    lora_lr: float = 3e-4
    weight_decay: float = 1e-4
    label_smoothing: float = 0.1
    # Share of the training pool held back to compare designs
    validation_share: float = 0.1
