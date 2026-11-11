"""Check deterministic selection of independently verified retailer label excerpts."""
import unittest
from dataclasses import replace

from coach import barcode_verify
from coach.retrieval import WebEvidence


# Keep each source and its label values fictional.
CODE = '9556001234567'
NAME = 'Fictional oat spread'
EVIDENCE = WebEvidence('source-1', NAME, 'https://www.woolworths.com.au/example',
                       f'Barcode {CODE}. Nutrition per 100 g. Energy 418.4 kJ. Total fat 8 g. Protein <1 g.')
SECOND = 'https://www.coles.com.au/example'


class BarcodeVerificationTests(unittest.TestCase):
    def test_selection_prefers_the_most_complete_compatible_label(self):
        """Select one source by its known values and keep label inequalities unknown."""
        complete = replace(EVIDENCE, url=SECOND, content=EVIDENCE.content + ' Sodium 30 mg.')
        reply = barcode_verify.choose_web_label(CODE, [EVIDENCE, complete])
        self.assertEqual(reply.name, NAME)
        self.assertAlmostEqual(reply.estimate.nutrients.kcal, 100, places=9)
        self.assertEqual(reply.estimate.nutrients.fat_g, 8)
        self.assertEqual(reply.estimate.nutrients.sodium_mg, 30)
        self.assertIsNone(reply.estimate.nutrients.protein_g)
        self.assertEqual(reply.estimate.sources[0].url, SECOND)

    def test_selection_never_combines_fields_from_different_labels(self):
        """Return only the values printed together in the chosen source."""
        other = replace(EVIDENCE, url=SECOND, content=EVIDENCE.content.replace('Total fat 8 g.', 'Sodium 30 mg.'))
        reply = barcode_verify.choose_web_label(CODE, [EVIDENCE, other])
        self.assertTrue(reply.estimate.nutrients.fat_g is None or reply.estimate.nutrients.sodium_mg is None)

    def test_unknown_sites_wrong_bases_and_wrong_codes_are_ignored(self):
        """Require a listed retailer, the exact barcode and one explicit basis."""
        for evidence in (
            replace(EVIDENCE, url='https://world.openfoodfacts.org/example'),
            replace(EVIDENCE, url='https://woolworths.com.au.example.org/example'),
            replace(EVIDENCE, content=EVIDENCE.content.replace(CODE, 'another code')),
            replace(EVIDENCE, content=EVIDENCE.content.replace('per 100 g', 'per serving')),
            replace(EVIDENCE, content=EVIDENCE.content + ' Per serving 10 g. Total fat 0.8 g.'),
            replace(EVIDENCE, content=f'Barcode {CODE}. Energy 418.4 kJ. Nutrition per 100 g. Total fat 8 g.'),
        ):
            with self.subTest(evidence=evidence):
                self.assertIsNone(barcode_verify.choose_web_label(CODE, [evidence]))

    def test_conflicting_exact_sources_are_not_guessed_or_averaged(self):
        """Ask for the packet if trusted sources disagree or use different bases."""
        for changed in ('836.8 kJ', '100 mL'):
            old = '418.4 kJ' if changed.endswith('kJ') else '100 g'
            other = replace(EVIDENCE, url=SECOND, content=EVIDENCE.content.replace(old, changed))
            self.assertIsNone(barcode_verify.choose_web_label(CODE, [EVIDENCE, other]))
