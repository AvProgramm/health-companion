"""Contact public composition databases before the optional Groq fallback."""
import asyncio
import json
import os
import httpx
from .databases import average_matches, parse_off, parse_usda, portion_basis
from .models import Estimate
from .prompts import estimate_prompt

# A short provider deadline leaves the manual diary responsive on a phone.
DATABASE_TIMEOUT = 3.0
# The model gets a bounded wait after database lookup has finished.
LLM_TIMEOUT = 6.0


async def database_estimate(name, portion_text):
    """Look up the name in both databases and keep only compatible records."""
    async with httpx.AsyncClient(timeout=DATABASE_TIMEOUT, follow_redirects=False,
            headers={'User-Agent': 'HealthCompanion/0.1 (local nutrition prototype)'}) as client:
        results = await asyncio.gather(usda_matches(client, name), off_matches(client, name), return_exceptions=True)
    matches = [match for result in results if isinstance(result, list) for match in result]
    return average_matches(matches, portion_basis(portion_text))


async def usda_matches(client, name):
    """Search USDA with the laptop key, without sending any diary context."""
    key = os.getenv('USDA_API_KEY', '')
    if not key:
        return []
    response = await client.post('https://api.nal.usda.gov/fdc/v1/foods/search',
        params={'api_key': key}, json={'query': name, 'pageSize': 5, 'requireAllWords': True})
    response.raise_for_status()
    return parse_usda(response.json(), name)


async def off_matches(client, name):
    """Search Open Food Facts using only the food name."""
    response = await client.get('https://world.openfoodfacts.org/cgi/search.pl', params={
        'search_terms': name, 'search_simple': 1, 'action': 'process', 'json': 1, 'page_size': 5,
        'fields': 'code,product_name,nutriments,product_quantity_unit',
    })
    response.raise_for_status()
    return parse_off(response.json(), name)


async def llm_estimate(name, portion_text):
    """Ask Groq for a bounded JSON estimate only after database lookup fails."""
    key = os.getenv('GROQ_API_KEY', '')
    if not key:
        return None
    basis = portion_basis(portion_text)
    prompt = estimate_prompt(basis)
    async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
        response = await client.post('https://api.groq.com/openai/v1/chat/completions',
            headers={'Authorization': f'Bearer {key}'}, json={
                'model': os.getenv('GROQ_MODEL', 'openai/gpt-oss-20b'),
                'response_format': {'type': 'json_object'}, 'temperature': 0,
                'max_completion_tokens': 2048, 'reasoning_effort': 'low',
                'messages': [{'role': 'system', 'content': prompt},
                    {'role': 'user', 'content': json.dumps({'name': name, 'portionText': portion_text})}],
            })
    response.raise_for_status()
    data = json.loads(response.json()['choices'][0]['message']['content'])
    # Set provenance ourselves because a model cannot verify its own citations.
    data['sourceKind'] = 'ai_estimate'
    data['sources'] = [{'provider': 'Groq AI', 'description': 'Model estimate, not a database measurement.',
                       'url': 'https://groq.com/'}]
    result = Estimate.model_validate(data)
    if result.basis != basis:
        raise ValueError('Keep the requested portion basis unchanged.')
    return result
