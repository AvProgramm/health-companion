"""Use Google's Gemini when Groq has run out of tokens."""
import os
from .databases import portion_basis
from .model_client import request_model

# Google's OpenAI-compatible chat endpoint, so a request has the same shape as Groq's
GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
# Google's fastest stable free model on 9 Nov 2026, because an estimate allows only six seconds
GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite'


async def gemini_estimate(name, portion_text, evidence=()):
    """
    Return a validated proposal from Gemini, or None when no key is set.

    The shape of the reply is left to the prompt and our own validation, as with
    Hugging Face, because Google's guide does not promise that our strict schema works.
    """
    # Ignore the call when no key is set, because every hosted model is optional
    key = os.getenv('GEMINI_API_KEY', '')
    if not key:
        return None
    return await request_model(GEMINI_URL, key, os.getenv('GEMINI_MODEL') or GEMINI_DEFAULT_MODEL, 'Gemini AI',
        'https://aistudio.google.com/', name, portion_text, portion_basis(portion_text), evidence, False)
