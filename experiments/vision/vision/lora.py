"""
Fine-tune a ViT with LoRA: small low-rank corrections beside each frozen linear layer.

A linear layer computes W x. LoRA keeps W frozen and learns two thin matrices, so the layer
computes (W + (alpha / rank) U D) x. With rank 16 that is about 5% of a ViT-Small's weights,
which is why it trains quickly and resists overfitting. After training, each correction can
be folded back into W, so the phone runs an ordinary ViT at no extra cost.

Written by Claude Code at Yash's request on 9 Nov 2026, for him to cross-check.
"""
import math
import torch
from torch import nn


class LoRALinear(nn.Module):
    """Add a trainable low-rank correction to one frozen linear layer."""

    def __init__(self, base, rank, alpha):
        """
        Initialise the correction so the layer starts out exactly as it was.

        D starts random and U starts at zero. The correction is therefore zero on the
        first step, yet gradients still reach U, so learning can begin.
        """
        super().__init__()
        self.base = base
        self.rank = min(rank, base.in_features, base.out_features)
        self.scale = alpha / self.rank

        # Build the correction where the frozen layer already is, or merging would mix devices
        device = base.weight.device
        self.down = nn.Linear(base.in_features, self.rank, bias=False, device=device)
        self.up = nn.Linear(self.rank, base.out_features, bias=False, device=device)
        nn.init.kaiming_uniform_(self.down.weight, a=math.sqrt(5))
        nn.init.zeros_(self.up.weight)

    def forward(self, inputs):
        """Return the frozen layer's output plus the scaled correction."""
        return self.base(inputs) + self.scale * self.up(self.down(inputs))

    def merged(self):
        """Return one plain linear layer that computes exactly what this one does."""
        layer = nn.Linear(self.base.in_features, self.base.out_features, bias=self.base.bias is not None)
        layer.weight.data = self.base.weight.data + self.scale * self.up.weight.data @ self.down.weight.data

        # Keep the frozen layer's offset unchanged, because the correction has none
        if self.base.bias is not None:
            layer.bias.data = self.base.bias.data.clone()
        return layer


def add_lora(model, rank, alpha, train_head=True):
    """
    Freeze the whole model, then give every linear layer in its transformer blocks a correction.

    The classifier head stays trainable unless told otherwise, because the dishes are new
    outputs. The patch embedding, position embedding and class token stay frozen.
    """
    # Freeze everything first, so that only what is added below can learn
    for parameter in model.parameters():
        parameter.requires_grad = False

    # List the layers before changing anything, because wrapping adds new linear layers of its own
    targets = [(parent, name, child) for block in model.blocks for parent in block.modules() for name, child in parent.named_children() if isinstance(child, nn.Linear)]
    for parent, name, child in targets:
        setattr(parent, name, LoRALinear(child, rank, alpha))

    # Let the head learn, unless it is fixed text vectors that must keep their meaning
    if train_head:
        for parameter in model.head.parameters():
            parameter.requires_grad = True
    return model


def merge_lora(model):
    """Replace every correction with one plain linear layer computing the same function."""
    targets = [(parent, name, child) for parent in model.modules() for name, child in parent.named_children() if isinstance(child, LoRALinear)]
    for parent, name, child in targets:
        setattr(parent, name, child.merged())
    return model
