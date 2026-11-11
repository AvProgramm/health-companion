"""Check packaged-food lookup against fictional branded and retailer records."""
import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from coach.app import app
from coach.retrieval import WebEvidence


# Match the phone's input shape with fictional public records and nutrients.
CODE = '9556001234567'
FOOD = {
    'description': 'Fictional oat drink', 'dataType': 'Branded', 'fdcId': 17,
    'gtinUpc': '0' + CODE, 'servingSizeUnit': 'ml', 'publishedDate': '2026-11-01',
    'foodNutrients': [
        {'nutrientId': 1008, 'unitName': 'KCAL', 'value': 50},
        {'nutrientId': 1093, 'unitName': 'MG', 'value': 30},
    ],
}
RETAIL = WebEvidence('source-1', 'Fictional oat spread', 'https://www.woolworths.com.au/example',
                     f'Barcode {CODE}. Nutrition per 100 g. Energy 418.4 kJ. Total fat 8 g. Sodium 30 mg.')


class BarcodeEndpointTests(unittest.TestCase):
    def test_only_digits_are_accepted(self):
        """Reject invalid barcode inputs at the boundary."""
        for code in ('abc', '123', '1' * 15):
            with self.subTest(code=code):
                self.assertEqual(TestClient(app).post('/api/barcode', json={'code': code}).status_code, 422)

    def test_extra_fields_are_refused(self):
        """Send only the product identity."""
        response = TestClient(app).post('/api/barcode', json={'code': CODE, 'diary': []})
        self.assertEqual(response.status_code, 422)

    def test_another_site_is_refused(self):
        """Keep the same browser origin boundary as other coach routes."""
        response = TestClient(app).post('/api/barcode', json={'code': CODE}, headers={'origin': 'https://example.org'})
        self.assertEqual(response.status_code, 403)

    def test_an_exact_usda_record_uses_its_own_basis(self):
        """Ignore a different barcode and use the current exact record without web search."""
        different = {**FOOD, 'gtinUpc': '9556001234568', 'description': 'Different oat drink'}
        older = {**FOOD, 'fdcId': 18, 'publishedDate': '2025-01-01', 'description': 'Older oat drink'}
        response, search = self.lookup([different, older, FOOD], [])
        self.assertEqual(response.status_code, 200)
        draft = response.json()
        self.assertEqual(draft['name'], 'Fictional oat drink')
        self.assertEqual(draft['estimate']['basis'], {'amount': 100, 'unit': 'mL'})
        self.assertEqual(draft['estimate']['nutrients']['sodium_mg'], 30)
        self.assertIsNone(draft['estimate']['nutrients']['fat_g'])
        self.assertEqual(draft['estimate']['sources'][0]['provider'], 'USDA')
        search.assert_not_awaited()

    def test_a_branded_miss_can_use_one_checked_retailer_label(self):
        """Return exact printed retailer values after the database misses."""
        response, search = self.lookup([{**FOOD, 'gtinUpc': '9556001234568'}], [RETAIL])
        self.assertEqual(response.status_code, 200)
        draft = response.json()
        self.assertEqual(draft['estimate']['basis'], {'amount': 100, 'unit': 'g'})
        self.assertEqual(draft['estimate']['nutrients']['fat_g'], 8)
        self.assertEqual(draft['estimate']['sources'][0]['url'], RETAIL.url)
        search.assert_awaited_once()

    def test_a_database_outage_can_use_the_retailer(self):
        """Keep the second source available if the first provider times out."""
        response, search = self.lookup(None, [RETAIL])
        self.assertEqual(response.status_code, 200)
        search.assert_awaited_once()

    def test_a_missing_exact_match_does_not_return_the_old_database_values(self):
        """Offer the packet fallback for the phone-reported barcode when no source can verify it."""
        response, search = self.lookup([], [], code='9310947004582')
        self.assertEqual(response.status_code, 404)
        self.assertNotIn('estimate', response.json())
        search.assert_awaited_once()

    def test_an_outage_is_distinguished_from_a_database_miss(self):
        """Report a temporary failure if a source was unavailable and no match was found."""
        response, _ = self.lookup(None, [])
        self.assertEqual(response.status_code, 503)

    def lookup(self, foods, evidence, code=CODE):
        """Call the barcode API with a fictional USDA reply and bounded web evidence."""
        def respond(request):
            self.assertEqual(request.url.host, 'api.nal.usda.gov')
            self.assertEqual(json.loads(request.content)['query'], code)
            if foods is None:
                raise httpx.ReadTimeout('Fictional timeout')
            return httpx.Response(200, json={'foods': foods})

        transport = httpx.MockTransport(respond)
        client_class = httpx.AsyncClient
        search = AsyncMock(return_value=evidence)
        with patch.dict('os.environ', {'USDA_API_KEY': 'fictional'}), \
                patch('coach.barcode.httpx.AsyncClient',
                      side_effect=lambda **options: client_class(**options, transport=transport)), \
                patch('coach.barcode_verify.search_barcode_labels', search, create=True):
            response = TestClient(app).post('/api/barcode', json={'code': code})
        return response, search
