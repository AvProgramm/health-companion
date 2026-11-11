"""Check the reported serving error against a public product label, without network calls."""
import asyncio
import unittest
from unittest.mock import AsyncMock

from coach.pipeline import estimate_food


class LabelEstimateTests(unittest.TestCase):
    def test_weetabix_label_preserves_the_two_biscuit_basis(self):
        """Use the published serving count and scale a different count in code."""
        # Typed on the phone on 11 Nov: 2 weetabix and 300 ml milk.
        database, retrieval = AsyncMock(return_value=None), AsyncMock(return_value=[])
        result = asyncio.run(estimate_food('weetabix', '2 piece', database, retrieval, {}))
        single = asyncio.run(estimate_food('Weetabix Original', '1 piece', database, retrieval, {}))

        # The UK Original label states 136 kcal and 4.5 g protein per two biscuits.
        self.assertIsNotNone(result)
        self.assertEqual(result.basis.model_dump(), {'amount': 2.0, 'unit': 'piece'})
        self.assertEqual(result.nutrients.kcal, 136)
        self.assertEqual(result.nutrients.protein_g, 4.5)
        self.assertIsNone(result.nutrients.added_sugar_g)
        self.assertEqual(result.sources[0].provider, 'Weetabix UK')
        self.assertEqual(single.nutrients.kcal, 68)
        database.assert_not_awaited()
        retrieval.assert_not_awaited()

    def test_a_product_variant_or_container_does_not_use_the_original_label(self):
        """Keep named variants and container requests on the usual lookup path."""
        database, retrieval = AsyncMock(return_value=None), AsyncMock(return_value=[])
        for name, portion in (('weetabix chocolate', '2 piece'), ('weetabix', '2 bowls'),
                              ('weetabix', '2 servings'), ('weetabix', ''), ('weetabix', '0 pieces')):
            with self.subTest(name=name, portion=portion):
                self.assertIsNone(asyncio.run(estimate_food(name, portion, database, retrieval, {})))
