"""Check fictional database records and the estimate boundary."""
import asyncio
import json
import os
import httpx
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from coach.app import app
from coach.databases import parse_usda, parse_off, average_matches
from coach.databases import portion_basis
from coach.model_client import check_energy_consistency, check_model_spread, request_model
from coach.models import Basis, Estimate, Nutrients
from coach.pipeline import estimate_food
from coach.prompts import estimate_prompt


class EstimateTests(unittest.TestCase):
    """Check database-first estimates without contacting a provider."""

    def setUp(self):
        """Keep automatic enrichment independent of the laptop credentials."""
        for patcher in (patch.dict('os.environ', {'TAVILY_API_KEY': ''}), patch('coach.availability.queue', ['Groq', 'Gemini', 'Hugging Face'])):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_usda_preserves_unknown_and_checks_units(self):
        """Return only nutrients expressed in the expected unit."""
        payload = {'foods': [{'fdcId': 123, 'description': 'Fictional oats', 'foodNutrients': [
            {'nutrientId': 1008, 'unitName': 'KCAL', 'value': 120},
            {'nutrientId': 1003, 'unitName': 'G', 'value': 4},
            {'nutrientId': 1004, 'unitName': 'MG', 'value': 900},
        ]}]}
        match = parse_usda(payload, 'oats')[0]
        self.assertEqual(match.nutrients.kcal, 120)
        self.assertIsNone(match.nutrients.added_sugar_g)
        self.assertIsNone(match.nutrients.fat_g)

    # Asked for on 7 Nov: carbohydrate, fibre, sodium and unsaturated fat
    def test_usda_reads_carbs_fibre_sodium_and_sums_unsaturated_fat(self):
        """Read the added nutrients by ID and unit, and add mono and poly fat only when both are known."""
        payload = {'foods': [{'fdcId': 7, 'description': 'Fictional oats', 'foodNutrients': [
            {'nutrientId': 1005, 'unitName': 'G', 'value': 66},
            {'nutrientId': 1079, 'unitName': 'G', 'value': 10},
            {'nutrientId': 1093, 'unitName': 'MG', 'value': 6},
            {'nutrientId': 1292, 'unitName': 'G', 'value': 2.2},
            {'nutrientId': 1293, 'unitName': 'G', 'value': 2.5},
        ]}]}
        match = parse_usda(payload, 'oats')[0]
        self.assertEqual((match.nutrients.carbs_g, match.nutrients.fibre_g, match.nutrients.sodium_mg), (66, 10, 6))
        self.assertAlmostEqual(match.nutrients.unsatfat_g, 4.7)
        # With only one part known, unsaturated fat stays unknown rather than half-counted
        payload['foods'][0]['foodNutrients'] = payload['foods'][0]['foodNutrients'][:4]
        self.assertIsNone(parse_usda(payload, 'oats')[0].nutrients.unsatfat_g)

    # Reported on 7 Nov: "milk" with "250 ml" lost USDA's calories and fell through to the model
    def test_usda_liquid_records_are_per_100_ml(self):
        """Read a branded record served in millilitres as per 100 mL, so a volume portion can use it."""
        payload = {'foods': [{'fdcId': 1, 'description': 'MILK', 'dataType': 'Branded', 'servingSize': 240.0,
            'servingSizeUnit': 'MLT', 'foodNutrients': [
                {'nutrientId': 1008, 'unitName': 'KCAL', 'value': 62.0},
                {'nutrientId': 1003, 'unitName': 'G', 'value': 3.33},
            ]}, {'fdcId': 2, 'description': 'MILK', 'dataType': 'Branded', 'servingSize': 236.0,
            'servingSizeUnit': 'ml', 'foodNutrients': [{'nutrientId': 1008, 'unitName': 'KCAL', 'value': 55.0}]}]}
        result = average_matches(parse_usda(payload, 'milk'), portion_basis('250 ml'))
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result.nutrients.kcal, (62.0 + 55.0) / 2 * 2.5)
        # A record without a serving unit keeps the published 100 g basis
        del payload['foods'][0]['servingSizeUnit']
        self.assertEqual(parse_usda(payload, 'milk')[0].unit, 'g')

    def test_usda_foundation_total_sugar_is_read(self):
        """Read total sugar from the Foundation identifier when the older one is absent."""
        payload = {'foods': [{'fdcId': 3, 'description': 'Bananas, ripe and slightly ripe, raw', 'dataType': 'Foundation',
            'foodNutrients': [{'nutrientId': 1063, 'unitName': 'G', 'value': 15.8}]}]}
        self.assertEqual(parse_usda(payload, 'bananas raw')[0].nutrients.total_sugar_g, 15.8)
        # When both identifiers are published, the first one listed is kept rather than overwritten
        payload['foods'][0]['foodNutrients'].append({'nutrientId': 2000, 'unitName': 'G', 'value': 99})
        self.assertEqual(parse_usda(payload, 'bananas raw')[0].nutrients.total_sugar_g, 15.8)

    def test_off_converts_sodium_grams_to_milligrams(self):
        """Open Food Facts publishes sodium in grams; the diary stores milligrams."""
        payload = {'products': [{'code': '111', 'product_name': 'Fictional oats', 'nutriments': {
            'carbohydrates_100g': 60, 'fiber_100g': 9, 'sodium_100g': 0.4,
            'monounsaturated-fat_100g': 2, 'polyunsaturated-fat_100g': 3}}]}
        match = parse_off(payload, 'oats')[0]
        self.assertEqual((match.nutrients.carbs_g, match.nutrients.fibre_g), (60, 9))
        self.assertAlmostEqual(match.nutrients.sodium_mg, 400)
        self.assertEqual(match.nutrients.unsatfat_g, 5)

    def test_malformed_records_are_ignored_and_piece_counts_are_not_grams(self):
        """Reject malformed upstream rows and incompatible serving units."""
        self.assertEqual(parse_usda({'foods': [None, {'description': None}]}, 'oats'), [])
        self.assertEqual(parse_off({'products': [None, {'product_name': None}]}, 'oats'), [])
        matches = parse_off({'products': [{'code': '111', 'product_name': 'oats', 'nutriments': {'energy-kcal_100g': 120}}]}, 'oats')
        self.assertIsNone(average_matches(matches, {'amount': 2, 'unit': 'piece'}))
        self.assertIsNone(average_matches(matches, {'amount': 100, 'unit': 'mL'}))

    def test_off_and_average_spread(self):
        """Average known matches and leave missing nutrients null."""
        payload = {'products': [
            {'code': '111', 'product_name': 'Fictional oats', 'nutriments': {'energy-kcal_100g': 100}},
            {'code': '222', 'product_name': 'Other oats', 'nutriments': {'energy-kcal_100g': 140}},
            {'code': '333', 'product_name': 'Unrelated beans', 'nutriments': {'energy-kcal_100g': 900}},
        ]}
        result = average_matches(parse_off(payload, 'oats'), {'amount': 50, 'unit': 'g'})
        self.assertEqual(result.nutrients.kcal, 60)
        self.assertEqual(result.range['kcal'].low, 50)
        self.assertEqual(result.range['kcal'].high, 70)
        self.assertIsNone(result.nutrients.protein_g)
        self.assertIsNone(result.range['protein_g'])
        self.assertEqual(len(result.sources), 2)

    def test_llm_validator_rejects_missing_negative_and_inverted_ranges(self):
        """Reject incomplete or contradictory model responses."""
        valid = proposal()
        self.assertEqual(Estimate.model_validate(valid).nutrients.kcal, 60)
        for changed in [
            {**valid, 'nutrients': {'kcal': 60}},
            {**valid, 'nutrients': {**valid['nutrients'], 'kcal': -1}},
            {**valid, 'range': {**valid['range'], 'kcal': {'low': 70, 'high': 50}}},
            {**valid, 'nutrients': {**valid['nutrients'], 'kcal': float('nan')}},
        ]:
            with self.assertRaises(ValueError):
                Estimate.model_validate(changed)

    def test_all_unknown_response_is_not_a_usable_estimate(self):
        """Reject a proposal with no nutrition while retaining genuine zero values."""
        # Reported from the phone on 7 Nov: nasi lemak with an empty portion.
        empty = proposal()
        empty['nutrients'] = dict.fromkeys(empty['nutrients'])
        empty['range'] = dict.fromkeys(empty['range'])
        with self.assertRaises(ValueError):
            Estimate.model_validate(empty)
        zero = proposal()
        zero['nutrients']['kcal'] = 0
        zero['range']['kcal'] = {'low': 0, 'high': 0}
        self.assertEqual(Estimate.model_validate(zero).nutrients.kcal, 0)

    def test_database_prevents_llm_call_and_timeout_falls_back(self):
        """Use the LLM only after no usable database match remains."""
        database = AsyncMock(return_value=Estimate.model_validate(proposal('database')))
        llm = AsyncMock(return_value=Estimate.model_validate(proposal()))
        result = asyncio.run(estimate_food('Fictional oats', '50 g', database, AsyncMock(return_value=[]), {'Groq': llm, 'Hugging Face': AsyncMock(return_value=None)}))
        self.assertEqual(result.sourceKind, 'database')
        llm.assert_not_awaited()
        database.side_effect = TimeoutError()
        result = asyncio.run(estimate_food('Fictional oats', '50 g', database, AsyncMock(return_value=[]), {'Groq': llm, 'Hugging Face': AsyncMock(return_value=None)}))
        self.assertEqual(result.sourceKind, 'ai_estimate')
        llm.side_effect = TimeoutError()
        self.assertIsNone(asyncio.run(estimate_food('Fictional oats', '50 g', database, AsyncMock(return_value=[]), {'Groq': llm, 'Hugging Face': AsyncMock(return_value=None)})))

    # Seen on 7 Nov: "nasi lemak, 2" came back as 494.0 kcal (494.0–494.0)
    def test_model_estimate_needs_a_real_range(self):
        """Reject false certainty from a model, but allow an exact zero."""
        exact = proposal()
        exact['range'] = {**exact['range'], 'kcal': {'low': 60, 'high': 60}}
        with self.assertRaises(ValueError):
            check_model_spread(Estimate.model_validate(exact))
        zero = proposal()
        zero['nutrients'] = {**zero['nutrients'], 'total_sugar_g': 0}
        zero['range'] = {**zero['range'], 'total_sugar_g': {'low': 0, 'high': 0}}
        check_model_spread(Estimate.model_validate(zero))

    # Added 7 Nov after checking "nasi lemak chicken, 1 plate" by hand: 4P + 4C + 9F = 995 vs 1015 kcal
    def test_model_energy_must_roughly_match_its_macros(self):
        """Reject a model estimate whose macros contradict its own energy, within 25%."""
        def with_values(**values):
            data = proposal()
            data['nutrients'] = {**data['nutrients'], **values}
            data['range'] = {key: None if value is None else {'low': value * 0.9, 'high': value * 1.1}
                             for key, value in data['nutrients'].items()}
            return Estimate.model_validate(data)

        # 4 x 20 + 4 x 60 + 9 x 20 = 500 kcal: consistent
        check_energy_consistency(with_values(kcal=500, protein_g=20, carbs_g=60, fat_g=20))
        # The phone result: 4 x 29 + 4 x 87 + 9 x 59 = 995 against 1015, within 2%
        check_energy_consistency(with_values(kcal=1015, protein_g=29, carbs_g=87, fat_g=59))
        # 860 kcal of macros claimed as 500 kcal
        with self.assertRaises(ValueError):
            check_energy_consistency(with_values(kcal=500, protein_g=20, carbs_g=60, fat_g=60))
        # 2000 kcal claimed for only 500 kcal of macros
        with self.assertRaises(ValueError):
            check_energy_consistency(with_values(kcal=2000, protein_g=20, carbs_g=60, fat_g=20))
        # Carbohydrate unknown: fat alone (450 kcal) cannot exceed a 300 kcal total
        with self.assertRaises(ValueError):
            check_energy_consistency(with_values(kcal=300, protein_g=None, carbs_g=None, fat_g=50))
        # Carbohydrate unknown, known macros below the total: nothing to contradict
        check_energy_consistency(with_values(kcal=1110, protein_g=54, carbs_g=None, fat_g=72))
        # Energy unknown: nothing to check against
        check_energy_consistency(with_values(kcal=None, protein_g=20, carbs_g=60, fat_g=20))

    def test_counted_servings_are_asked_once_and_multiplied_in_code(self):
        """Ask the model about one serving and scale its values and bounds here."""
        requests = []

        def respond(request):
            """Answer the model with one fictional serving: 60 kcal (50-70)."""
            requests.append(request)
            model_data = proposal()
            model_data['basis'] = {'amount': 1, 'unit': 'piece'}
            del model_data['sources']
            del model_data['sourceKind']
            return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(model_data)}}]})

        original_client = httpx.AsyncClient
        with patch('coach.model_client.httpx.AsyncClient', side_effect=lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(respond))):
            result = asyncio.run(request_model('https://example.org/v1', 'fictional-key', 'fictional-model', 'Groq AI',
                'https://groq.com/', 'Fictional dish', '2 plates', portion_basis('2 plates'), (), True))
        self.assertEqual(result.basis.model_dump(), {'amount': 2.0, 'unit': 'piece'})
        self.assertEqual(result.nutrients.kcal, 120)
        self.assertEqual(result.range['kcal'].model_dump(), {'low': 100, 'high': 140})
        # Only the food name and a fixed serving phrase reach the model
        self.assertEqual(json.loads(json.loads(requests[0].content)['messages'][1]['content']),
                         {'name': 'Fictional dish', 'portionText': '1'})

    def test_prompt_reads_a_bare_count_as_servings_not_cups(self):
        """Keep the portion rule that fixed "2 nasi lemak" becoming 2 cups."""
        prompt = estimate_prompt(Basis(amount=2, unit='piece'))
        self.assertIn('Never reinterpret servings as cups', prompt)
        self.assertIn('strictly below its high', prompt)

    def test_http_adapters_fall_back_to_groq_with_only_food_input(self):
        """Exercise the real endpoint and adapters with fictional HTTP responses."""
        requests = []

        def respond(request):
            """Return deterministic provider responses and capture their payloads."""
            requests.append(request)
            if request.url.host == 'api.nal.usda.gov':
                return httpx.Response(200, json={'foods': []})
            if request.url.host == 'world.openfoodfacts.org':
                return httpx.Response(200, json={'products': []})
            model_data = proposal()
            del model_data['sources']
            del model_data['sourceKind']
            return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(model_data)}}]})

        original_client = httpx.AsyncClient
        with patch.dict('os.environ', {'GROQ_API_KEY': 'fictional-test-key', 'USDA_API_KEY': 'fictional-test-key', 'TAVILY_API_KEY': '', 'HF_TOKEN': '', 'GEMINI_API_KEY': ''}):
            os.environ.pop('GROQ_MODEL', None)
            with patch('coach.providers.httpx.AsyncClient', side_effect=lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(respond))):
                response = TestClient(app).post('/api/estimate', json={'name': 'Fictional oats', 'portionText': '50 g'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['sourceKind'], 'ai_estimate')
        self.assertEqual(response.json()['sources'][0]['provider'], 'Groq AI')
        model_request = next(request for request in requests if request.url.host == 'api.groq.com')
        body = json.loads(model_request.content)
        self.assertEqual(json.loads(body['messages'][1]['content']), {'name': 'Fictional oats', 'portionText': '50 g'})
        self.assertEqual(body['response_format']['type'], 'json_schema')
        self.assertTrue(body['response_format']['json_schema']['strict'])
        self.assertEqual(body['model'], 'openai/gpt-oss-20b')
        self.assertEqual(body['reasoning_effort'], 'low')
        self.assertEqual(len(requests), 3)

    def test_endpoint_rejects_diary_and_does_not_echo_invalid_input(self):
        """Reject extra personal fields before calling any provider."""
        response = TestClient(app).post('/api/estimate', json={
            'name': 'Fictional oats', 'portionText': '50 g', 'diary': 'private-history-marker',
        })
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('private-history-marker', response.text)


def proposal(kind='ai_estimate'):
    """Return a complete fictional proposal for boundary tests."""
    keys = list(Nutrients.model_fields)
    return {
        'basis': {'amount': 50, 'unit': 'g'},
        'nutrients': {key: 60 if key == 'kcal' else None for key in keys},
        'range': {key: {'low': 50, 'high': 70} if key == 'kcal' else None for key in keys},
        'sourceKind': kind, 'reason': 'Fictional test estimate.',
        'sources': [{'provider': 'Groq' if kind == 'ai_estimate' else 'USDA',
                     'description': 'Fictional oats', 'url': 'https://example.org/fictional'}],
    }
