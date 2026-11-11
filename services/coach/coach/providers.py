"""Contact the public composition databases, which are asked before any hosted model."""
import asyncio
import os
import httpx
from .portions import portion_basis
from .databases import average_matches, parse_off, parse_usda

# A short provider deadline leaves the manual diary responsive on a phone.
DATABASE_TIMEOUT = 3.0


async def database_estimate(name, portion_text):
    """Look up the name in both databases and keep only compatible records."""
    async with httpx.AsyncClient(timeout=DATABASE_TIMEOUT, follow_redirects=False,
            headers={'User-Agent': 'HealthCompanion/0.1 (local nutrition prototype)'}) as client:
        results = await asyncio.gather(usda_matches(client, name), off_matches(client, name), return_exceptions=True)
    matches = [match for result in results if isinstance(result, list) for match in result]
    return average_matches(matches, portion_basis(portion_text))


async def usda_matches(client, name):
    """Search USDA with the laptop key, without sending any diary context."""
    payload = await search_usda(client, {'query': name, 'pageSize': 5, 'requireAllWords': True})
    return parse_usda(payload, name)


async def search_usda(client, query):
    """Return USDA search data using the laptop key."""
    key = os.getenv('USDA_API_KEY', '')
    if not key:
        return {'foods': []}
    response = await client.post('https://api.nal.usda.gov/fdc/v1/foods/search',
                                 params={'api_key': key}, json=query)
    response.raise_for_status()
    return response.json()


async def off_matches(client, name):
    """Search Open Food Facts using only the food name."""
    response = await client.get('https://world.openfoodfacts.org/cgi/search.pl', params={
        'search_terms': name, 'search_simple': 1, 'action': 'process', 'json': 1, 'page_size': 5,
        'fields': 'code,product_name,nutriments,product_quantity_unit',
    })
    response.raise_for_status()
    return parse_off(response.json(), name)
