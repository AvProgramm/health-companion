"""Check cheap, evidence-only completion of missing nutrients."""
import asyncio
import unittest
from unittest.mock import AsyncMock, patch
import httpx
from coach.models import Estimate
from coach.retrieval import WebEvidence
from coach.enrichment import enrich_unknown


def base_estimate():
    """Return fictional known nutrition with only added sugar missing."""
    values = {'kcal': 120, 'protein_g': 4, 'carbs_g': 20, 'fibre_g': 2, 'total_sugar_g': 5, 'added_sugar_g': None,
              'fat_g': 2, 'satfat_g': 1, 'unsatfat_g': 1, 'sodium_mg': 90}
    return Estimate.model_validate({'basis': {'amount': 50, 'unit': 'g'}, 'nutrients': values,
        'range': {key: None if value is None else {'low': value, 'high': value} for key,value in values.items()},
        'sourceKind': 'database', 'reason': 'Fictional label.',
        'sources': [{'provider': 'USDA', 'description': 'Fictional oatcakes', 'url': 'https://example.org/original'}]})


class EnrichmentTests(unittest.TestCase):
    """Check null-only updates without inference, overwrites or repeated searches."""

    def test_fills_explicit_added_sugar_and_keeps_known_values(self):
        """Scale explicit grams and retain all original known fields and sources."""
        base = base_estimate()
        before = base.model_dump()
        search = AsyncMock(return_value=[WebEvidence('missing-1','Fictional oatcakes','https://example.org/label',
            'Fictional oatcakes. Energy 900 kcal. Added sugars: 2 g per 100 g.')])
        result = asyncio.run(enrich_unknown('Fictional oatcakes', '50 g', base, search))
        self.assertEqual(result.nutrients.added_sugar_g, 1)
        self.assertEqual(result.range['added_sugar_g'].low, 1)
        self.assertEqual(result.nutrients.kcal, 120)
        self.assertEqual(base.model_dump(), before)
        self.assertEqual(result.sourceKind, 'web_estimate')
        self.assertEqual(result.sources[-1].url, 'https://example.org/label')
        search.assert_awaited_once()

    def test_total_sugar_is_not_added_sugar_and_ambiguous_units_stay_unknown(self):
        """Reject sugar substitution, incompatible units and mixed serving bases."""
        for content in ['Total sugars: 20 g per 100 g.', 'Added sugars: 2 g per 100 mL.',
                        'Added sugars: 2 g per 100 g and per 50 g.', 'Added sugars: -2 g per 100 g.']:
            base = base_estimate()
            search = AsyncMock(return_value=[WebEvidence('missing-1','Fictional oatcakes','https://example.org/label',content)])
            result = asyncio.run(enrich_unknown('Fictional oatcakes', '50 g', base, search))
            self.assertIsNone(result.nutrients.added_sugar_g)
            self.assertEqual(result.model_dump(), base.model_dump())

    def test_no_query_for_complete_values_and_failure_keeps_the_proposal(self):
        """Skip a complete proposal and preserve useful data when search fails."""
        base = base_estimate()
        complete = base.model_copy(deep=True)
        complete.nutrients.added_sugar_g = 0
        search = AsyncMock()
        asyncio.run(enrich_unknown('Fictional oatcakes', '50 g', complete, search))
        search.assert_not_awaited()
        failing = AsyncMock(side_effect=TimeoutError())
        self.assertEqual(asyncio.run(enrich_unknown('Fictional oatcakes', '50 g', base, failing)), base)

    def test_every_kind_of_provider_failure_keeps_the_proposal(self):
        """Keep the proposal for each failure the other provider callers already survive."""
        base = base_estimate()
        for failure in (TimeoutError(), httpx.ConnectError('fictional'), ValueError(), KeyError(), IndexError(), TypeError()):
            with self.subTest(failure=type(failure).__name__):
                failing = AsyncMock(side_effect=failure)
                self.assertEqual(asyncio.run(enrich_unknown('Fictional oatcakes', '50 g', base, failing)), base)

    def test_sodium_is_read_in_milligrams_and_every_nutrient_has_a_search_label(self):
        """Fill sodium from an explicit mg value, and build a query for any missing nutrient."""
        base = base_estimate().model_copy(deep=True)
        base.nutrients.sodium_mg = None
        base.range['sodium_mg'] = None
        calls = []

        def respond(request):
            """Return a fictional label giving sodium in milligrams."""
            import json
            calls.append(json.loads(request.content)['query'])
            return httpx.Response(200, json={'results': [{'title': 'Fictional oatcakes label', 'url': 'https://example.org/label',
                'content': 'Fictional oatcakes per 100 g. Sodium: 400 mg. Added sugars: 2 g.'}]})
        client = httpx.AsyncClient
        with patch.dict('os.environ', {'TAVILY_API_KEY': 'fictional-token'}):
            with patch('coach.retrieval.httpx.AsyncClient', side_effect=lambda **kwargs: client(**kwargs, transport=httpx.MockTransport(respond))):
                result = asyncio.run(enrich_unknown('Fictional oatcakes', '50 g', base))
        # 400 mg per 100 g, scaled to the 50 g portion
        self.assertEqual(result.nutrients.sodium_mg, 200)
        self.assertIn('sodium', calls[0])

    def test_live_adapter_budget_is_one_small_search_with_no_model(self):
        """Send only a targeted public query with two bounded results."""
        calls=[]
        def respond(request):
            """Return fictional label text from the search transport."""
            import json
            calls.append((request.url.host,json.loads(request.content)))
            return httpx.Response(200,json={'results':[{'title':'Fictional oatcakes label','url':'https://example.org/label',
                'content':'Fictional oatcakes. Added sugars: 2 g per 100 g.'}]})
        client=httpx.AsyncClient
        with patch.dict('os.environ', {'TAVILY_API_KEY':'fictional-token'}):
            with patch('coach.retrieval.httpx.AsyncClient',side_effect=lambda **kwargs: client(**kwargs,transport=httpx.MockTransport(respond))):
                result=asyncio.run(enrich_unknown('Fictional oatcakes','50 g',base_estimate()))
        self.assertEqual(result.nutrients.added_sugar_g,1)
        self.assertEqual(len(calls),1)
        self.assertEqual(calls[0][0],'api.tavily.com')
        self.assertEqual(calls[0][1]['max_results'],2)
        self.assertIn('added sugar',calls[0][1]['query'])
        self.assertNotIn('120',calls[0][1]['query'])
