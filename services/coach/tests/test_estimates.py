"""Check fictional database records and the estimate boundary."""
import asyncio
import json
import httpx
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from coach.app import app
from coach.databases import parse_usda, parse_off, average_matches
from coach.models import Estimate
from coach.pipeline import estimate_food


class EstimateTests(unittest.TestCase):
    """Check database-first estimates without contacting a provider."""

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

    def test_database_prevents_llm_call_and_timeout_falls_back(self):
        """Use the LLM only after no usable database match remains."""
        database = AsyncMock(return_value=Estimate.model_validate(proposal('database')))
        llm = AsyncMock(return_value=Estimate.model_validate(proposal()))
        result = asyncio.run(estimate_food('Fictional oats', '50 g', database, llm))
        self.assertEqual(result.sourceKind, 'database')
        llm.assert_not_awaited()
        database.side_effect = TimeoutError()
        result = asyncio.run(estimate_food('Fictional oats', '50 g', database, llm))
        self.assertEqual(result.sourceKind, 'ai_estimate')
        llm.side_effect = TimeoutError()
        self.assertIsNone(asyncio.run(estimate_food('Fictional oats', '50 g', database, llm)))

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
        with patch.dict('os.environ', {'GROQ_API_KEY': 'fictional-test-key', 'USDA_API_KEY': 'fictional-test-key'}):
            with patch('coach.providers.httpx.AsyncClient', side_effect=lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(respond))):
                response = TestClient(app).post('/api/estimate', json={'name': 'Fictional oats', 'portionText': '50 g'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['sourceKind'], 'ai_estimate')
        self.assertEqual(response.json()['sources'][0]['provider'], 'Groq AI')
        model_request = next(request for request in requests if request.url.host == 'api.groq.com')
        body = json.loads(model_request.content)
        self.assertEqual(json.loads(body['messages'][1]['content']), {'name': 'Fictional oats', 'portionText': '50 g'})
        self.assertEqual(body['response_format'], {'type': 'json_object'})
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
    keys = ['kcal', 'protein_g', 'fat_g', 'satfat_g', 'total_sugar_g', 'added_sugar_g']
    return {
        'basis': {'amount': 50, 'unit': 'g'},
        'nutrients': {key: 60 if key == 'kcal' else None for key in keys},
        'range': {key: {'low': 50, 'high': 70} if key == 'kcal' else None for key in keys},
        'sourceKind': kind, 'reason': 'Fictional test estimate.',
        'sources': [{'provider': 'Groq' if kind == 'ai_estimate' else 'USDA',
                     'description': 'Fictional oats', 'url': 'https://example.org/fictional'}],
    }
