"""Check packaged-food lookup against fictional records from both databases."""
import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from coach.app import app
from coach.models import Estimate


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
# A fictional crowd-sourced record whose values agree with one another
PRODUCT = {'code': CODE, 'product_name': 'Fictional oat spread', 'product_quantity_unit': 'g', 'nutriments': {
    'energy_100g': 2092, 'energy-kj_100g': 2092, 'energy-kcal_100g': 500, 'fat_100g': 50, 'saturated-fat_100g': 10,
    'proteins_100g': 2, 'sugars_100g': 1, 'sugars_modifier': '<', 'added-sugars_100g': 0, 'sodium_100g': 0.3}}
# The same record with the two mistakes seen on the phone: energy and total fat a tenth of what the label says
BROKEN = {**PRODUCT, 'nutriments': {**PRODUCT['nutriments'], 'energy-kcal_100g': 50, 'fat_100g': 5}}
# Every nutrient key, unknown unless a test fills it in
UNKNOWN = dict.fromkeys(('kcal', 'protein_g', 'carbs_g', 'fibre_g', 'total_sugar_g', 'added_sugar_g',
                         'fat_g', 'satfat_g', 'unsatfat_g', 'sodium_mg'))
# What the named-food estimator would return for the product's name
BY_NAME = Estimate.model_validate({
    'basis': {'amount': 100.0, 'unit': 'g'}, 'sourceKind': 'ai_estimate', 'reason': 'Fictional estimate.',
    'nutrients': {**UNKNOWN, 'kcal': 480.0, 'fat_g': 52.0},
    'range': {**UNKNOWN, 'kcal': {'low': 440.0, 'high': 520.0}, 'fat_g': {'low': 48.0, 'high': 56.0}},
    'sources': [{'provider': 'Fictional model', 'description': 'Fictional', 'url': 'https://example.org/model'}]})


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
        response = self.lookup([different, older, FOOD], product=PRODUCT)
        self.assertEqual(response.status_code, 200)
        draft = response.json()
        self.assertEqual((draft['name'], draft['match']), ('Fictional oat drink', 'barcode'))
        self.assertEqual(draft['estimate']['basis'], {'amount': 100, 'unit': 'mL'})
        self.assertEqual(draft['estimate']['nutrients']['sodium_mg'], 30)
        self.assertIsNone(draft['estimate']['nutrients']['fat_g'])
        self.assertEqual(draft['estimate']['sources'][0]['provider'], 'USDA')

    def test_a_contradictory_usda_record_is_not_returned(self):
        """Treat a label whose saturated fat exceeds its total fat as no usable match."""
        broken = {**FOOD, 'foodNutrients': FOOD['foodNutrients'] + [
            {'nutrientId': 1004, 'unitName': 'G', 'value': 5}, {'nutrientId': 1258, 'unitName': 'G', 'value': 17}]}
        self.assertEqual(self.lookup([broken]).status_code, 404)

    def test_the_second_database_answers_when_the_first_does_not_hold_the_product(self):
        """Use a consistent crowd-sourced label, keeping qualified and estimated values unknown."""
        response = self.lookup([], product=PRODUCT)
        self.assertEqual(response.status_code, 200)
        draft = response.json()
        self.assertEqual((draft['name'], draft['match']), ('Fictional oat spread', 'barcode'))
        self.assertEqual(draft['estimate']['sources'][0]['provider'], 'Open Food Facts')
        self.assertEqual((draft['estimate']['nutrients']['fat_g'], draft['estimate']['nutrients']['sodium_mg']), (50, 300))
        # "<1 g" is not 1 g, and the database's added sugar is its own guess from the ingredients
        self.assertIsNone(draft['estimate']['nutrients']['total_sugar_g'])
        self.assertIsNone(draft['estimate']['nutrients']['added_sugar_g'])

    def test_a_record_that_contradicts_itself_becomes_an_estimate_by_name(self):
        """
        Estimate by the product's name when its record cannot be trusted, and say so.

        Seen on the phone on 11 Nov with 9310947004582: the record held 52.2 kcal beside
        2410 kJ and 5 g of fat beside 35.3 g of monounsaturated fat.
        """
        by_name = AsyncMock(return_value=BY_NAME)
        with patch('coach.barcode.estimate_food', by_name):
            response = self.lookup([], product=BROKEN)
        self.assertEqual(response.status_code, 200)
        draft = response.json()
        by_name.assert_awaited_once_with('Fictional oat spread', '100 g')
        self.assertEqual((draft['name'], draft['match']), ('Fictional oat spread', 'name'))
        self.assertEqual(draft['estimate']['nutrients']['fat_g'], 52)
        self.assertEqual(draft['estimate']['sourceKind'], 'ai_estimate')
        self.assertIn('estimate for "Fictional oat spread"', draft['estimate']['reason'])

    def test_a_product_neither_database_holds_is_a_plain_miss(self):
        """Answer 404 so the phone can move on to the packet's own label."""
        response = self.lookup([{**FOOD, 'gtinUpc': '9556001234568'}])
        self.assertEqual(response.status_code, 404)
        self.assertNotIn('estimate', response.json())

    def test_a_named_product_nobody_can_estimate_is_a_plain_miss(self):
        with patch('coach.barcode.estimate_food', AsyncMock(return_value=None)):
            self.assertEqual(self.lookup([], product=BROKEN).status_code, 404)

    def test_an_outage_is_distinguished_from_a_database_miss(self):
        """Report a temporary failure when a database could not be asked and the other had nothing."""
        self.assertEqual(self.lookup(None).status_code, 503)
        self.assertEqual(self.lookup([], product='outage').status_code, 503)

    def test_one_database_being_down_does_not_hide_the_other(self):
        self.assertEqual(self.lookup(None, product=PRODUCT).status_code, 200)

    def lookup(self, foods, product=None, code=CODE):
        """Call the barcode API with fictional replies from both databases; any other host fails the test."""
        def respond(request):
            # Answer Open Food Facts with the product, a miss, or an outage
            if request.url.host == 'world.openfoodfacts.org':
                self.assertTrue(request.url.path.endswith(f'/{code}.json'))
                if product == 'outage':
                    raise httpx.ReadTimeout('Fictional timeout')
                return httpx.Response(200, json={'status': 0} if product is None else {'status': 1, 'product': product})

            # Answer USDA with its records or an outage
            self.assertEqual(request.url.host, 'api.nal.usda.gov')
            self.assertEqual(json.loads(request.content)['query'], code)
            if foods is None:
                raise httpx.ReadTimeout('Fictional timeout')
            return httpx.Response(200, json={'foods': foods})

        transport = httpx.MockTransport(respond)
        client_class = httpx.AsyncClient
        with patch.dict('os.environ', {'USDA_API_KEY': 'fictional', 'TAVILY_API_KEY': 'fictional'}), \
                patch('httpx.AsyncClient', side_effect=lambda **options: client_class(**{**options, 'transport': transport})):
            return TestClient(app).post('/api/barcode', json={'code': code})


if __name__ == '__main__':
    unittest.main()
