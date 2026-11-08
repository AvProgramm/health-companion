"""Rank knowledge pieces by meaning, using a small sentence encoder on this machine."""
import os
from pathlib import Path
import numpy as np
import onnxruntime
from tokenizers import Tokenizer

# The exact all-MiniLM-L6-v2 revision this was tested with (Apache-2.0)
MODEL_REVISION = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
# Where Hugging Face leaves the pinned download; MINILM_DIR overrides it on a host
HF_SNAPSHOT = Path.home() / '.cache' / 'huggingface' / 'hub' / 'models--sentence-transformers--all-MiniLM-L6-v2' / 'snapshots' / MODEL_REVISION
# The 23 MB quantised model, fast enough for a laptop CPU
ONNX_FILE = Path('onnx') / 'model_quint8_avx2.onnx'
# The longest input the encoder was trained on
MAX_TOKENS = 256


def mean_pool(hidden, attention):
    """Return the average token vector of each text, leaving out the padding."""
    mask = attention[..., np.newaxis]
    return (hidden * mask).sum(axis=1) / np.clip(mask.sum(axis=1), 1e-9, None)


def unit_length(vectors):
    """Return vectors scaled to length one, so a dot product is a cosine similarity."""
    return vectors / np.clip(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-9, None)


def load_encoder(directory=None):
    """
    Return a function that embeds a list of texts, or None if the model isn't here.

    Returning None rather than failing lets the coach carry on with word search alone.
    """
    folder = Path(directory or os.environ.get('MINILM_DIR') or HF_SNAPSHOT)

    # Ignore a partial download, because either file alone is no use
    if not (folder / ONNX_FILE).exists() or not (folder / 'tokenizer.json').exists():
        return None

    session = onnxruntime.InferenceSession(str(folder / ONNX_FILE), providers=['CPUExecutionProvider'])
    tokenizer = Tokenizer.from_file(str(folder / 'tokenizer.json'))
    tokenizer.enable_truncation(max_length=MAX_TOKENS)
    tokenizer.enable_padding()

    def encode(texts):
        """Return one unit-length vector for each text."""
        encoded = tokenizer.encode_batch(list(texts))
        input_ids = np.array([item.ids for item in encoded], dtype=np.int64)
        attention = np.array([item.attention_mask for item in encoded], dtype=np.int64)

        # Run the encoder, then reduce each text's token vectors to one vector
        hidden = session.run(None, {'input_ids': input_ids, 'attention_mask': attention, 'token_type_ids': np.zeros_like(input_ids)})[0]
        return unit_length(mean_pool(hidden, attention))
    return encode


class VectorIndex:
    """Hold one unit vector per piece and compare a question against all of them."""

    def __init__(self, chunks, encode):
        """Initialise by embedding every piece once."""
        self.chunks = list(chunks)
        self.encode = encode
        self.vectors = encode([chunk.text for chunk in self.chunks])

    def search(self, query, k, topics=None):
        """Return up to k (chunk, cosine similarity) pairs, best first."""
        similarity = self.vectors @ self.encode([query])[0]

        # Pre-filter by topic, then break ties by id so the order is repeatable
        allowed = [position for position, chunk in enumerate(self.chunks) if topics is None or chunk.topic in topics]
        allowed.sort(key=lambda position: (-similarity[position], self.chunks[position].id))
        return [(self.chunks[position], float(similarity[position])) for position in allowed[:k]]
