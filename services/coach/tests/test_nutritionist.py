"""Check that no unchecked food idea or invented figure reaches the person."""
import asyncio
import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from coach.app import app
from coach.nutritionist import MAX_ENTRY_LENGTH, MAX_TITLE_LENGTH, STATED_NUTRIENT, SUGGESTED, checked_suggestions, suggest_meals
from coach.rag.answer import EXCERPTS_ONLY, NO_EVIDENCE

# Two fictional cards, as the retriever would return them
CARDS = [{'id': 'a', 'title': 'Fictional protein', 'text': 'Aim for 50 g a day.', 'source': 'Fictional', 'source_date': '2026-01-26', 'url': 'https://example.org/a'},
         {'id': 'b', 'title': 'Fictional fibre', 'text': 'Eat more beans.', 'source': 'Fictional', 'source_date': '2026-01-26', 'url': 'https://example.org/b'}]
# One suggestion that passes every check
GOOD = {'title': 'Fictional bean bowl', 'entry': '1 bowl beans and 1 slice toast', 'why': {'text': 'Beans add fibre.', 'cites': [2]}}


class FakeRetriever:
    """Return fixed cards, recording what was asked for."""

    def __init__(self, cards):
        self.cards = cards
        self.seen = None

    def search(self, goal, topics):
        self.seen = (goal, topics)
        return self.cards


def answering(reply):
    """Return a fake model that always gives this reply."""
    async def ask(_messages):
        return reply
    return ask


async def never(_messages):
    """Stand in for a model that must not be called."""
    raise AssertionError('The model must not be called.')


def run(goal, retriever, ask):
    """Return the Nutritionist's reply to one goal."""
    return asyncio.run(suggest_meals(goal, retriever, ask))


class SuggestionCheckTests(unittest.TestCase):
    def test_a_good_suggestion_is_kept(self):
        kept = checked_suggestions([GOOD], CARDS)
        self.assertEqual([(item.title, item.entry, item.why.cites) for item in kept], [(GOOD['title'], GOOD['entry'], [2])])

    def test_stated_energy_or_nutrients_are_refused(self):
        for text in ('Toast 300 kcal', 'Rice 200 calories', 'Eggs with 20 g protein', 'Beans 8g of fibre', 'Soup 400 mg sodium'):
            with self.subTest(text=text):
                self.assertIsNotNone(STATED_NUTRIENT.search(text))
                self.assertEqual(checked_suggestions([{**GOOD, 'entry': text}], CARDS), [])

    def test_ordinary_portions_are_allowed(self):
        for text in ('2 eggs and 1 slice toast', '200 g rice', '300 ml milk', '1 plate nasi lemak'):
            with self.subTest(text=text):
                self.assertIsNone(STATED_NUTRIENT.search(text))

    def test_a_reason_with_an_invented_number_is_refused(self):
        self.assertEqual(checked_suggestions([{**GOOD, 'why': {'text': 'Aim for 90 g.', 'cites': [1]}}], CARDS), [])

    def test_a_reason_without_a_real_citation_is_refused(self):
        for why in (None, {'text': 'Fine.', 'cites': []}, {'text': 'Fine.', 'cites': [3]}):
            with self.subTest(why=why):
                self.assertEqual(checked_suggestions([{**GOOD, 'why': why}], CARDS), [])

    def test_malformed_suggestions_are_refused(self):
        for proposed in (None, 'text', [None], [{'title': 'x'}], [{**GOOD, 'title': ' '}], [{**GOOD, 'entry': ''}], [{**GOOD, 'title': 'x' * (MAX_TITLE_LENGTH + 1)}], [{**GOOD, 'entry': 'x' * (MAX_ENTRY_LENGTH + 1)}]):
            with self.subTest(proposed=proposed):
                self.assertEqual(checked_suggestions(proposed, CARDS), [])

    def test_only_three_suggestions_are_kept(self):
        self.assertEqual(len(checked_suggestions([GOOD] * 5, CARDS)), 3)


class SuggestMealsTests(unittest.TestCase):
    def test_an_unsafe_goal_reaches_neither_search_nor_model(self):
        retriever = FakeRetriever(CARDS)
        reply = run('How do I lose 10 kg in a week?', retriever, never)
        self.assertEqual(reply.mode, 'refused')
        self.assertIsNone(retriever.seen)

    def test_a_mention_of_the_diary_is_not_refused(self):
        self.assertEqual(run('what did i eat yesterday and what next', FakeRetriever([]), never).mode, 'no_evidence')

    def test_only_nutrition_and_diabetes_guidance_is_searched(self):
        retriever = FakeRetriever([])
        run('Fictional goal', retriever, never)
        self.assertEqual(retriever.seen, ('Fictional goal', {'nutrition', 'diabetes'}))

    def test_no_close_card_means_no_model_call(self):
        reply = run('Fictional goal', FakeRetriever([]), never)
        self.assertEqual((reply.mode, reply.message), ('no_evidence', NO_EVIDENCE))

    def test_checked_suggestions_come_with_their_sources(self):
        reply = run('Fictional goal', FakeRetriever(CARDS), answering({'suggestions': [GOOD]}))
        self.assertEqual((reply.mode, reply.message), ('suggestions', SUGGESTED))
        self.assertEqual([source.number for source in reply.sources], [1, 2])

    def test_provider_failure_shows_the_cards_themselves(self):
        async def failing(_messages):
            raise httpx.ConnectError('Fictional failure.')

        reply = run('Fictional goal', FakeRetriever(CARDS), failing)
        self.assertEqual((reply.mode, reply.message, reply.suggestions), ('excerpts', EXCERPTS_ONLY, []))

    def test_no_surviving_suggestion_shows_the_cards_themselves(self):
        self.assertEqual(run('Fictional goal', FakeRetriever(CARDS), answering({'suggestions': [{**GOOD, 'entry': 'Toast 300 kcal'}]})).mode, 'excerpts')

    def test_the_model_saying_no_ideas_is_respected(self):
        self.assertEqual(run('Fictional goal', FakeRetriever(CARDS), answering({'suggestions': []})).mode, 'no_evidence')


class NutritionistEndpointTests(unittest.TestCase):
    def test_extra_fields_are_refused(self):
        self.assertEqual(TestClient(app).post('/api/nutritionist', json={'goal': 'Fictional?', 'diary': []}).status_code, 422)

    def test_another_site_is_refused(self):
        self.assertEqual(TestClient(app).post('/api/nutritionist', json={'goal': 'Fictional?'}, headers={'origin': 'https://example.org'}).status_code, 403)

    def test_a_blank_goal_is_refused(self):
        self.assertEqual(TestClient(app).post('/api/nutritionist', json={'goal': '   '}).status_code, 422)

    def test_a_goal_is_answered_end_to_end(self):
        with patch('coach.app.knowledge', return_value=FakeRetriever([])):
            self.assertEqual(TestClient(app).post('/api/nutritionist', json={'goal': 'Fictional?'}).json()['mode'], 'no_evidence')


if __name__ == '__main__':
    unittest.main()
