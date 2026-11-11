"""Check that a photo only ever becomes checked text for the entry box."""
import asyncio
import unittest
from unittest.mock import patch
import httpx
from fastapi.testclient import TestClient
from coach.app import app
from coach.photo import LISTED, MAX_FOODS, NOTHING, checked_foods, entry_text, list_foods

# A tiny fictional JPEG, as the phone would send it after shrinking
IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='


def answering(reply):
    """Return a fake model that always gives this reply, keeping what it was sent."""
    async def ask(messages):
        ask.sent = messages
        return reply
    return ask


def run(ask):
    """Return the reply for the fictional photo."""
    return asyncio.run(list_foods(IMAGE, ask))


class EntryTextTests(unittest.TestCase):
    def test_each_unit_reads_as_the_composer_expects(self):
        self.assertEqual(entry_text({'name': 'Almonds', 'amount': 12, 'unit': 'piece'}), '12 almonds')
        self.assertEqual(entry_text({'name': 'rice', 'amount': 150.0, 'unit': 'g'}), '150 g rice')
        self.assertEqual(entry_text({'name': 'dal', 'amount': 1, 'unit': 'bowl'}), '1 bowl of dal')
        self.assertEqual(entry_text({'name': 'milk', 'amount': 0.5, 'unit': 'glass'}), '0.5 glass of milk')


class CheckTests(unittest.TestCase):
    def test_a_good_list_is_kept_in_order(self):
        kept = checked_foods([{'name': 'Fried chicken', 'amount': 2, 'unit': 'piece'}, {'name': 'cola', 'amount': 1, 'unit': 'can'}])
        self.assertEqual([(food.name, food.entry) for food in kept], [('fried chicken', '2 fried chicken'), ('cola', '1 can of cola')])

    def test_untrustworthy_items_are_dropped(self):
        bad = [{'name': 'rice and dal', 'amount': 1, 'unit': 'plate'},     # the composer would split it
               {'name': 'rice', 'amount': 1, 'unit': 'handful'},           # a unit outside the list
               {'name': 'rice', 'amount': 0, 'unit': 'cup'},               # nothing there
               {'name': 'rice', 'amount': 500, 'unit': 'piece'},           # an unbelievable count
               {'name': 'rice', 'amount': True, 'unit': 'cup'},            # not a number
               {'name': 'high protein bar', 'amount': 1, 'unit': 'piece'}, # reads as a nutrient
               {'name': '200 kcal bar', 'amount': 1, 'unit': 'piece'},     # a stated figure
               {'name': 'x' * 41, 'amount': 1, 'unit': 'piece'}, 'nonsense', {'amount': 1, 'unit': 'cup'}]
        self.assertEqual(checked_foods(bad), [])

    def test_the_list_is_capped(self):
        many = [{'name': f'fictional food {chr(97 + index)}', 'amount': 1, 'unit': 'piece'} for index in range(12)]
        self.assertEqual(len(checked_foods(many)), MAX_FOODS)


class ListFoodsTests(unittest.TestCase):
    def test_the_photo_is_sent_once_with_the_instructions(self):
        ask = answering({'foods': [{'name': 'almonds', 'amount': 12, 'unit': 'piece'}]})
        reply = run(ask)
        self.assertEqual((reply.mode, reply.message, reply.foods[0].entry), ('foods', LISTED, '12 almonds'))
        self.assertEqual(ask.sent[1]['content'][1]['image_url']['url'], IMAGE)

    def test_photo_prompt_limits_guesses_and_duplicate_portions(self):
        """Tell the vision model how to handle ambiguous proteins and mixed sides."""
        ask = answering({'foods': []})
        run(ask)
        prompt = ask.sent[0]['content']

        # Check the instructions sent with the fictional image, independent of a model reply.
        self.assertIn('one entry per separately served food', prompt)
        self.assertIn('Count ingredients inside a mixed side only as part of that side', prompt)
        self.assertIn('Coating and sauce alone cannot distinguish fish from chicken', prompt)
        self.assertIn('Omit a food if no useful name is supported', prompt)
        self.assertIn('Use grams or millilitres only for an explicitly visible measurement', prompt)

    def test_no_usable_food_says_so(self):
        self.assertEqual((run(answering({'foods': []})).mode, run(answering({'nonsense': 1})).message), ('nothing', NOTHING))

    def test_a_provider_failure_says_so(self):
        async def failing(_messages):
            raise httpx.ConnectError('Fictional failure.')
        self.assertEqual(run(failing).mode, 'nothing')


class PhotoConversation:
    """Stand in for Gemini, recording which models the endpoint allowed."""

    def __init__(self, names):
        PhotoConversation.names = names
        self.answered_by = None

    async def __call__(self, _messages):
        self.answered_by = 'Gemini'
        return {'foods': [{'name': 'laddu', 'amount': 3, 'unit': 'piece'}]}


class PhotoEndpointTests(unittest.TestCase):
    def test_only_a_jpeg_data_url_is_accepted(self):
        client = TestClient(app)
        self.assertEqual(client.post('/api/photo', json={'image': 'https://example.org/a.jpg'}).status_code, 422)
        self.assertEqual(client.post('/api/photo', json={'image': IMAGE, 'diary': []}).status_code, 422)

    def test_another_site_is_refused(self):
        self.assertEqual(TestClient(app).post('/api/photo', json={'image': IMAGE}, headers={'origin': 'https://example.org'}).status_code, 403)

    def test_a_photo_is_read_by_a_vision_model_and_credited(self):
        with patch('coach.app.HostedConversation', PhotoConversation):
            reply = TestClient(app).post('/api/photo', json={'image': IMAGE}).json()
        self.assertEqual((reply['foods'][0]['entry'], reply['answeredBy'], PhotoConversation.names), ('3 laddu', 'Gemini', ('Gemini',)))


if __name__ == '__main__':
    unittest.main()
