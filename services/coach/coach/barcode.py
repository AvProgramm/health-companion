"""Look up one packaged food by its barcode, sending nothing but the number."""
import httpx
from .databases import average_matches, parse_off
from .models import BarcodeReply

# Long enough for a public database, short enough that the browser's wait is never reached
BARCODE_TIMEOUT = 8.0
# Open Food Facts asks every caller to identify the application
USER_AGENT = 'HealthCompanion/0.1 (local diary prototype)'
# The fields needed, so the reply stays small
FIELDS = 'code,product_name,nutriments,product_quantity_unit'


def barcode_reply(payload, code):
    """Return one product's label values per 100 g or mL, or None if it cannot be used."""
    # Ignore an unknown barcode or a malformed reply
    product = payload.get('product') if isinstance(payload, dict) and payload.get('status') == 1 else None
    if not isinstance(product, dict) or not str(product.get('product_name', '')).strip():
        return None

    # Reuse the search parser, so a missing label value stays unknown here too
    name = product['product_name'].strip()[:80]
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
