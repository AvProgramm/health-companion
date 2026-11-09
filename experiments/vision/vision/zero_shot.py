"""
Match photos to food names with SigLIP2, a model trained on web-scale captioned images.

Nothing here is trained on food. A food is only a name, so adding one needs no new photos,
which is how a model can know almonds without being shown a single labelled almond.

Written by Claude Code at Yash's request on 9 Nov 2026, for him to cross-check.
"""
from pathlib import Path
import torch
from torch.nn.functional import normalize
from transformers import AutoModel, AutoTokenizer
from .download import siglip_folder
from .train import TOP_GUESSES, half_precision

# Hand-written foods the photo datasets do not cover, such as nuts, fruit and Malaysian dishes
BASIC_FOODS = Path(__file__).resolve().parents[1] / 'vocabulary' / 'basic_foods.txt'
# The wording compared on validation; the first is the one SigLIP2's authors use
PROMPTS = ('This is a photo of {}.', 'a photo of {}, a type of food.', 'a photo of a plate of {}.')
# SigLIP2 was trained on text padded to exactly this many tokens
TEXT_LENGTH = 64
# Names and photos compared per step, to stay well inside the GPU's memory
BATCH = 256


def readable(name):
    """Return a stored dish name as words, such as "nasi lemak"."""
    return name.replace('_', ' ').strip().lower()


def food_names(dishes, path=BASIC_FOODS):
    """Return the dataset dishes followed by every other known food, once each, as words."""
    listed = [line for line in (readable(text) for text in Path(path).read_text(encoding='utf-8').splitlines()) if line]
    return list(dict.fromkeys([readable(dish) for dish in dishes] + listed))


def load_siglip(attention=None):
    """Return the pinned SigLIP2 model and its tokeniser; export needs plain 'eager' attention."""
    folder = siglip_folder()
    return AutoModel.from_pretrained(folder, attn_implementation=attention), AutoTokenizer.from_pretrained(folder)


def name_vectors(model, tokenizer, names, device, prompts=PROMPTS[:1]):
    """Return one unit vector per name [N, width], averaged over the wordings."""
    # Embed every wording of every name in small batches
    model.to(device)
    model.eval()
    per_prompt = []
    for prompt in prompts:
        rows = []
        for start in range(0, len(names), BATCH):
            encoded = tokenizer([prompt.format(name) for name in names[start:start + BATCH]], padding='max_length', max_length=TEXT_LENGTH, truncation=True, return_tensors='pt').to(device)
            with torch.no_grad(), half_precision(device):
                rows.append(normalize(model.get_text_features(**encoded).float(), dim=-1).cpu())
        per_prompt.append(torch.cat(rows))

    # Average the wordings, then scale back to unit length so cosines stay comparable
    return normalize(torch.stack(per_prompt).mean(dim=0), dim=-1)


def photo_vectors(model, loader, device):
    """Return one unit vector per photo [N, width], and the dish indices [N]."""
    model.to(device)
    model.eval()
    vectors, labels = [], []
    with torch.no_grad():
        for pictures, targets in loader:
            with half_precision(device):
                vectors.append(normalize(model.get_image_features(pixel_values=pictures.to(device, non_blocking=True)).float(), dim=-1).cpu())
            labels.append(targets)
    return torch.cat(vectors), torch.cat(labels)


def match(photos, names, device='cpu'):
    """Return the indices of the closest names for each photo [N, 5], best first."""
    top, names = [], names.to(device)
    for batch in photos.split(BATCH):
        top.append((batch.to(device) @ names.T).topk(min(TOP_GUESSES, len(names)), dim=1).indices.cpu())
    return torch.cat(top)
