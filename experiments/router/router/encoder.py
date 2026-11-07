"""
Turn messages into frozen all-MiniLM-L6-v2 sentence vectors, cached by model revision.

Shapes, for a batch of B messages padded to T tokens:
    input_ids, attention_mask   [B, T]
    last_hidden_state           [B, T, 384]
    mean_pool                   [B, 384]   (padding left out of the average)
    sentence_vectors            [B, 384]   (each row scaled to length 1)
"""
import hashlib
from pathlib import Path
import torch

# The pretrained sentence encoder; its weights are never trained here
MODEL_ID = 'sentence-transformers/all-MiniLM-L6-v2'
# The commit of the model files every cached vector comes from (Apache-2.0, downloaded 7 Nov 2026 with Yash's approval)
MODEL_REVISION = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
# The encoder's output size, which is the head's input size
EMBEDDING_SIZE = 384
# Messages are short; this is the model's own limit, never reached by a diary message
MAX_TOKENS = 256
# Cached vectors stay outside Git (*.pt is ignored)
CACHE = Path(__file__).resolve().parents[1] / 'cache'


def mean_pool(last_hidden, attention_mask):
    """Return the average of each message's token vectors, leaving padding tokens out."""
    # Turn the mask into weights of one for real tokens and zero for padding
    weights = attention_mask.unsqueeze(-1).to(last_hidden.dtype)
    summed = (last_hidden * weights).sum(dim=1)
    # Ignore an all-padding row's zero count because dividing by zero would give NaN
    counts = weights.sum(dim=1).clamp(min=1e-9)
    return summed / counts


def sentence_vectors(last_hidden, attention_mask):
    """Return mean-pooled vectors scaled to length one, as the sentence-transformers model expects."""
    return torch.nn.functional.normalize(mean_pool(last_hidden, attention_mask), p=2, dim=1)


def model_available(revision=MODEL_REVISION):
    """Return whether the pinned model files are already in the local Hugging Face cache."""
    if revision is None:
        return False
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(MODEL_ID, revision=revision, local_files_only=True)
        return True
    except Exception:
        # Ignore a missing cache because the caller only asks whether to skip
        return False


def load_encoder(revision=MODEL_REVISION, device='cpu', local_only=False):
    """
    Return the tokenizer and the encoder with every parameter frozen and in eval mode.

    Freezing means requires_grad is False, so no optimiser can change the encoder;
    eval mode turns off dropout, so the same message always gives the same vector.
    """
    if revision is None:
        raise RuntimeError('Pin MODEL_REVISION in router/encoder.py before encoding; see the router README.')
    from transformers import AutoModel, AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=revision, local_files_only=local_only)
    model = AutoModel.from_pretrained(MODEL_ID, revision=revision, local_files_only=local_only).to(device)

    # Freeze every encoder weight; only the separate Linear(384, 6) head is ever trained
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    model.eval()
    return tokenizer, model


def encode(texts, tokenizer, model, device='cpu', batch_size=64):
    """Return a [len(texts), 384] tensor of sentence vectors, computed without gradients."""
    batches = []
    with torch.no_grad():
        for start in range(0, len(texts), batch_size):
            # Pad each batch to its longest message and keep the mask that marks the padding
            batch = tokenizer(texts[start:start + batch_size], padding=True, truncation=True, max_length=MAX_TOKENS, return_tensors='pt').to(device)
            output = model(input_ids=batch['input_ids'], attention_mask=batch['attention_mask'])
            batches.append(sentence_vectors(output.last_hidden_state, batch['attention_mask']).cpu())
    return torch.cat(batches) if batches else torch.empty(0, EMBEDDING_SIZE)


def cached_vectors(texts, revision=MODEL_REVISION, device='cpu'):
    """
    Return sentence vectors for texts, encoding only the ones not cached for this revision.

    The cache is keyed by a hash of each message, and the file name carries the model
    revision, so vectors from different weights can never be mixed.
    """
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f'vectors-{revision}.pt'
    cache = torch.load(path) if path.exists() else {}
    keys = [hashlib.sha256(text.encode('utf-8')).hexdigest() for text in texts]

    # Encode the missing messages once, then save the cache for the next run
    missing = [text for text, key in zip(texts, keys) if key not in cache]
    if missing:
        tokenizer, model = load_encoder(revision, device)
        for text, vector in zip(missing, encode(missing, tokenizer, model, device)):
            cache[hashlib.sha256(text.encode('utf-8')).hexdigest()] = vector
        torch.save(cache, path)
    return torch.stack([cache[key] for key in keys])
