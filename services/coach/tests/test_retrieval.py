"""Check bounded public retrieval and model fallbacks with fictional data."""
import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch
import httpx
from coach.retrieval import WebEvidence, parse_search_results
from coach.huggingface import hf_estimate
from coach.models import Estimate
from coach.pipeline import estimate_food


def proposal():
    """Return fictional nutrition with no personal diary records."""
    keys = ['kcal', 'protein_g', 'fat_g', 'satfat_g', 'total_sugar_g', 'added_sugar_g']
    return {'basis': {'amount': 100, 'unit': 'g'},
        'nutrients': {key: 120 if key == 'kcal' else None for key in keys},
        'range': {key: {'low': 100, 'high': 150} if key == 'kcal' else None for key in keys},
        'sourceKind': 'ai_estimate', 'reason': 'Fictional evidence.',
        'sources': [{'provider': 'Hugging Face AI', 'description': 'Model estimate.', 'url': 'https://huggingface.co/'}]}


class RetrievalTests(unittest.TestCase):
    """Check evidence filtering and the database to web to model order."""

    def setUp(self):
        """Keep automatic enrichment independent of the laptop credentials."""
        environment = patch.dict('os.environ', {'TAVILY_API_KEY': ''})
        environment.start()
        self.addCleanup(environment.stop)

    def test_filters_unsafe_irrelevant_and_non_nutrition_results(self):
        """Keep only relevant public nutrition snippets with a bounded length."""
        results = parse_search_results({'results': [
            {'title': 'Fictional oatcakes nutrition', 'url': 'https://example.org/oatcakes', 'content': 'Fictional oatcakes: 120 kcal per 100 g. ' + 'x' * 3000},
            {'title': 'Fictional oatcakes nutrition', 'url': 'http://127.0.0.1/private', 'content': '120 kcal'},
            {'title': 'Fictional oatcakes', 'url': 'https://[broken', 'content': '120 kcal'},
            {'title': 'Unrelated beans', 'url': 'https://example.org/beans', 'content': '100 kcal'},
            {'title': 'Fictional oatcakes story', 'url': 'https://example.org/story', 'content': 'A story about breakfast.'},
        ]}, 'fictional oatcakes')
        self.assertEqual(len(results), 1)
        self.assertLessEqual(len(results[0].content), 1800)
        self.assertEqual(results[0].url, 'https://example.org/oatcakes')

    def test_database_hit_skips_web_and_both_models(self):
        """Avoid extra requests when the composition database already answers."""
        result = Estimate.model_validate(proposal())
        database = AsyncMock(return_value=result)
        retrieval, groq, hf = AsyncMock(), AsyncMock(), AsyncMock()
        self.assertEqual(asyncio.run(estimate_food('fictional oatcakes', '100 g', database, groq, retrieval, hf)), result)
        retrieval.assert_not_awaited()
        groq.assert_not_awaited()
        hf.assert_not_awaited()

    def test_groq_quota_failure_uses_hf_with_the_same_public_evidence(self):
        """Try the backup after a provider error without adding diary context."""
        evidence = [WebEvidence('source-1', 'Fictional oatcakes', 'https://example.org/oatcakes', '120 kcal per 100 g')]
        database = AsyncMock(return_value=None)
        retrieval = AsyncMock(return_value=evidence)
        groq = AsyncMock(side_effect=httpx.HTTPStatusError('Quota exceeded.', request=httpx.Request('POST', 'https://example.org'), response=httpx.Response(429)))
        hf = AsyncMock(return_value=Estimate.model_validate(proposal()))
        result = asyncio.run(estimate_food('fictional oatcakes', '100 g', database, groq, retrieval, hf))
        self.assertIsNotNone(result)
        groq.assert_awaited_once_with('fictional oatcakes', '100 g', evidence)
        hf.assert_awaited_once_with('fictional oatcakes', '100 g', evidence)

    def test_retrieval_timeout_still_allows_a_model_estimate(self):
        """Keep the fallback chain useful when web search is unavailable."""
        groq = AsyncMock(return_value=Estimate.model_validate(proposal()))
        hf = AsyncMock()
        result = asyncio.run(estimate_food('fictional oatcakes', '100 g', AsyncMock(return_value=None), groq, AsyncMock(side_effect=TimeoutError()), hf))
        self.assertIsNotNone(result)
        groq.assert_awaited_once_with('fictional oatcakes', '100 g', [])
        hf.assert_not_awaited()

    def test_hf_adapter_preserves_evidence_provenance_and_food_only_input(self):
        """Accept only citations belonging to the supplied public evidence."""
        evidence = [WebEvidence('source-1', 'Fictional oatcakes', 'https://example.org/oatcakes', '120 kcal per 100 g')]
        captured = []
        data = proposal()
        del data['sourceKind']
        del data['sources']
        data['evidenceIds'] = ['source-1']

        def respond(request):
            """Capture a fictional hosted-model request without using a token."""
            captured.append(json.loads(request.content))
            return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(data)}}]})

        client = httpx.AsyncClient
        with patch.dict('os.environ', {'HF_TOKEN': 'fictional-token'}):
            with patch('coach.model_client.httpx.AsyncClient', side_effect=lambda **kwargs: client(**kwargs, transport=httpx.MockTransport(respond))):
                result = asyncio.run(hf_estimate('fictional oatcakes', '100 g', evidence))
        self.assertEqual(result.sourceKind, 'ai_estimate')
        self.assertEqual(result.sources[0].url, 'https://example.org/oatcakes')
        self.assertEqual(json.loads(captured[0]['messages'][1]['content']), {'name': 'fictional oatcakes', 'portionText': '100 g'})

    def test_model_exhaustion_returns_unavailable_without_a_save(self):
        """Leave manual logging available after both model providers fail."""
        result = asyncio.run(estimate_food('fictional oatcakes', '100 g',
            AsyncMock(return_value=None), AsyncMock(side_effect=TimeoutError()),
            AsyncMock(return_value=[]), AsyncMock(side_effect=ValueError('No usable proposal.'))))
        self.assertIsNone(result)

    def test_rejects_a_model_citation_not_present_in_retrieval(self):
        """Reject invented source IDs rather than attaching an unrelated URL."""
        evidence = [WebEvidence('source-1', 'Fictional oatcakes', 'https://example.org/oatcakes', '120 kcal per 100 g')]
        data = proposal()
        del data['sourceKind']
        del data['sources']
        data['evidenceIds'] = ['invented-source']
        original = httpx.AsyncClient
        transport = httpx.MockTransport(lambda request: httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(data)}}]}))
        with patch.dict('os.environ', {'HF_TOKEN': 'fictional-token'}):
            with patch('coach.model_client.httpx.AsyncClient', side_effect=lambda **kwargs: original(**kwargs, transport=transport)):
                with self.assertRaises(ValueError):
                    asyncio.run(hf_estimate('fictional oatcakes', '100 g', evidence))
