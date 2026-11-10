"""Choose composition data, public evidence and validated model fallbacks."""
import asyncio
from functools import partial
from .availability import asking_order, send_to_back
from .enrichment import enrich_unknown
from .failures import PROVIDER_FAILURES
from .hosted_models import HOSTED_MODELS
from .model_client import model_estimate
from .providers import database_estimate
from .retrieval import search_nutrition

# Bound independent lookup stages before trying any model.
LOOKUP_DEADLINE = 4.0
# Model calls include their own socket deadline inside this total stage budget.
MODEL_DEADLINE = 8.0
# The hosted models an estimate can ask, by their name in the shared queue.
ESTIMATE_MODELS = {model_name: partial(model_estimate, model_name) for model_name in HOSTED_MODELS}


async def attempt(provider, *args, deadline):
    """Return a provider result or leave the next fallback available."""
    try:
        return await asyncio.wait_for(provider(*args), timeout=deadline)
    except PROVIDER_FAILURES:
        # Ignore a failed provider because manual entry and later fallbacks remain available.
        return None


async def estimate_food(name, portion_text, database=database_estimate, retrieval=search_nutrition, models=ESTIMATE_MODELS):
    """Return database values first, then evidence-assisted model proposals."""
    result = await attempt(database, name, portion_text, deadline=LOOKUP_DEADLINE)
    if result is not None:
        return await enrich_unknown(name, portion_text, result)
    evidence = await attempt(retrieval, name, portion_text, deadline=LOOKUP_DEADLINE) or []
    for model_name in asking_order(models):
        result = await attempt(models[model_name], name, portion_text, evidence, deadline=MODEL_DEADLINE)
        if result is not None:
            return await enrich_unknown(name, portion_text, result)
        # Ask this model last next time, because it could not answer now
        send_to_back(model_name)
    return None
