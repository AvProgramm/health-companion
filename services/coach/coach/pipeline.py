"""Choose composition data, public evidence and validated model fallbacks."""
import asyncio
import httpx
from .providers import database_estimate, llm_estimate
from .retrieval import search_nutrition
from .gemini import gemini_estimate
from .huggingface import hf_estimate
from .enrichment import enrich_unknown

# Bound independent lookup stages before trying any model.
LOOKUP_DEADLINE = 4.0
# Model calls include their own socket deadline inside this total stage budget.
MODEL_DEADLINE = 8.0
# Asked in this order, so a model that is out of tokens hands over to the next.
ESTIMATE_MODELS = (llm_estimate, gemini_estimate, hf_estimate)


async def attempt(provider, *args, deadline):
    """Return a provider result or leave the next fallback available."""
    try:
        return await asyncio.wait_for(provider(*args), timeout=deadline)
    except (TimeoutError, httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        # Ignore a failed provider because manual entry and later fallbacks remain available.
        return None


async def estimate_food(name, portion_text, database=database_estimate, retrieval=search_nutrition, models=ESTIMATE_MODELS):
    """Return database values first, then evidence-assisted model proposals."""
    result = await attempt(database, name, portion_text, deadline=LOOKUP_DEADLINE)
    if result is not None:
        return await enrich_unknown(name, portion_text, result)
    evidence = await attempt(retrieval, name, portion_text, deadline=LOOKUP_DEADLINE) or []
    for model in models:
        result = await attempt(model, name, portion_text, evidence, deadline=MODEL_DEADLINE)
        if result is not None:
            return await enrich_unknown(name, portion_text, result)
    return None
