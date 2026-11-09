"""Build the ViT-Small models being compared."""
from pathlib import Path
import timm
from timm.data import resolve_model_data_config
from .config import BACKBONES, IMAGE_SIZE
from .download import weights_folder


def build_backbone(name, classes):
    """Return one pinned ViT-Small with a new head for this many dishes, at phone-sized input."""
    _repo, _revision, model_name = BACKBONES[name]
    weights = Path(weights_folder(name)) / 'model.safetensors'

    # Load the safetensors file directly, because timm would otherwise expect the original .npz
    return timm.create_model(model_name, pretrained=True, pretrained_cfg_overlay={'file': str(weights), 'custom_load': False}, num_classes=classes, img_size=IMAGE_SIZE)


def colour_settings(model):
    """Return the (mean, std) the model's pretrained weights were trained with."""
    config = resolve_model_data_config(model)
    return list(config['mean']), list(config['std'])
