"""
Train the router head on frozen sentence vectors.

YASH WRITES the parts marked "YASH WRITES THIS" (reserved in CLAUDE.md): the Dataset, the
head's forward pass, the training loop with validation macro-F1 early stopping, scoring,
and the confusion matrix. tests/test_train.py marks their tests expectedFailure until then;
when one reports "unexpected success", remove its decorator.
"""
import random
import numpy as np
import torch
from torch import nn
from torch.utils.data import Dataset
from .data import LABELS, SEED

# MiniLM's sentence vector size, and one output per class
INPUTS = 384
CLASSES = len(LABELS)
# At most 20 passes over the training families, as the router protocol caps it
MAX_EPOCHS = 20
# Learning rates compared on validation only, never on test
LEARNING_RATES = (0.001, 0.003)


def seed_all(seed=SEED):
    """Seed Python, NumPy and PyTorch, and make cuDNN deterministic, so a run repeats exactly."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class VectorDataset(Dataset):
    """
    Hold cached sentence vectors with their label indices.  YASH WRITES THIS.

    vectors is a [N, 384] float tensor; labels is a list of N label indices (0-5, in LABELS order).
    __getitem__(index) returns (vector [384] float32, label index as a long tensor).
    """

    def __init__(self, vectors, labels):
        raise NotImplementedError('YASH: store the vectors and the label indices.')

    def __len__(self):
        raise NotImplementedError('YASH: return how many messages there are.')

    def __getitem__(self, index):
        raise NotImplementedError('YASH: return one (vector, label) pair.')


class IntentHead(nn.Module):
    """
    The only trainable layer: Linear(384, 6), so 6 x 384 weights + 6 biases = 2,310 parameters.

    The encoder is frozen and not part of this module; it only ever sees cached vectors.
    """

    def __init__(self, inputs=INPUTS, classes=CLASSES):
        super().__init__()
        self.linear = nn.Linear(inputs, classes)

    def forward(self, vectors):
        """
        Return raw logits [batch, 6] for sentence vectors [batch, 384].  YASH WRITES THIS.

        Raw logits, with no softmax: CrossEntropyLoss applies log-softmax itself.
        """
        raise NotImplementedError('YASH: return the logits for these vectors.')


def train_model(model, train_loader, validation_loader, learning_rate, max_epochs=MAX_EPOCHS, device='cpu'):
    """
    Train the head and return {'state_dict': best weights, 'history': one entry per epoch}.  YASH WRITES THIS.

    Your FIT3181 habits:
      - CrossEntropyLoss on raw logits, and AdamW(model.parameters(), lr=learning_rate)
      - each epoch: model.train(); for each batch: zero_grad, forward, loss, backward, step
      - then score() the validation loader and compute router.metrics.macro_f1
      - keep a deep copy of the state_dict with the best validation macro-F1
      - stop early when it has not improved for a few epochs, and never pass max_epochs
    Avoid the old BaseTrainer.evaluate bug: average the loss over all batches, not just the last one.
    """
    raise NotImplementedError('YASH: write the training loop.')


def score(model, loader, device='cpu'):
    """
    Return (probabilities [N, 6], label indices [N]) for every batch in a loader.  YASH WRITES THIS.

    Run under model.eval() and torch.no_grad(), and softmax the logits so each row sums to one.
    """
    raise NotImplementedError('YASH: score the loader without gradients.')


def confusion_matrix(true, predicted, classes=CLASSES):
    """
    Return a classes x classes list of counts: row = true label index, column = predicted.  YASH WRITES THIS.
    """
    raise NotImplementedError('YASH: count each (true, predicted) pair.')


def checkpoint(model, learning_rate, threshold, revision):
    """Return the checkpoint saved with the trained head, recording what its weights belong to."""
    return {
        'architecture': 'Linear(384, 6) on frozen all-MiniLM-L6-v2 mean-pooled, L2-normalised vectors',
        'state_dict': model.state_dict(),
        'labels': LABELS,
        'learning_rate': learning_rate,
        'threshold': threshold,
        'model_revision': revision,
    }
