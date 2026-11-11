"""Look up one packaged food by its barcode, sending nothing but the number."""
from math import isclose
import httpx
from .databases import average_matches, number, parse_off
from .models import BarcodeReply

# Long enough for a public database, short enough that the browser's wait is never reached
BARCODE_TIMEOUT = 8.0
# Open Food Facts asks every caller to identify the application
USER_AGENT = 'HealthCompanion/0.1 (local diary prototype)'
# The fields needed, so the reply stays small
FIELDS = 'code,product_name,nutriments,product_quantity_unit'


# Convert the label's two energy units before comparing them.
KJ_PER_KCAL = 4.184
# Allow for the way a packet rounds its energy and grams.
ENERGY_REL_TOLERANCE = 0.05
ENERGY_ABS_TOLERANCE = 5
FAT_ROUNDING_G = 0.5
# These components do not overlap, so their known sum cannot exceed total fat.
FAT_COMPONENTS = ('saturated-fat_100g', 'monounsaturated-fat_100g', 'polyunsaturated-fat_100g')


class BarcodeRecordConflict(ValueError):
    """Report a matching product whose nutrition cannot be used safely."""

    def __init__(self, name, unit):
        """Keep only the public product name and basis for a second lookup."""
        super().__init__('The database record has conflicting nutrition values. Use the packet label.')
        self.name = name
        self.unit = unit


def has_conflicting_nutrition(nutriments):
    """Check for energy units or a fat breakdown that contradict each other."""
    kcal = number(nutriments.get('energy-kcal_100g'))
    kilojoules = number(nutriments.get('energy-kj_100g'))
    if kcal is not None and kilojoules is not None and not isclose(
            kcal, kilojoules / KJ_PER_KCAL, rel_tol=ENERGY_REL_TOLERANCE, abs_tol=ENERGY_ABS_TOLERANCE):
        return True

    # Compare known components only when total fat was also supplied.
    fat = number(nutriments.get('fat_100g'))
    known_fats = [value for key in FAT_COMPONENTS if (value := number(nutriments.get(key))) is not None]
    return fat is not None and sum(known_fats) > fat + FAT_ROUNDING_G


def barcode_reply(payload, code):
    """Return one product's label values per 100 g or mL, or None if it cannot be used."""
    # Ignore an unknown barcode or a malformed reply
    product = payload.get('product') if isinstance(payload, dict) and payload.get('status') == 1 else None
    name = product.get('product_name') if isinstance(product, dict) else None
    if not isinstance(name, str) or not name.strip():
        return None
    name = name.strip()[:80]

    # Ignore contradictory values because the database cannot tell us which entry to trust.
    nutriments = product.get('nutriments')
    if isinstance(nutriments, dict) and has_conflicting_nutrition(nutriments):
        unit = 'mL' if product.get('product_quantity_unit') in ('ml', 'mL') else 'g'
        raise BarcodeRecordConflict(name, unit)

    # Reuse the search parser, so a missing label value stays unknown here too.
    matches = parse_off({'products': [{'code': code, **product}]}, name)
    if not matches:
        return None
    return BarcodeReply(name=name, estimate=average_matches(matches[:1], {'amount': 100, 'unit': matches[0].unit}))


async def look_up_barcode(code):
    """Return the product for one barcode, or None if Open Food Facts does not have it."""
    async with httpx.AsyncClient(timeout=BARCODE_TIMEOUT, headers={'User-Agent': USER_AGENT}) as client:
        response = await client.get(f'https://world.openfoodfacts.org/api/v2/product/{code}.json', params={'fields': FIELDS})

    # A 404 is the normal answer for a product nobody has added yet
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return barcode_reply(response.json(), code)
