"""Look up an exact barcode using branded and public product labels."""
import asyncio

import httpx

from .barcode_verify import label_reply, look_up_web_label
from .databases import label_values_conflict, parse_usda
from .failures import PROVIDER_FAILURES
from .models import Basis
from .providers import search_usda


# Keep the branded search within the time the phone waits for a barcode.
BRANDED_TIMEOUT = 4.0
# USDA documents these as the two possible bases for branded nutrient records.
BRANDED_UNITS = {'g', 'grm', 'ml', 'mlt'}


def usda_barcode_reply(payload, code):
    """Return the latest usable branded record with the exact product code."""
    # Ignore a different product because USDA search can return other results.
    candidates = [
        food for food in payload.get('foods', [])
        if isinstance(food, dict) and food.get('dataType') == 'Branded'
        and type(food.get('fdcId')) is int and food['fdcId'] > 0
        and isinstance(food.get('description'), str) and food['description'].strip()
        and isinstance(food.get('gtinUpc'), str) and food['gtinUpc'].isdigit()
        and food['gtinUpc'].lstrip('0') == code.lstrip('0')
        and str(food.get('servingSizeUnit', '')).lower() in BRANDED_UNITS
    ]
    candidates.sort(key=lambda food: (str(food.get('publishedDate') or ''), food['fdcId']), reverse=True)

    # Use the latest record, so an old recipe does not replace a newer label.
    if not candidates:
        return None
    food = candidates[0]
    matches = parse_usda({'foods': [food]}, food['description'])
    if not matches:
        return None

    # Ignore an incomplete or contradictory label because it cannot verify the product.
    match = matches[0]
    nutrients = match.nutrients
    if nutrients.kcal is None or label_values_conflict(
            nutrients.kcal, None, nutrients.fat_g, nutrients.satfat_g, nutrients.unsatfat_g):
        return None
    return label_reply(food['description'].strip()[:80], match, Basis(amount=100, unit=match.unit),
                       'Exact barcode match in USDA FoodData Central. Compare the values with your packet.')


async def look_up_barcode(code):
    """Try USDA, then a checked retailer label, sending only the barcode."""
    primary_failed = False
    try:
        async with httpx.AsyncClient(timeout=BRANDED_TIMEOUT) as client:
            payload = await asyncio.wait_for(search_usda(client, {
                'query': code, 'dataType': ['Branded'], 'pageSize': 10,
            }), BRANDED_TIMEOUT)
        if not isinstance(payload, dict) or not isinstance(payload.get('foods'), list):
            raise ValueError('The branded food provider returned an invalid result.')
        found = usda_barcode_reply(payload, code)
        if found is not None:
            return found
    except PROVIDER_FAILURES:
        # Keep the public label lookup available when USDA is unavailable.
        primary_failed = True

    # Treat an outage differently from a confirmed miss if neither source can help.
    found = await look_up_web_label(code)
    if found is None and primary_failed:
        raise TimeoutError('The branded food lookup is unavailable.')
    return found
