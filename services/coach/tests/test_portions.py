"""Check named serving counts independently of any model or diary."""
import unittest
from coach.portions import one_serving_text, portion_basis


class PortionTests(unittest.TestCase):
    def test_one_serving_retains_the_named_container(self):
        """Ask about one container before code scales its count."""
        for text, expected in (('2 bowls', '1 bowl'), ('2 cups', '1 cup'), ('0.5 glasses', '1 glass'),
                               ('2 cans', '1 can'), ('2 slices', '1 slice'), ('2 spoons', '1 spoon'),
                               ('2 mugs', '1 mug'), ('2 plates', '1 plate'), ('2 packets', '1 packet'),
                               ('7 pieces', '1'), ('2 servings', '1'), ('2', '1')):
            with self.subTest(text=text):
                self.assertEqual(one_serving_text(text), expected)

    def test_physical_units_remain_physical(self):
        """Leave explicit grams and millilitres unchanged by container support."""
        self.assertEqual(portion_basis('150 g').model_dump(), {'amount': 150.0, 'unit': 'g'})
        self.assertEqual(portion_basis('250 ml').model_dump(), {'amount': 250.0, 'unit': 'mL'})
        self.assertEqual(portion_basis('0.5 cups').model_dump(), {'amount': 0.5, 'unit': 'piece'})
