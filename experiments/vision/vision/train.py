"""
Train the dish classifier: first a head on frozen features, then low-rank corrections.

Follows Yash's FIT3181 habits: one function trains an epoch and gathers its running loss and
accuracy, the best validation epoch is the one kept, and every choice is made on validation.
Written by Claude Code at Yash's request on 9 Nov 2026, for him to cross-check.
"""
import random
import time
import numpy as np
import torch
from torch import nn
from .config import SEED

# Passes over the cached features when fitting a frozen head; each one takes a fraction of a second
HEAD_EPOCHS = 40
# Features per step when fitting a frozen head
HEAD_BATCH = 2048
# Guesses kept per photo, because the phone shows five dishes to pick from
TOP_GUESSES = 5


def seed_all(seed=SEED):
    """Seed Python, NumPy and PyTorch, so a run can be repeated closely."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def half_precision(device):
    """Return the context that runs a forward pass in half precision on the GPU."""
    return torch.autocast(device, dtype=torch.float16, enabled=device == 'cuda')


def top_k_accuracy(top, labels, k):
    """Return the share of photos whose true dish is among the first k guesses."""
    return (top[:, :k] == labels.unsqueeze(1)).any(dim=1).float().mean().item()


def extract_features(model, loader, device):
    """Return (features [N, width], dish indices [N]) from the frozen ViT."""
    # Get the model ready for inference
    model.to(device)
    model.eval()

    # Keep the class token's vector for every photo
    features, labels = [], []
    with torch.no_grad():
        for pictures, targets in loader:
            with half_precision(device):
                output = model.forward_head(model.forward_features(pictures.to(device, non_blocking=True)), pre_logits=True)
            features.append(output.float().cpu())
            labels.append(targets)

    # Return one row per photo, in loader order
    return torch.cat(features), torch.cat(labels)


def fit_head(train, validation, classes, learning_rate, settings, device, epochs=HEAD_EPOCHS):
    """
    Train one linear head on cached features, and return its best validation epoch.

    The result holds 'state_dict', 'best_epoch', 'top1', 'top5' and the learning rate.
    """
    # Move the cached features to the device once, because they never change
    train_features, train_labels = train[0].to(device), train[1].to(device)
    valid_features, valid_labels = validation[0].to(device), validation[1].to(device)
    head = nn.Linear(train_features.shape[1], classes).to(device)
    optimizer = torch.optim.AdamW(head.parameters(), lr=learning_rate, weight_decay=settings.weight_decay)
    criterion = nn.CrossEntropyLoss(label_smoothing=settings.label_smoothing)

    # Keep the weights from the best epoch, because later ones can overfit
    best = {'top1': -1.0}
    for epoch in range(1, epochs + 1):
        head.train()
        for batch in torch.randperm(len(train_labels), device=device).split(HEAD_BATCH):
            optimizer.zero_grad(set_to_none=True)
            criterion(head(train_features[batch]), train_labels[batch]).backward()
            optimizer.step()

        # Measure this epoch on validation
        head.eval()
        with torch.no_grad():
            top = head(valid_features).topk(TOP_GUESSES, dim=1).indices
        top1 = top_k_accuracy(top, valid_labels, 1)
        if top1 > best['top1']:
            best = {'top1': top1, 'top5': top_k_accuracy(top, valid_labels, 5), 'best_epoch': epoch, 'learning_rate': learning_rate,
                    'state_dict': {key: value.cpu().clone() for key, value in head.state_dict().items()}}

    # Return the best epoch's head
    return best


def predict_top(model, loader, device):
    """Return (top guesses [N, 5], dish indices [N]) for every photo in a loader."""
    # Get the model ready for inference
    model.to(device)
    model.eval()

    # Keep only the top guesses, because nothing else is reported
    top, labels = [], []
    with torch.no_grad():
        for pictures, targets in loader:
            with half_precision(device):
                outputs = model(pictures.to(device, non_blocking=True))
            top.append(outputs.topk(TOP_GUESSES, dim=1).indices.cpu())
            labels.append(targets)

    # Return one row per photo, in loader order
    return torch.cat(top), torch.cat(labels)


def parameter_groups(model, settings):
    """Return the trainable weights grouped by learning rate: the head, and the corrections."""
    trainable = [(name, parameter) for name, parameter in model.named_parameters() if parameter.requires_grad]
    groups = [{'params': [parameter for name, parameter in trainable if name.startswith('head')], 'lr': settings.head_lr},
              {'params': [parameter for name, parameter in trainable if not name.startswith('head')], 'lr': settings.lora_lr}]

    # Ignore an empty group, because a head of fixed text vectors has nothing to learn
    return [group for group in groups if group['params']]


def train_epoch(model, loader, optimizer, scheduler, scaler, criterion, device):
    """Return (mean loss, accuracy) after one pass over the training photos."""
    running_loss, running_hits, num_data = 0.0, 0, 0
    model.train()
    for pictures, labels in loader:
        # Every data instance is a photo and its dish index
        pictures, labels = pictures.to(device, non_blocking=True), labels.to(device, non_blocking=True)

        # Zero the gradients for every batch
        optimizer.zero_grad(set_to_none=True)

        # Make predictions for this batch, in half precision so it runs faster
        with half_precision(device):
            outputs = model(pictures)
            loss = criterion(outputs, labels)

        # Adjust the learning weights, scaling so tiny half-precision gradients survive
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        scheduler.step()

        # Gather data and report, weighting by size so a short batch cannot skew the epoch
        running_loss += len(labels) * loss.item()
        running_hits += (outputs.argmax(dim=1) == labels).sum().item()
        num_data += len(labels)

    # Return the averages for this epoch
    return running_loss / num_data, running_hits / num_data


def train_lora(model, train_loader, validation_loader, settings, device, report=print):
    """
    Train the corrections and head, and return the weights from the best validation epoch.

    The result holds 'state_dict', 'best_epoch', 'best_valid' and a 'history' with one
    entry per epoch. The learning rate falls smoothly over every batch of the whole run.
    """
    # Initialise the loss, optimiser and schedule over only the trainable weights
    model.to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=settings.label_smoothing)
    optimizer = torch.optim.AdamW(parameter_groups(model, settings), weight_decay=settings.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=settings.epochs * len(train_loader))
    scaler = torch.amp.GradScaler('cuda', enabled=device == 'cuda')

    # Initialise the best result so far
    best_valid, best_state, best_epoch, history = -1.0, None, 0, []
    for epoch in range(1, settings.epochs + 1):
        # Train for one epoch, then measure it on validation
        started = time.perf_counter()
        loss, accuracy = train_epoch(model, train_loader, optimizer, scheduler, scaler, criterion, device)
        top, labels = predict_top(model, validation_loader, device)
        valid = top_k_accuracy(top, labels, 1)
        history.append({'epoch': epoch, 'train_loss': loss, 'train_accuracy': accuracy, 'valid_top1': valid, 'valid_top5': top_k_accuracy(top, labels, 5), 'seconds': round(time.perf_counter() - started, 1)})
        report(history[-1])

        # Keep a copy of the best weights on the CPU, because the live ones keep changing
        if valid > best_valid:
            best_valid, best_epoch = valid, epoch
            best_state = {key: value.cpu().clone() for key, value in model.state_dict().items()}

    # Return the best weights with the record of how they were reached
    return {'state_dict': best_state, 'best_epoch': best_epoch, 'best_valid': best_valid, 'history': history}
