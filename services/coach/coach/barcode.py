"""Look up a barcode in two food databases, then fall back to an estimate by the product's name."""
import asyncio

import httpx

from .databases import average_matches, label_values_conflict, number, parse_off, parse_usda
from .models import BarcodeReply, Basis
from .pipeline import estimate_food
from .providers import search_usda


# Keep each database within the time the phone waits for a barcode.
DATABASE_TIMEOUT = 4.0
# USDA documents these as the two possible bases for branded nutrient records.
BRANDED_UNITS = {'g', 'grm', 'ml', 'mlt'}
# Open Food Facts asks every client to say who is calling
OFF_HEADERS = {'User-Agent': 'HealthCompanion/0.1 (local nutrition prototype)'}
# The only product fields a label draft needs
OFF_FIELDS = 'code,product_name,nutriments,product_quantity_unit'
# Its added sugar is that database's own guess from the ingredients, so it never counts as a label value
OFF_GUESSED = ('added-sugars',)


def label_reply(name, match, reason):
    """Return one database label as a draft on its published 100 g or 100 mL basis."""
    estimate = average_matches([match], Basis(amount=100, unit=match.unit))
    return BarcodeReply(name=name[:80], match='barcode', estimate=estimate.model_copy(update={'reason': reason}))


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
    nutrients = matches[0].nutrients
    if nutrients.kcal is None or label_values_conflict(
            nutrients.kcal, None, nutrients.fat_g, nutrients.satfat_g, nutrients.unsatfat_g):
        return None
    return label_reply(food['description'].strip(), matches[0],
                       'Exact barcode match in USDA FoodData Central. Compare the values with your packet.')


def off_barcode_reply(product):
    """
    Return a crowd-sourced record as a label draft, or None when it cannot be trusted as one.

    Anyone can edit this database, so a record must agree with itself first: its energy in
    both units, and its fats against their total. A "less than" value and the database's
    own guesses stay unknown rather than becoming numbers.
    """
    raw = product.get('nutriments')
    name = product.get('product_name')
    if not isinstance(raw, dict) or not isinstance(name, str) or not name.strip():
        return None

    # Ignore a record whose own values contradict one another
    kilojoules = number(raw.get('energy-kj_100g')) or number(raw.get('energy_100g'))
    fats = [number(raw.get(f'{field}_100g')) for field in ('saturated-fat', 'monounsaturated-fat', 'polyunsaturated-fat')]
    if label_values_conflict(number(raw.get('energy-kcal_100g')), kilojoules, number(raw.get('fat_100g')), *fats):
        return None

    # Leave out qualified and guessed values before reading the rest
    qualified = [key.removesuffix('_modifier') for key in raw if key.endswith('_modifier')]
    exact = {key: value for key, value in raw.items() if not any(key.startswith(field + '_') for field in (*qualified, *OFF_GUESSED))}
    matches = parse_off({'products': [{**product, 'nutriments': exact}]}, name)
    if not matches or matches[0].nutrients.kcal is None:
        return None
    return label_reply(name.strip(), matches[0],
                       'Exact barcode match in Open Food Facts, which anyone can edit. Compare every value with your packet.')


async def usda_lookup(client, code):
    """Return the USDA draft for the code, or None when USDA does not hold it."""
    payload = await search_usda(client, {'query': code, 'dataType': ['Branded'], 'pageSize': 10})
    if not isinstance(payload, dict) or not isinstance(payload.get('foods'), list):
        raise ValueError('The branded food provider returned an invalid result.')
    return usda_barcode_reply(payload, code)


async def off_product(client, code):
    """Return the Open Food Facts product for the code, or None when it does not hold it."""
    response = await client.get(f'https://world.openfoodfacts.org/api/v2/product/{code}.json', params={'fields': OFF_FIELDS})
    # The database answers 404 for a code it has never seen
    if response.status_code == 404:
        return None
    response.raise_for_status()
    product = response.json().get('product')
    return product if isinstance(product, dict) else None


async def estimate_by_name(name):
    """Return an estimate for the product's name, said plainly to be an estimate and not its label."""
    estimate = await estimate_food(name, '100 g')
    if estimate is None:
        return None
    reason = f'No trustworthy label was found for this barcode, so this is an estimate for "{name}". Compare it with your packet. {estimate.reason}'
    return BarcodeReply(name=name[:80], match='name', estimate=estimate.model_copy(update={'reason': reason[:500]}))


async def look_up_barcode(code):
    """
    Return the best available draft for one barcode, or None when nothing is known about it.

    Only the barcode is sent. Both databases are asked at once. An exact, self-consistent
    label wins; a product known only by name gets an estimate that says so. A database that
    could not be asked raises only when the other had nothing, so the caller can tell
    "not there" from "could not ask".
    """
    async with httpx.AsyncClient(timeout=DATABASE_TIMEOUT, headers=OFF_HEADERS) as client:
        usda, product = await asyncio.gather(usda_lookup(client, code), off_product(client, code), return_exceptions=True)

    # Prefer the branded record, then a crowd-sourced label that agrees with itself
    if isinstance(usda, BarcodeReply):
        return usda
    label = off_barcode_reply(product) if isinstance(product, dict) else None
    if label is not None:
        return label

    # Estimate by name when the product is known but its record cannot be used
    name = product.get('product_name') if isinstance(product, dict) else None
    if isinstance(name, str) and name.strip():
        return await estimate_by_name(name.strip())

    # Raise an outage only now, because the other database might have answered
    for result in (usda, product):
        if isinstance(result, BaseException):
            raise result
    return None
