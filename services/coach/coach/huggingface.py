"""Use Hugging Face hosted inference after the primary model fails."""
import os
from .databases import portion_basis
from .model_client import request_model


async def hf_estimate(name, portion_text, evidence=()):
    """Try the configured hosted backup without downloading model weights."""
    key = os.getenv('HF_TOKEN', '')
    if not key:
        return None
    return await request_model('https://router.huggingface.co/v1/chat/completions', key,
        os.getenv('HF_MODEL', 'meta-llama/Llama-3.1-8B-Instruct:cheapest'), 'Hugging Face AI',
        'https://huggingface.co/', name, portion_text, portion_basis(portion_text), evidence, False)
