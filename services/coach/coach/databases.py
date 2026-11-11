"""Read composition records and average only compatible, relevant matches."""
import math
import re
from dataclasses import dataclass
from .models import Basis, Estimate, Nutrients, Source

# USDA nutrient identifiers avoid matching translated display names.
USDA_KEYS = {1008: ('kcal', 'KCAL'), 1003: ('protein_g', 'G'), 1005: ('carbs_g', 'G'), 1079: ('fibre_g', 'G'),
             2000: ('total_sugar_g', 'G'), 1063: ('total_sugar_g', 'G'), 1235: ('added_sugar_g', 'G'),
             1004: ('fat_g', 'G'), 1258: ('satfat_g', 'G'), 1093: ('sodium_mg', 'MG')}
# Branded records served in millilitres publish their values per 100 mL, not per 100 g
USDA_VOLUME_UNITS = {'ML', 'MLT'}
# Unsaturated fat is published in two parts that must both be known to add up
USDA_UNSATURATED = {1292: 'mono', 1293: 'poly'}
# Read the mass nutrients from the source's per-100-unit column.
OFF_KEYS = {'proteins': 'protein_g', 'carbohydrates': 'carbs_g', 'fiber': 'fibre_g',
            'sugars': 'total_sugar_g', 'added-sugars': 'added_sugar_g', 'fat': 'fat_g', 'saturated-fat': 'satfat_g'}
OFF_UNSATURATED = {'monounsaturated-fat': 'mono', 'polyunsaturated-fat': 'poly'}
# Open Food Facts publishes sodium in grams; the diary uses milligrams like labels do
MG_PER_G = 1000
# A kilocalorie equals this many kilojoules.
KJ_PER_KCAL = 4.184
# Allow normal label rounding when comparing independently printed energy units.
ENERGY_REL_TOLERANCE = 0.05
ENERGY_ABS_TOLERANCE = 5
# Allow normal rounding when comparing a fat total with its components.
FAT_ROUNDING_G = 0.5
# The canonical and explicit kJ fields report the same measurement.
SAME_UNIT_ROUNDING_KJ = 1


@dataclass
class Match:
    """Keep one source record on its published basis."""
    nutrients: Nutrients
    source: Source
    unit: str = 'g'
    amount: float = 100


def number(value):
    """Return a usable published number or leave it unknown."""
    # Ignore a boolean because Python otherwise treats it as one or zero.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value if math.isfinite(value) and value >= 0 else None


def energy_units_conflict(kcal, kilojoules):
    """Check whether separately supplied energy units disagree beyond label rounding."""
    return kcal is not None and kilojoules is not None and not math.isclose(
        kcal, kilojoules / KJ_PER_KCAL, rel_tol=ENERGY_REL_TOLERANCE, abs_tol=ENERGY_ABS_TOLERANCE,
    )


def label_values_conflict(kcal, kilojoules, fat, *fat_components):
    """Check whether printed energy or fat values contradict one another."""
    if energy_units_conflict(kcal, kilojoules):
        return True
    known_total = sum(value for value in fat_components if value is not None)
    return fat is not None and known_total > fat + FAT_ROUNDING_G


def off_energy_kcal(nutriments):
    """Return per-100-unit kcal and whether unresolved energy data needs review."""
    primary_kj = number(nutriments.get('energy_100g'))
    kilojoules = number(nutriments.get('energy-kj_100g'))
    kcal = number(nutriments.get('energy-kcal_100g'))

    # OFF's canonical energy is in kJ. Keep it unless two kJ fields disagree.
    if primary_kj is not None:
        if kilojoules is not None and not math.isclose(
            primary_kj, kilojoules, rel_tol=0, abs_tol=SAME_UNIT_ROUNDING_KJ,
        ):
            return None, True
        return primary_kj / KJ_PER_KCAL, False

    # Older records can supply a single unit. A conflicting pair has no tie-breaker.
    if energy_units_conflict(kcal, kilojoules):
        return None, True
    if kcal is not None:
        return kcal, False
    return (None if kilojoules is None else kilojoules / KJ_PER_KCAL), False


def unsaturated(parts):
    """Return mono plus poly unsaturated fat, or unknown if either part is missing."""
    mono, poly = parts.get('mono'), parts.get('poly')
    return None if mono is None or poly is None else mono + poly


def relevant(name, description):
    """Require every query word in the record name before averaging it."""
    if not isinstance(description, str):
        return False
    words = set(re.findall(r'[a-z0-9]+', name.lower()))
    return bool(words) and words <= set(re.findall(r'[a-z0-9]+', description.lower()))


def parse_usda(payload, name):
    """Return relevant USDA search records on their published 100 g basis."""
    matches = []
    seen = set()
    if not isinstance(payload, dict) or not isinstance(payload.get('foods'), list):
        return []
    for food in payload['foods']:
        if not isinstance(food, dict):
            continue
        description = food.get('description', '')
        identity = food.get('fdcId')
        if not isinstance(identity, int) or identity in seen or not relevant(name, description):
            continue
        values = dict.fromkeys(Nutrients.model_fields)
        parts = {}
        raw = food.get('foodNutrients')
        for nutrient in raw if isinstance(raw, list) else []:
            if not isinstance(nutrient, dict):
                continue
            identity_number = nutrient.get('nutrientId')
            field = USDA_KEYS.get(identity_number)
            # Keep the first value published for a nutrient, so a second identifier cannot overwrite it
            if field and str(nutrient.get('unitName', '')).upper() == field[1] and values[field[0]] is None:
                values[field[0]] = number(nutrient.get('value'))
            elif identity_number in USDA_UNSATURATED and str(nutrient.get('unitName', '')).upper() == 'G':
                parts[USDA_UNSATURATED[identity_number]] = number(nutrient.get('value'))
        values['unsatfat_g'] = unsaturated(parts)
        if all(value is None for value in values.values()):
            continue
        seen.add(identity)
        unit = 'mL' if str(food.get('servingSizeUnit', '')).upper() in USDA_VOLUME_UNITS else 'g'
        matches.append(Match(Nutrients(**values), Source(provider='USDA', description=description[:240],
            url=f'https://fdc.nal.usda.gov/food-details/{identity}/nutrients'), unit))
    return matches


def parse_off(payload, name):
    """Return relevant Open Food Facts records without filling missing values."""
    matches = []
    seen = set()
    if not isinstance(payload, dict) or not isinstance(payload.get('products'), list):
        return []
    for product in payload['products']:
        if not isinstance(product, dict):
            continue
        description = product.get('product_name', '')
        identity = str(product.get('code', ''))
        if not identity.isdigit() or identity in seen or not relevant(name, description):
            continue
        raw = product.get('nutriments')
        if not isinstance(raw, dict):
            continue
        # Ignore conflicting energy because a name lookup must not average incompatible values.
        kcal, energy_conflict = off_energy_kcal(raw)
        if energy_conflict:
            continue
        values = {key: number(raw.get(f'{field}_100g')) for field, key in OFF_KEYS.items()}
        values['kcal'] = kcal
        values['unsatfat_g'] = unsaturated({part: number(raw.get(f'{field}_100g')) for field, part in OFF_UNSATURATED.items()})
        # Ignore a record whose fats add up to more than its total fat, because one of them is a typing mistake
        if label_values_conflict(None, None, values['fat_g'], values['satfat_g'], values['unsatfat_g']):
            continue
        sodium_g = number(raw.get('sodium_100g'))
        values['sodium_mg'] = None if sodium_g is None else sodium_g * MG_PER_G
        if all(value is None for value in values.values()):
            continue
        seen.add(identity)
        unit = 'mL' if product.get('product_quantity_unit') in ('ml', 'mL') else 'g'
        matches.append(Match(Nutrients(**values), Source(provider='Open Food Facts', description=description[:240],
            url=f'https://world.openfoodfacts.org/product/{identity}'), unit))
    return matches


def average_matches(matches, basis):
    """Return means and observed spreads after scaling compatible records."""
    basis = Basis.model_validate(basis) if isinstance(basis, dict) else basis
    unit = {'kg': 'g', 'L': 'mL'}.get(basis.unit, basis.unit)
    compatible = [match for match in matches if match.unit == unit]
    if not compatible:
        return None
    # Express the request in the records' unit and scale from each published amount.
    target_amount = basis.amount * (1000 if basis.unit in ('kg', 'L') else 1)
    scaled = [(match.nutrients.model_dump(), target_amount / match.amount) for match in compatible]
    values = {}
    ranges = {}
    for key in Nutrients.model_fields:
        known = [nutrients[key] * factor for nutrients, factor in scaled if nutrients[key] is not None]
        values[key] = sum(known) / len(known) if known else None
        ranges[key] = {'low': min(known), 'high': max(known)} if known else None
    return Estimate(basis=basis, nutrients=Nutrients(**values), range=ranges, sourceKind='database',
        reason='Mean of matching records; the range is their spread, not a confidence interval. Recipes and brands vary.',
        sources=[match.source for match in compatible])
