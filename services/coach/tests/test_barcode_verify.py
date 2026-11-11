"""Check the AI selector with fictional, independently checked label excerpts."""
import asyncio
import unittest
from unittest.mock import AsyncMock

from coach.retrieval import WebEvidence


# Keep the product, source and nutrients fictional for the general verifier cases.
CODE = '9556001234567'
NAME = 'Fictional oat spread'
EVIDENCE = WebEvidence('source-1', NAME, 'https://example.org/label',
                       f'Barcode {CODE}. Nutrition per 100 g. Energy 418.4 kJ. Total fat 8 g. Protein <1 g.')


class BarcodeVerificationTests(unittest.TestCase):
    def test_model_selects_evidence_and_code_reads_and_converts_values(self):
        """Take the values from the cited label and keep inequalities unknown."""
        from coach.barcode_verify import verify_barcode_label

        search = AsyncMock(return_value=[EVIDENCE])
        ask = AsyncMock(return_value={'sourceId': EVIDENCE.id})
        reply = asyncio.run(verify_barcode_label(CODE, NAME, 'g', search, ask))

        self.assertEqual(reply.name, NAME)
        self.assertAlmostEqual(reply.estimate.nutrients.kcal, 100, places=9)
        self.assertEqual(reply.estimate.nutrients.fat_g, 8)
        self.assertIsNone(reply.estimate.nutrients.protein_g)
        self.assertEqual(reply.estimate.sources[0].url, EVIDENCE.url)
        ask.assert_awaited_once()

    def test_uncited_wrong_basis_or_conflicting_evidence_cannot_supply_a_label(self):
        """Abstain when product identity, basis or the selected source cannot be checked."""
        from coach.barcode_verify import verify_barcode_label

        for evidence in (
            [WebEvidence('source-1', NAME, EVIDENCE.url, EVIDENCE.content.replace(CODE, 'another code'))],
            [WebEvidence('source-1', NAME, EVIDENCE.url, EVIDENCE.content.replace('per 100 g', 'per serving'))],
            [WebEvidence('source-1', NAME, EVIDENCE.url,
                         f'Barcode {CODE}. Energy 418.4 kJ. Nutrition per 100 g. Total fat 8 g.')],
            [EVIDENCE, WebEvidence('source-2', NAME, 'https://example.net/label',
                                   EVIDENCE.content.replace('418.4 kJ', '836.8 kJ'))],
        ):
            ask = AsyncMock(return_value={'sourceId': EVIDENCE.id})
            self.assertIsNone(asyncio.run(verify_barcode_label(CODE, NAME, 'g', AsyncMock(return_value=evidence), ask)))
            ask.assert_not_awaited()

        for selection in ({'sourceId': 'made-up'}, {'sourceId': EVIDENCE.id, 'kcal': 5}):
            ask = AsyncMock(return_value=selection)
            self.assertIsNone(asyncio.run(verify_barcode_label(CODE, NAME, 'g', AsyncMock(return_value=[EVIDENCE]), ask)))
