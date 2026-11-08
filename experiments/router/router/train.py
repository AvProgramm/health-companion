"""
Train the router head on frozen sentence vectors.

Follows Yash's FIT3181 habits: train_model keeps the weights from the best validation
epoch, score runs under eval() and no_grad(), and every choice is made on validation.
Written by Claude Code at Yash's request on 8 Nov 2026, for him to cross-check.
"""
import copy
import random
import numpy as np
import torch
from torch import nn
from torch.utils.data import Dataset
from .data import LABELS, SEED
from .metrics import macro_f1

# MiniLM's sentence vector size, and one output per class
INPUTS = 384
CLASSES = len(LABELS)
# At most 20 passes over the training families, as the router protocol caps it
MAX_EPOCHS = 20
# Stop after this many epochs without a better score; macro-F1 moves in small steps on 72 messages
PATIENCE = 5
# Learning rates compared on validation only, never on test. The plan's 0.001 and 0.003 underfit
# (their best epoch was the 20-epoch cap, with loss still falling), so the grid carries on upward
LEARNING_RATES = (0.001, 0.003, 0.01, 0.03, 0.1)


def seed_all(seed=SEED):
    """Seed Python, NumPy and PyTorch, and make cuDNN deterministic, so a run repeats exactly."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class VectorDataset(Dataset):
    """Hold cached sentence vectors with their label indices, one pair per message."""

    def __init__(self, vectors, labels):
        """
        Store the vectors as floats and the labels as long integers.

        CrossEntropyLoss needs the class indices as long integers, so the types are set here once.
        """
        # Refuse mismatched lengths, because a vector without a label would silently shift every later pair
        if len(vectors) != len(labels):
            raise ValueError('Every sentence vector needs exactly one label.')
        self.vectors = torch.as_tensor(vectors, dtype=torch.float32)
        self.labels = torch.as_tensor(labels, dtype=torch.long)

    def __len__(self):
        """Return how many messages the dataset holds."""
        return len(self.labels)

    def __getitem__(self, index):
        """Return one (vector [384], label index) pair."""
        return self.vectors[index], self.labels[index]


class IntentHead(nn.Module):
    """
    The only trainable layer: Linear(384, 6), so 6 x 384 weights + 6 biases = 2,310 parameters.

    The encoder is frozen and not part of this module; it only ever sees cached vectors.
    """

    def __init__(self, inputs=INPUTS, classes=CLASSES):
        """Initialise the single linear layer."""
        super().__init__()
        self.linear = nn.Linear(inputs, classes)

    def forward(self, vectors):
        """
        Return raw logits [batch, 6] for sentence vectors [batch, 384].

        Raw logits, with no softmax: CrossEntropyLoss applies log-softmax itself.
        """
        return self.linear(vectors)


def train_model(model, train_loader, validation_loader, learning_rate, max_epochs=MAX_EPOCHS, device='cpu'):
    """
    Train the head and return the weights from the best validation epoch, not the last one.

    The result holds 'state_dict', 'best_epoch', 'best_valid' and a 'history' with one entry
    per epoch. The epoch is chosen on validation macro-F1, so the test split stays out of it.
    """
    # Initialise the loss on raw logits and the optimiser over the head's 2,310 parameters
    model.to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)

    # Initialise the best result so far
    best_valid, best_state, best_epoch, history = -1.0, None, 0, []
    for epoch in range(1, max_epochs + 1):
        # Take one gradient step per batch
        model.train()
        total_loss, total_messages = 0.0, 0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(batch_x), batch_y)
            loss.backward()
            optimizer.step()

            # Weight each batch's mean loss by its size, so a short last batch cannot skew the epoch
            total_loss += loss.item() * batch_y.size(0)
            total_messages += batch_y.size(0)

        # Measure this epoch on validation
        probabilities, labels = score(model, validation_loader, device)
        valid = macro_f1(labels.tolist(), probabilities.argmax(dim=1).tolist())
        history.append({'epoch': epoch, 'train_loss': total_loss / total_messages, 'valid_macro_f1': valid})

        # Keep a copy of the best weights, because the live ones keep changing
        if valid > best_valid:
            best_valid, best_state, best_epoch = valid, copy.deepcopy(model.state_dict()), epoch

        # Ignore further epochs once validation has stopped improving, because they only risk overfitting
        if epoch - best_epoch >= PATIENCE:
            break

    # Return the best weights with the record of how they were reached
    return {'state_dict': best_state, 'best_epoch': best_epoch, 'best_valid': best_valid, 'history': history}


def score(model, loader, device='cpu'):
    """
    Return (probabilities [N, 6], label indices [N]) for every batch in a loader.

    eval() switches off training-only behaviour and no_grad() stops PyTorch recording
    gradients. They do different jobs, so both are used.
    """
    # Get the model ready for inference
    model.to(device)
    model.eval()

    # Turn each batch's raw logits into one probability per class
    probabilities, labels = [], []
    with torch.no_grad():
        for batch_x, batch_y in loader:
            probabilities.append(torch.softmax(model(batch_x.to(device)), dim=1).cpu())
            labels.append(batch_y)

    # Return one row per message, in loader order
    return torch.cat(probabilities), torch.cat(labels)


def confusion_matrix(true, predicted, classes=CLASSES):
    """Return a classes x classes list of counts: row = true label index, column = predicted."""
    # Initialise every pair of classes at zero
    counts = [[0] * classes for _ in range(classes)]

    # Count each (true, predicted) pair
    for actual, guess in zip(true, predicted):
        counts[actual][guess] += 1

    # Return the finished table
    return counts


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
