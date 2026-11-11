"""Check packaged-food lookup against fictional branded records."""
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from coach.app import app


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
        """Ignore a different barcode and use the current exact record."""
        different = {**FOOD, 'gtinUpc': '9556001234568', 'description': 'Different oat drink'}
        older = {**FOOD, 'fdcId': 18, 'publishedDate': '2025-01-01', 'description': 'Older oat drink'}
        response = self.lookup([different, older, FOOD])
        self.assertEqual(response.status_code, 200)
        draft = response.json()
        self.assertEqual(draft['name'], 'Fictional oat drink')
        self.assertEqual(draft['estimate']['basis'], {'amount': 100, 'unit': 'mL'})
        self.assertEqual(draft['estimate']['nutrients']['sodium_mg'], 30)
        self.assertIsNone(draft['estimate']['nutrients']['fat_g'])
        self.assertEqual(draft['estimate']['sources'][0]['provider'], 'USDA')

    def test_a_contradictory_record_is_not_returned(self):
        """Treat a label whose saturated fat exceeds its total fat as no usable match."""
        broken = {**FOOD, 'foodNutrients': FOOD['foodNutrients'] + [
            {'nutrientId': 1004, 'unitName': 'G', 'value': 5}, {'nutrientId': 1258, 'unitName': 'G', 'value': 17}]}
        self.assertEqual(self.lookup([broken]).status_code, 404)

    def test_a_miss_says_so_at_once_without_searching_the_web(self):
        """
        Answer a barcode the database does not hold with a plain miss.

        Seen on the phone on 11 Nov with 9310947004582: the retailer search behind the miss
        returned nothing for seven codes tried, and only added a wait before the same answer.
        """
        response = self.lookup([{**FOOD, 'gtinUpc': '9556001234568'}], code='9310947004582')
        self.assertEqual(response.status_code, 404)
        self.assertNotIn('estimate', response.json())

    def test_an_outage_is_distinguished_from_a_database_miss(self):
        """Report a temporary failure when the database could not be asked."""
        self.assertEqual(self.lookup(None).status_code, 503)

    def lookup(self, foods, code=CODE):
        """Call the barcode API with a fictional USDA reply; a request to any other host fails the test."""
        def respond(request):
            self.assertEqual(request.url.host, 'api.nal.usda.gov')
            self.assertEqual(json.loads(request.content)['query'], code)
            if foods is None:
                raise httpx.ReadTimeout('Fictional timeout')
            return httpx.Response(200, json={'foods': foods})

        transport = httpx.MockTransport(respond)
        client_class = httpx.AsyncClient
        with patch.dict('os.environ', {'USDA_API_KEY': 'fictional', 'TAVILY_API_KEY': 'fictional'}), \
                patch('httpx.AsyncClient', side_effect=lambda **options: client_class(**options, transport=transport)):
            return TestClient(app).post('/api/barcode', json={'code': code})


if __name__ == '__main__':
    unittest.main()
