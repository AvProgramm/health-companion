"""Serve prepared photos to the model, with the crops and colours each backbone expects."""
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset
from torchvision.transforms import v2
from .config import IMAGE_SIZE


def photo_transform(mean, std, training):
    """
    Return the transform for a stored photo: a random view when training, the centre otherwise.

    The phone must apply the same centre crop and the same mean and std, or its
    predictions would quietly get worse.
    """
    views = [v2.RandomResizedCrop(IMAGE_SIZE, scale=(0.5, 1.0), antialias=True), v2.RandomHorizontalFlip(), v2.ColorJitter(0.2, 0.2, 0.2)] if training else [v2.CenterCrop(IMAGE_SIZE)]
    return v2.Compose([*views, v2.ToDtype(torch.float32, scale=True), v2.Normalize(mean, std)])


class FoodPhotos(Dataset):
    """Serve (photo, dish index) pairs from the memory-mapped array of decoded photos."""

    def __init__(self, folder, positions, labels, transform):
        """Store where the photos are; the array itself is opened later, inside each worker."""
        self.folder = Path(folder)
        self.positions = positions
        self.labels = labels
        self.transform = transform
        self.images = None

    def __len__(self):
        """Return how many photos this split holds."""
        return len(self.positions)

    def __getitem__(self, index):
        """Return one (photo [3, 224, 224], dish index) pair."""
        # Open the array here, because a memory map cannot be sent to a worker process
        if self.images is None:
            self.images = np.load(self.folder / 'images.npy', mmap_mode='r')

        # Copy the photo out of the read-only map, and put colour channels first
        position = self.positions[index]
        photo = torch.from_numpy(self.images[position].copy()).permute(2, 0, 1)
        return self.transform(photo), int(self.labels[position])


def loader_over(folder, positions, labels, transform, settings, training=False):
    """Return a loader over these photos, shuffled only when training."""
    dataset = FoodPhotos(folder, positions, labels, transform)
    return DataLoader(dataset, batch_size=settings.batch_size, shuffle=training, drop_last=training, num_workers=settings.workers,
                      pin_memory=torch.cuda.is_available(), persistent_workers=settings.workers > 0, prefetch_factor=4 if settings.workers > 0 else None)


def make_loader(folder, split, transform, settings, training=False):
    """Return a loader over one split, shuffled only when training."""
    labels = np.load(Path(folder) / 'labels.npy')
    positions = np.flatnonzero(np.load(Path(folder) / 'splits.npy') == split)
    return loader_over(folder, positions, labels, transform, settings, training)
