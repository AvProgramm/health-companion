"""Check the Trainer with a scripted model, so no provider is contacted."""
import asyncio
import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from coach.app import app
from coach.models import TrainerRequest
from coach.trainer import MAX_PICKS, evidence_tool, plan_session

def fictional(number, equipment=(), category='legs'):
    """Return a fictional library entry with a numbered ID."""
    return {'id': f'free-exercise-db:fictional_{number:02d}', 'name': f'Fictional {number}', 'category': category,
            'equipment': list(equipment), 'untracked': None, 'requires': [], 'minutes': 5, 'cue': 'Fictional cue.',
            'primaryMuscles': [f'muscle{number}'], 'imagePath': None, 'sourceEquipment': 'body only', 'level': 'beginner',
            'kind': 'strength', 'mechanic': 'compound'}


# Twenty bodyweight exercises and one that needs a barbell
LIBRARY = [fictional(number) for number in range(20)] + [fictional(99, ['barbell'])]
# The fields a person fills in on the Trainer card
REQUEST = {'goal': 'I want to be healthy', 'minutes': 120, 'equipment': [], 'areas': ['legs'], 'level': 'beginner'}


def plan(model, **changes):
    """Run the Trainer against the fictional library with a scripted model."""
    return asyncio.run(plan_session(TrainerRequest(**{**REQUEST, **changes}), LIBRARY, model))


def picks(*numbers, reason='Balanced for general health.'):
    """Return an async model that immediately picks the numbered exercises."""
    async def model(_messages):
        """Return a final reply naming these exercises."""
        return {'final': {'exerciseIds': [f'free-exercise-db:fictional_{number:02d}' for number in numbers], 'reason': reason}}
    return model


class TrainerTests(unittest.TestCase):
    """Let the model choose only from what the hard filters left."""

    def test_keeps_the_models_order(self):
        """Return the Trainer's picks in its own ranking."""
        reply = plan(picks(7, 3, 5, 1, 9, 11, 13, 15))
        self.assertEqual(reply.source, 'ai')
        self.assertEqual(reply.exerciseIds[:3], ['free-exercise-db:fictional_07', 'free-exercise-db:fictional_03', 'free-exercise-db:fictional_05'])
        self.assertEqual(reply.reason, 'Balanced for general health.')

    def test_drops_invented_and_ineligible_ids(self):
        """Never return an exercise that was not on the shortlist."""
        async def model(_messages):
            """Mix real picks with an invented ID and one that needs missing kit."""
            real = [f'free-exercise-db:fictional_{number:02d}' for number in range(8)]
            return {'final': {'exerciseIds': ['made-up', 'free-exercise-db:fictional_99', *real], 'reason': 'Fine.'}}
        reply = plan(model)
        self.assertNotIn('made-up', reply.exerciseIds)
        self.assertNotIn('free-exercise-db:fictional_99', reply.exerciseIds)
        self.assertEqual(len(reply.exerciseIds), 8)

    def test_removes_duplicates_and_caps_the_list(self):
        """Keep each exercise once and never more than the cap."""
        reply = plan(picks(*list(range(20)), 1, 2))
        self.assertEqual(len(reply.exerciseIds), MAX_PICKS)
        self.assertEqual(len(set(reply.exerciseIds)), MAX_PICKS)

    def test_too_few_valid_picks_falls_back_to_the_library(self):
        """Use a balanced library set when the model gives almost nothing usable."""
        reply = plan(picks(1, 2))
        self.assertEqual(reply.source, 'library')
        self.assertEqual(len(reply.exerciseIds), MAX_PICKS)

    def test_a_busy_provider_falls_back_to_the_library(self):
        """Still give a session when the model is rate-limited."""
        async def model(_messages):
            """Fail the way a 429 does."""
            raise httpx.HTTPError('rate limited')
        reply = plan(model)
        self.assertEqual(reply.source, 'library')
        self.assertGreater(len(reply.exerciseIds), 0)
        self.assertIn('busy', reply.reason)

    def test_nothing_fits_says_so(self):
        """Return no exercises, with a plain reason, when the filters leave nothing."""
        async def model(_messages):
            """Fail the test if the model is called with nothing to choose from."""
            raise AssertionError('The model should not be called.')
        reply = plan(model, areas=['push'])
        self.assertEqual(reply.exerciseIds, [])
        self.assertIn('Nothing', reply.reason)

    def test_the_prompt_holds_only_the_goal_and_the_shortlist(self):
        """Send the model what the person typed plus library facts, and no diary."""
        seen = []
        async def model(messages):
            """Remember the prompt and finish."""
            seen.extend(messages)
            return {'final': {'exerciseIds': [], 'reason': ''}}
        plan(model, goal='fictional goal words')
        prompt = ' '.join(message['content'] for message in seen)
        self.assertIn('fictional goal words', prompt)
        self.assertIn('free-exercise-db:fictional_00', prompt)
        self.assertNotIn('free-exercise-db:fictional_99', prompt)

    def test_the_model_cannot_widen_the_search(self):
        """Keep the person's kit and level even if the model asks a tool for more."""
        calls = []
        async def model(messages):
            """Ask the search tool for barbell work, then read the answer."""
            calls.append(messages[-1]['content'])
            if len(calls) == 1:
                return {'tool': 'search_exercises', 'arguments': {'areas': ['legs'], 'equipment': ['barbell'], 'level': 'expert'}}
            return {'final': {'exerciseIds': [], 'reason': ''}}
        plan(model)
        self.assertNotIn('fictional_99', calls[1])


class TrainerEndpointTests(unittest.TestCase):
    """Accept only the Trainer card's fields, from the local app only."""

    def setUp(self):
        """Create a client for the real application."""
        self.client = TestClient(app)

    def test_rejects_anything_beyond_the_card_fields(self):
        """Refuse a request carrying diary history, without echoing it."""
        response = self.client.post('/api/trainer', json={**REQUEST, 'diary': 'fictional private entry'})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('fictional private entry', response.text)

    def test_rejects_another_origin(self):
        """Serve only pages from the local app."""
        response = self.client.post('/api/trainer', json=REQUEST, headers={'origin': 'https://example.com'})
        self.assertEqual(response.status_code, 403)

    def test_returns_a_session_from_the_real_library(self):
        """Fall back to library picks when no key is configured."""
        with patch.dict('os.environ', {'GROQ_API_KEY': ''}):
            response = self.client.post('/api/trainer', json=REQUEST)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['source'], 'library')
        self.assertGreater(len(body['exerciseIds']), 0)



class TrainerSafetyTests(unittest.TestCase):
    def test_an_unsafe_goal_reaches_no_model(self):
        async def never(_messages):
            raise AssertionError('The model must not be called.')

        reply = asyncio.run(plan_session(TrainerRequest(goal='I have chest pain but want to run', minutes=30, equipment=[], areas=['legs'], level='beginner'), [], never))
        self.assertEqual((reply.source, reply.exerciseIds), ('refused', []))

    def test_the_evidence_tool_keeps_to_its_topics(self):
        class FakeRetriever:
            def search(self, query, topics):
                self.seen = (query, topics)
                return [{'title': 'Fictional', 'text': 'Fictional text.', 'source': 'Fictional source', 'url': 'not for the model'}]

        retriever = FakeRetriever()
        result = evidence_tool(retriever).run({'query': 'strength'})
        self.assertEqual(retriever.seen, ('strength', {'activity', 'diabetes'}))
        self.assertEqual(result, [{'title': 'Fictional', 'text': 'Fictional text.', 'source': 'Fictional source'}])


if __name__ == '__main__':
    unittest.main()
