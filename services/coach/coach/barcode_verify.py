"""Select one exact public retailer label after checking its printed values."""
import asyncio
import math
import re
from urllib.parse import urlsplit

from .databases import KJ_PER_KCAL, Match, average_matches, label_values_conflict
from .enrichment import BASIS, compatible_factor, explicit_value
from .models import BarcodeReply, Basis, Nutrients, Source
from .retrieval import public_url, search_barcode_labels


# Search these public product catalogues for a label tied to the scanned GTIN.
RETAILER_DOMAINS = ('myaeon2go.com', 'fairprice.com.sg', 'woolworths.com.au', 'coles.com.au',
                    'woolworths.co.nz', 'tesco.com', 'walmart.com', 'kroger.com')
# Leave time for the person to open the packet reader if no label can be checked.
SEARCH_TIMEOUT = 5.0

# Ignore multi-column excerpts because a number cannot be tied to the right column.
MIXED_BASIS = re.compile(
    r'\bper\s+(?:serving|serve|portion|pack|piece)\b|'
    r'\bper\s*100\s*(?:g|ml)\s*(?:/|\bor\b)\s*(?:100\s*)?(?:g|ml)\b', re.I,
)
# Read only fields with an explicit name and unit in the excerpt.
CHECKED_FIELDS = ('kcal', 'protein_g', 'carbs_g', 'fibre_g', 'total_sugar_g',
                  'added_sugar_g', 'fat_g', 'satfat_g', 'sodium_mg')


def label_reply(name, match, basis, reason):
    """Build a reviewable barcode reply using the existing label scaler."""
    estimate = average_matches([match], basis)
    return BarcodeReply(name=name, estimate=estimate.model_copy(update={'reason': reason}))


def checked_match(item, code):
    """Read a single physical basis and exact barcode from a trusted retailer excerpt."""
    if not public_url(item.url):
        return None
    host = (urlsplit(item.url).hostname or '').removeprefix('www.')
    if host not in RETAILER_DOMAINS or not item.title.strip():
        return None

    # Ignore a neighbouring product or a serving column without an unambiguous basis.
    barcode = re.search(rf'\b(?:barcode|gtin(?:-1[234])?|ean(?:-13)?|upc)\s*[:=]?\s*{re.escape(code)}(?!\d)',
                        item.content, re.I)
    heading = BASIS.search(item.content)
    if barcode is None or heading is None or MIXED_BASIS.search(item.content):
        return None
    unit = {'g': 'g', 'ml': 'mL'}.get(heading[2].lower())
    if unit is None or float(heading[1]) != 100:
        return None
    basis = Basis(amount=100, unit=unit)
    if compatible_factor(item.content, basis) != 1:
        return None

    # Read values only from the checked column. Bounds and absent values stay unknown.
    label_text = item.content[heading.end():]
    values = dict.fromkeys(Nutrients.model_fields)
    values.update({key: explicit_value(label_text, key) for key in CHECKED_FIELDS})
    kilojoules = explicit_value(label_text, 'kcal', 'kj')
    if label_values_conflict(values['kcal'], kilojoules, values['fat_g'], values['satfat_g']):
        return None
    if values['kcal'] is None and kilojoules is not None:
        values['kcal'] = kilojoules / KJ_PER_KCAL
    if values['kcal'] is None or all(values[key] is None for key in CHECKED_FIELDS[1:]):
        return None

    source = Source(provider='Retailer label', description=item.title.strip()[:240], url=item.url)
    return Match(Nutrients(**values), source, unit)


def labels_disagree(matches):
    """Check for conflicting bases or known values across verified sources."""
    if len({match.unit for match in matches}) > 1:
        return True
    for key in CHECKED_FIELDS:
        known = [value for match in matches if (value := getattr(match.nutrients, key)) is not None]
        if len(known) > 1 and not math.isclose(min(known), max(known)):
            return True
    return False


def label_coverage(match):
    """Count the fields supported by one label."""
    return sum(value is not None for value in match.nutrients.model_dump().values())


def choose_web_label(code, evidence):
    """Choose the most complete label when checked sources agree."""
    matches = [match for item in evidence if (match := checked_match(item, code)) is not None]
    if not matches or labels_disagree(matches):
        return None

    # Use one label so values from different recipes or revisions are never combined.
    match = max(matches, key=label_coverage)
    return label_reply(match.source.description[:80], match, Basis(amount=100, unit=match.unit),
                       'Exact barcode and printed values found on a retailer label. Compare with your packet.')


async def look_up_web_label(code):
    """Retrieve only public product labels and select one using the checked fields."""
    evidence = await asyncio.wait_for(search_barcode_labels(code, RETAILER_DOMAINS), SEARCH_TIMEOUT)
    return choose_web_label(code, evidence)
