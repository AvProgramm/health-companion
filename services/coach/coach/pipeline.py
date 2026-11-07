"""Choose database evidence first and model estimates second."""
import asyncio
import httpx
from .providers import database_estimate, llm_estimate


async def estimate_food(name, portion_text, database=database_estimate, llm=llm_estimate):
    """Return the first usable proposal without making the diary depend on it."""
    for provider in (database, llm):
        try:
            result = await asyncio.wait_for(provider(name, portion_text), timeout=7)
            if result is not None:
                return result
        except (TimeoutError, httpx.HTTPError, ValueError, KeyError, TypeError):
            # Ignore a failed provider because the next provider or manual entry remains available.
            continue
    return None
