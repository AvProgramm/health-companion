"""Supplement only unknown nutrients from explicit, compatible web values."""
import asyncio
import math
import re
from .failures import PROVIDER_FAILURES
from .models import Estimate
from .retrieval import search_missing_nutrients

# Match whole nutrient labels so total sugar can never supply added sugar.
LABELS = {
    'kcal': r'(?:energy|calories)',
    'protein_g': r'protein',
    'fat_g': r'(?<!saturated )(?<!trans )(?:total )?fat',
    'satfat_g': r'saturated fat',
    'total_sugar_g': r'(?<!added )(?:total )?sugars?',
    'added_sugar_g': r'added sugars?',
    'carbs_g': r'(?:total )?carbohydrates?|carbs',
    'fibre_g': r'(?:dietary )?fib(?:re|er)',
    # \b keeps "monounsaturated fat" from counting as all unsaturated fat
    'unsatfat_g': r'unsaturated fats?',
    'sodium_mg': r'sodium',
}
# The unit each nutrient is printed in; everything else is grams
UNITS = {'kcal': 'kcal', 'sodium_mg': 'mg'}
# A single physical serving basis is needed before a source can be scaled.
BASIS = re.compile(r'\bper\s+(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pieces?)\b', re.I)
# One extra lookup has to fit inside the existing browser request deadline.
SUPPLEMENT_TIMEOUT = 2.0


def compatible_factor(content, target):
    """Return a scale only when the excerpt has one compatible portion basis."""
    bases = {(float(amount), unit.lower().rstrip('s')) for amount,unit in BASIS.findall(content)}
    if len(bases) != 1:
        return None
    amount, unit = bases.pop()
    if amount <= 0 or not math.isfinite(amount):
        return None
    # Convert only within mass, volume or explicit piece counts, never between them.
    units = {'g': ('mass', 1), 'kg': ('mass', 1000), 'ml': ('volume', 1), 'l': ('volume', 1000), 'piece': ('count', 1)}
    source_group, source_scale = units[unit]
    target_group, target_scale = units[target.unit.lower()]
    if source_group != target_group:
        return None
    return target.amount * target_scale / (amount * source_scale)


def explicit_value(content, key):
    """Read a single explicit nutrient amount without guessing a missing label."""
    unit = UNITS.get(key, 'g')
    pattern = rf'\b{LABELS[key]}\s*[:=]?\s*(\d+(?:\.\d+)?)\s*{unit}\b'
    values = {float(value) for value in re.findall(pattern, content, re.I)}
    if len(values) != 1:
        return None
    value = values.pop()
    return value if math.isfinite(value) else None


def supplement_values(estimate, evidence):
    """Copy a proposal and fill only null fields backed by explicit source values."""
    data = estimate.model_dump()
    used_sources = []
    for key, known in data['nutrients'].items():
        if known is not None:
            continue
        candidates = []
        for item in evidence:
            factor = compatible_factor(item.content, estimate.basis)
            value = explicit_value(item.content, key)
            if factor is None or value is None or not math.isfinite(value * factor):
                continue
            candidates.append(value * factor)
            if item.url not in {source['url'] for source in used_sources}:
                used_sources.append({'provider': 'Tavily web', 'description': item.title, 'url': item.url})
        if candidates:
            data['nutrients'][key] = sum(candidates) / len(candidates)
            data['range'][key] = {'low': min(candidates), 'high': max(candidates)}
    if not used_sources:
        return estimate
    existing = {source['url'] for source in data['sources']}
    data['sources'] += [source for source in used_sources if source['url'] not in existing]
    data['sourceKind'] = 'web_estimate'
    return Estimate.model_validate(data)


async def enrich_unknown(name, portion_text, estimate, search=search_missing_nutrients):
    """Try one cheap lookup and retain the original proposal if it adds nothing."""
    missing = tuple(key for key,value in estimate.nutrients.model_dump().items() if value is None)
    if not missing:
        return estimate
    try:
        evidence = await asyncio.wait_for(search(name, portion_text, missing), timeout=SUPPLEMENT_TIMEOUT)
        return supplement_values(estimate, evidence)
    except PROVIDER_FAILURES:
        # Ignore a failed supplement because the original useful proposal must survive.
        return estimate
