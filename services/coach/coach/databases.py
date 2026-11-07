"""Read composition records and average only compatible, relevant matches."""
import math
import re
from dataclasses import dataclass
from .models import Basis, Estimate, Nutrients, Source

# USDA nutrient identifiers avoid matching translated display names.
USDA_KEYS = {1008: ('kcal', 'KCAL'), 1003: ('protein_g', 'G'), 1004: ('fat_g', 'G'),
             1258: ('satfat_g', 'G'), 2000: ('total_sugar_g', 'G'), 1235: ('added_sugar_g', 'G')}
# Open Food Facts stores energy separately from grams of each nutrient.
OFF_KEYS = {'energy-kcal': 'kcal', 'proteins': 'protein_g', 'fat': 'fat_g',
            'saturated-fat': 'satfat_g', 'sugars': 'total_sugar_g', 'added-sugars': 'added_sugar_g'}


@dataclass
class Match:
    """Keep one source record on its published basis."""
    nutrients: Nutrients
    source: Source
    unit: str = 'g'


def number(value):
    """Return a usable published number or leave it unknown."""
    # Ignore a boolean because Python otherwise treats it as one or zero.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) and value >= 0 else None


def relevant(name, description):
    """Require every query word in the record name before averaging it."""
    words = set(re.findall(r'[a-z0-9]+', name.lower()))
    return bool(words) and words <= set(re.findall(r'[a-z0-9]+', description.lower()))


def parse_usda(payload, name):
    """Return relevant USDA search records on their published 100 g basis."""
    matches = []
    seen = set()
    for food in payload.get('foods', []):
        description = food.get('description', '')
        identity = food.get('fdcId')
        if not isinstance(identity, int) or identity in seen or not relevant(name, description):
            continue
        values = dict.fromkeys(Nutrients.model_fields)
        for nutrient in food.get('foodNutrients', []):
            field = USDA_KEYS.get(nutrient.get('nutrientId'))
            if field and str(nutrient.get('unitName', '')).upper() == field[1]:
                values[field[0]] = number(nutrient.get('value'))
        if all(value is None for value in values.values()):
            continue
        seen.add(identity)
        matches.append(Match(Nutrients(**values), Source(provider='USDA', description=description[:240],
            url=f'https://fdc.nal.usda.gov/food-details/{identity}/nutrients')))
    return matches


def parse_off(payload, name):
    """Return relevant Open Food Facts records without filling missing values."""
    matches = []
    seen = set()
    for product in payload.get('products', []):
        description = product.get('product_name', '')
        identity = str(product.get('code', ''))
        if not identity.isdigit() or identity in seen or not relevant(name, description):
            continue
        raw = product.get('nutriments', {})
        values = {key: number(raw.get(f'{field}_100g')) for field, key in OFF_KEYS.items()}
        if all(value is None for value in values.values()):
            continue
        seen.add(identity)
        unit = 'mL' if product.get('product_quantity_unit') in ('ml', 'mL') else 'g'
        matches.append(Match(Nutrients(**values), Source(provider='Open Food Facts', description=description[:240],
            url=f'https://world.openfoodfacts.org/product/{identity}'), unit))
    return matches


def portion_basis(text):
    """Read an explicit physical portion or retain an explicit piece count."""
    match = re.fullmatch(r'\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|pieces?)?\s*', text, re.I)
    if not match:
        return Basis(amount=1, unit='piece')
    unit = (match[2] or 'piece').lower()
    unit = {'ml': 'mL', 'l': 'L', 'pieces': 'piece'}.get(unit, unit)
    return Basis(amount=float(match[1].replace(',', '.')), unit=unit)


def average_matches(matches, basis):
    """Return means and observed spreads after scaling compatible records."""
    basis = Basis.model_validate(basis) if isinstance(basis, dict) else basis
    unit = {'kg': 'g', 'L': 'mL'}.get(basis.unit, basis.unit)
    compatible = [match for match in matches if match.unit == unit]
    if not compatible:
        return None
    multiplier = basis.amount * (1000 if basis.unit in ('kg', 'L') else 1) / 100
    values = {}
    ranges = {}
    for key in Nutrients.model_fields:
        known = [getattr(match.nutrients, key) * multiplier for match in compatible if getattr(match.nutrients, key) is not None]
        values[key] = sum(known) / len(known) if known else None
        ranges[key] = {'low': min(known), 'high': max(known)} if known else None
    return Estimate(basis=basis, nutrients=Nutrients(**values), range=ranges, sourceKind='database',
        reason='Mean of matching records; the range is their spread, not a confidence interval. Recipes and brands vary.',
        sources=[match.source for match in compatible])
