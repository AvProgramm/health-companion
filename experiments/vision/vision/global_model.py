"""
Turn SigLIP2 into a food model whose outputs are food names, ready to fine-tune with LoRA.

The classifier head is not learned. Its weights are the text vectors of the food names,
so a food can be added later by name, with no new photos and no retraining. LoRA only
adjusts how the ViT sees food, which is what keeps a general model general.

Written by Claude Code at Yash's request on 9 Nov 2026, for him to cross-check.
"""
from torch import nn
from torch.nn.functional import normalize


class FoodMatcher(nn.Module):
    """Score a photo against a fixed list of food names, so it behaves like any classifier."""

    def __init__(self, vision, names, scale):
        """Initialise the head from the name vectors [names, width], which stay fixed."""
        super().__init__()
        self.vision = vision
        self.head = nn.Linear(names.shape[1], names.shape[0], bias=False)
        self.head.weight.data = names.clone() * scale

    @property
    def blocks(self):
        """Return the transformer blocks, which is where LoRA adds its corrections."""
        return self.vision.encoder.layers

    def forward(self, pixels):
        """Return one score per food name for each photo: the cosine, scaled."""
        return self.head(normalize(self.vision(pixel_values=pixels).pooler_output, dim=-1))
