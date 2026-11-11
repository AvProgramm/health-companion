"""Check the barcode lookup against fictional Open Food Facts replies."""
import asyncio
import unittest
import httpx
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from coach.app import app
from coach.barcode import barcode_reply

# A fictional product as Open Food Facts returns it
PRODUCT = {'code': '9556001234567', 'product_name': 'Fictional oat biscuit', 'product_quantity_unit': 'g',
           'nutriments': {'energy-kcal_100g': 400, 'proteins_100g': 10, 'sodium_100g': 0.3}}


class BarcodeReplyTests(unittest.TestCase):
    def test_label_values_are_per_100_units_and_unknowns_stay_unknown(self):
        reply = barcode_reply({'status': 1, 'product': PRODUCT}, '9556001234567')
        self.assertEqual(reply.name, 'Fictional oat biscuit')
        self.assertEqual((reply.estimate.basis.amount, reply.estimate.basis.unit), (100, 'g'))
        self.assertEqual(reply.estimate.nutrients.kcal, 400)
        # 0.3 g of sodium per 100 g, as milligrams
        self.assertAlmostEqual(reply.estimate.nutrients.sodium_mg, 300)
        self.assertIsNone(reply.estimate.nutrients.fat_g)

    def test_a_liquid_keeps_its_unit(self):
        reply = barcode_reply({'status': 1, 'product': {**PRODUCT, 'product_quantity_unit': 'ml'}}, '9556001234567')
        self.assertEqual(reply.estimate.basis.unit, 'mL')

    def test_an_unknown_barcode_gives_nothing(self):
        self.assertIsNone(barcode_reply({'status': 0}, '9556001234567'))

    def test_a_product_with_no_name_or_no_values_gives_nothing(self):
        self.assertIsNone(barcode_reply({'status': 1, 'product': {**PRODUCT, 'product_name': ''}}, '9556001234567'))
        self.assertIsNone(barcode_reply({'status': 1, 'product': {**PRODUCT, 'nutriments': {}}}, '9556001234567'))

    def test_the_code_comes_from_the_request_when_the_reply_omits_it(self):
        product = {key: value for key, value in PRODUCT.items() if key != 'code'}
        self.assertIsNotNone(barcode_reply({'status': 1, 'product': product}, '9556001234567'))


class BarcodeEndpointTests(unittest.TestCase):
    def test_only_digits_are_accepted(self):
        for code in ('abc', '123', '1' * 15):
            with self.subTest(code=code):
                self.assertEqual(TestClient(app).post('/api/barcode', json={'code': code}).status_code, 422)

    def test_extra_fields_are_refused(self):
        self.assertEqual(TestClient(app).post('/api/barcode', json={'code': '9556001234567', 'diary': []}).status_code, 422)

    def test_another_site_is_refused(self):
        self.assertEqual(TestClient(app).post('/api/barcode', json={'code': '9556001234567'}, headers={'origin': 'https://example.org'}).status_code, 403)

    def test_conflicting_database_nutrition_is_not_offered_as_a_label(self):
        """Refuse conflicting energy units or a fat breakdown above total fat."""
        # Reported on the phone on 11 Nov: 52.2 kcal and 2410 kJ were both per 100 g.
        for nutriments in (
            {'energy-kcal_100g': 52.2, 'energy-kj_100g': 2410, 'fat_100g': 65},
            {'energy-kcal_100g': 576, 'fat_100g': 5, 'saturated-fat_100g': 17.3},
        ):
            with self.subTest(nutriments=nutriments):
                product = {**PRODUCT, 'nutriments': nutriments}
                transport = httpx.MockTransport(
                    lambda _request: httpx.Response(200, json={'status': 1, 'product': product}),
                )
                client_class = httpx.AsyncClient
                with patch('coach.barcode.httpx.AsyncClient',
                           side_effect=lambda **options: client_class(**options, transport=transport)), \
                        patch('coach.app.verify_barcode_label', AsyncMock(return_value=None)):
                    response = TestClient(app).post('/api/barcode', json={'code': PRODUCT['code']})
                self.assertEqual(response.status_code, 409)
                self.assertNotIn('estimate', response.json())

    def test_reviewed_label_recovers_the_reported_barcode(self):
        """Replace the conflicting data with the checked per-100-g label."""
        # Public product code and conflicting database values reported on 11 Nov.
        code = '9310947004582'
        product = {**PRODUCT, 'code': code, 'product_name': 'Fictional spread',
                   'nutriments': {'energy-kcal_100g': 52.2, 'energy-kj_100g': 2410, 'fat_100g': 5}}
        transport = httpx.MockTransport(lambda _request: httpx.Response(200, json={'status': 1, 'product': product}))
        client_class = httpx.AsyncClient
        with patch('coach.barcode.httpx.AsyncClient',
                   side_effect=lambda **options: client_class(**options, transport=transport)):
            response = TestClient(app).post('/api/barcode', json={'code': code})

        self.assertEqual(response.status_code, 200)
        result = response.json()['estimate']
        self.assertEqual(result['basis'], {'amount': 100, 'unit': 'g'})
        self.assertAlmostEqual(result['nutrients']['kcal'], 576.0, places=1)
        self.assertEqual(result['nutrients']['fat_g'], 65)
        self.assertEqual(result['nutrients']['satfat_g'], 17.3)
        self.assertIsNone(result['nutrients']['protein_g'])
        self.assertNotEqual(result['sources'][0]['provider'], 'Open Food Facts')

    def test_an_unknown_product_is_a_404(self):
        async def nothing(_code):
            return None
        with patch('coach.app.look_up_barcode', nothing):
            self.assertEqual(TestClient(app).post('/api/barcode', json={'code': '9556001234567'}).status_code, 404)


if __name__ == '__main__':
    unittest.main()
