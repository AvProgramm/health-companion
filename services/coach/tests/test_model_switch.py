"""Check that whichever hosted model is available answers, and that replies say who, with fictional data."""
import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch
import httpx
from fastapi.testclient import TestClient
from coach.app import app
from coach.hosted_models import HOSTED_MODELS
from coach.llm import HostedConversation
from coach.model_client import model_estimate
from coach.models import Nutrients
from coach.pipeline import estimate_food

# Where each provider answers, so a test can say who was asked and in what order
GROQ_HOST = 'api.groq.com'
GEMINI_HOST = 'generativelanguage.googleapis.com'
HF_HOST = 'router.huggingface.co'
# Fictional credentials, so a test can never spend the laptop's real tokens
FICTIONAL_KEYS = {'GROQ_API_KEY': 'fictional-groq-key', 'GEMINI_API_KEY': 'fictional-gemini-key',
                  'HF_TOKEN': 'fictional-hf-token', 'GEMINI_MODEL': '', 'TAVILY_API_KEY': ''}
# The only text a coach sends: what the person typed on that card
MESSAGES = [{'role': 'user', 'content': 'Fictional question?'}]
# A coach's finished reply, as a model would send it
FINAL_REPLY = {'final': {'text': 'Fictional answer.'}}
# A fictional Trainer card
TRAINER_REQUEST = {'goal': 'Fictional goal', 'minutes': 30, 'equipment': [], 'areas': ['legs'], 'level': 'beginner'}
# One fictional reviewed card, as the retriever would return it
CARD = {'id': 'a', 'title': 'Fictional card', 'text': 'Fictional guidance.', 'source': 'Fictional', 'source_date': '2026-01-26', 'url': 'https://example.org/a'}


class FakeRetriever:
    """Return one fictional reviewed card for any search."""

    def search(self, _query, topics=None):
        """Return the card, whatever was asked."""
        return [CARD]


def chat_reply(content):
    """Return a fictional successful chat response holding one JSON object."""
    return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(content)}}]})


def refused(status=429):
    """Return the response a provider sends when it will not answer, by default out of tokens."""
    return httpx.Response(status, json={'error': {'message': 'Fictional refusal.'}})


def food_proposal():
    """Return fictional nutrition as a model sends it, before provenance is attached."""
    keys = list(Nutrients.model_fields)
    return {'basis': {'amount': 100, 'unit': 'g'},
            'nutrients': {key: 120 if key == 'kcal' else None for key in keys},
            'range': {key: {'low': 100, 'high': 150} if key == 'kcal' else None for key in keys},
            'reason': 'Fictional evidence.', 'evidenceIds': []}


def fake_providers(respond):
    """Return a patch that answers every hosted-model request with a fictional responder."""
    original_client = httpx.AsyncClient
    return patch('httpx.AsyncClient', side_effect=lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(respond)))


def run_with_fake_providers(respond, coroutine):
    """Return the coroutine's result with every HTTP request answered by a fictional responder."""
    with fake_providers(respond):
        return asyncio.run(coroutine)


class SwitchTestCase(unittest.TestCase):
    """Give each test fictional keys, a fresh queue and a record of who was asked."""

    def setUp(self):
        """Replace the laptop's credentials and start an empty request log."""
        for patcher in (patch.dict('os.environ', FICTIONAL_KEYS), patch('coach.availability.queue', ['Groq', 'Gemini', 'Hugging Face'])):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.requests = []

    def hosts_asked(self):
        """Return the provider hosts contacted, in order."""
        return [request.url.host for request in self.requests]

    def answering(self, replies):
        """Return a responder that logs each request and answers it by host."""
        def respond(request):
            """Record who was asked, then give a fresh copy of that host's fictional reply."""
            self.requests.append(request)
            reply = replies[request.url.host]
            return httpx.Response(reply.status_code, content=reply.content)

        return respond


class HostedConversationTests(SwitchTestCase):
    """Check the queue behind the Trainer, Nutritionist and Coach."""

    def ask(self, replies, conversation=None):
        """Return the reply to one fictional question."""
        return run_with_fake_providers(self.answering(replies), (conversation or HostedConversation())(MESSAGES))

    def test_out_of_tokens_hands_the_same_messages_to_the_next_model(self):
        """Ask Gemini once Groq answers 429, send it only what Groq was sent, and say who answered."""
        conversation = HostedConversation()
        reply = self.ask({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(FINAL_REPLY)}, conversation)
        self.assertEqual(reply, FINAL_REPLY)
        self.assertEqual(conversation.answered_by, 'Gemini')
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])
        gemini_request = self.requests[1]
        self.assertEqual(gemini_request.url.path, '/v1beta/openai/chat/completions')
        self.assertEqual(gemini_request.headers['authorization'], 'Bearer fictional-gemini-key')
        body = json.loads(gemini_request.content)
        self.assertEqual(body['messages'], MESSAGES)
        self.assertEqual(body['model'], HOSTED_MODELS['Gemini'].default_model)
        # Google's table of reasoning levels does not list this model, so the field stays out
        self.assertNotIn('reasoning_effort', body)

    def test_the_front_of_the_queue_answers_alone(self):
        """Contact only the model at the front when it can answer, keeping Groq's request as it was."""
        conversation = HostedConversation()
        self.assertEqual(self.ask({GROQ_HOST: chat_reply(FINAL_REPLY)}, conversation), FINAL_REPLY)
        self.assertEqual(conversation.answered_by, 'Groq')
        self.assertEqual(self.hosts_asked(), [GROQ_HOST])
        self.assertEqual(self.requests[0].headers['authorization'], 'Bearer fictional-groq-key')
        self.assertEqual(json.loads(self.requests[0].content)['reasoning_effort'], 'low')

    def test_the_switch_has_no_fixed_direction(self):
        """Hand over from Gemini to Groq just as readily as the other way."""
        conversation = HostedConversation()
        with patch('coach.availability.queue', ['Gemini', 'Groq', 'Hugging Face']):
            self.assertEqual(self.ask({GEMINI_HOST: refused(), GROQ_HOST: chat_reply(FINAL_REPLY)}, conversation), FINAL_REPLY)
        self.assertEqual(self.hosts_asked(), [GEMINI_HOST, GROQ_HOST])
        self.assertEqual(conversation.answered_by, 'Groq')

    def test_a_model_out_of_tokens_is_asked_last_next_time(self):
        """Go straight to the model that answered, without another wasted request."""
        replies = {GROQ_HOST: refused(), GEMINI_HOST: chat_reply(FINAL_REPLY)}
        self.ask(replies)
        self.ask(replies)
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST, GEMINI_HOST])

    def test_a_model_is_asked_again_once_the_other_runs_out(self):
        """Keep a model that ran out in the queue, so it can answer when its tokens return."""
        self.ask({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(FINAL_REPLY)})
        self.ask({GEMINI_HOST: refused(), GROQ_HOST: chat_reply(FINAL_REPLY)})
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST, GEMINI_HOST, GROQ_HOST])

    def test_any_error_reply_hands_over(self):
        """Move on from an overloaded provider too, because its reply comes back at once."""
        self.assertEqual(self.ask({GROQ_HOST: refused(503), GEMINI_HOST: chat_reply(FINAL_REPLY)}), FINAL_REPLY)

    def test_a_timeout_raises_and_moves_that_model_back_for_next_time(self):
        """Stop at a slow model, because the browser cannot wait for a second one, then start elsewhere."""
        def time_out(request):
            """Record who was asked, then never answer."""
            self.requests.append(request)
            raise httpx.ReadTimeout('Fictional timeout.', request=request)

        with self.assertRaises(httpx.TimeoutException):
            run_with_fake_providers(time_out, HostedConversation()(MESSAGES))
        self.assertEqual(self.hosts_asked(), [GROQ_HOST])
        self.assertEqual(self.ask({GEMINI_HOST: chat_reply(FINAL_REPLY)}), FINAL_REPLY)
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])

    def test_a_garbled_reply_raises_and_moves_that_model_back(self):
        """Treat text that is not JSON as that model not working right now."""
        garbled = httpx.Response(200, json={'choices': [{'message': {'content': 'Not JSON.'}}]})
        with self.assertRaises(ValueError):
            self.ask({GROQ_HOST: garbled})
        self.assertEqual(self.ask({GEMINI_HOST: chat_reply(FINAL_REPLY)}), FINAL_REPLY)
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])

    def test_all_out_of_tokens_raises_so_the_caller_uses_its_fallback(self):
        """Raise once every provider has refused, leaving library picks or plain excerpts."""
        conversation = HostedConversation()
        with self.assertRaises(httpx.HTTPStatusError):
            self.ask({GROQ_HOST: refused(), GEMINI_HOST: refused()}, conversation)
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])
        self.assertIsNone(conversation.answered_by)

    def test_the_model_that_finished_a_conversation_is_the_one_named(self):
        """Name the latest model to reply when a conversation changes hands part way."""
        conversation = HostedConversation()
        self.ask({GROQ_HOST: chat_reply(FINAL_REPLY)}, conversation)
        self.ask({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(FINAL_REPLY)}, conversation)
        self.assertEqual(conversation.answered_by, 'Gemini')

    def test_a_gemini_key_alone_is_enough(self):
        """Go straight to Gemini when Groq has no key."""
        with patch.dict('os.environ', {'GROQ_API_KEY': ''}):
            self.assertEqual(self.ask({GEMINI_HOST: chat_reply(FINAL_REPLY)}), FINAL_REPLY)
        self.assertEqual(self.hosts_asked(), [GEMINI_HOST])

    def test_no_key_raises_without_any_request(self):
        """Contact nobody when the laptop holds no key, because every model is optional."""
        with patch.dict('os.environ', {'GROQ_API_KEY': '', 'GEMINI_API_KEY': ''}):
            with self.assertRaises(ValueError):
                self.ask({})
        self.assertEqual(self.requests, [])

    def test_gemini_model_setting_replaces_the_default(self):
        """Let a retired model be swapped in the laptop's settings, without a code change."""
        with patch.dict('os.environ', {'GROQ_API_KEY': '', 'GEMINI_MODEL': 'fictional-model'}):
            self.ask({GEMINI_HOST: chat_reply(FINAL_REPLY)})
        self.assertEqual(json.loads(self.requests[0].content)['model'], 'fictional-model')


class EstimateSwitchTests(SwitchTestCase):
    """Check the nutrition route through the real adapters and the real queue."""

    def estimate(self, replies):
        """Return one estimate through the default models, after empty lookups."""
        return run_with_fake_providers(self.answering(replies), estimate_food('fictional oatcakes', '100 g',
            AsyncMock(return_value=None), AsyncMock(return_value=[])))

    def test_a_refusal_hands_over_and_names_the_source(self):
        """Try the next model in the queue, and name it as the source of the estimate."""
        result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(food_proposal()), HF_HOST: chat_reply(food_proposal())})
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])
        self.assertEqual(result.sources[-1].provider, 'Gemini AI')

    def test_an_estimate_asks_whichever_model_is_at_the_front(self):
        """Start from the front of the queue, not from a fixed first choice."""
        with patch('coach.availability.queue', ['Gemini', 'Groq', 'Hugging Face']):
            result = self.estimate({GEMINI_HOST: chat_reply(food_proposal())})
        self.assertEqual(self.hosts_asked(), [GEMINI_HOST])
        self.assertEqual(result.sources[-1].provider, 'Gemini AI')

    def test_a_blank_model_setting_means_the_default_for_an_estimate_too(self):
        """Send the default model when the setting is left blank, as the coaches already do."""
        with patch.dict('os.environ', {'GROQ_MODEL': ''}):
            self.estimate({GROQ_HOST: chat_reply(food_proposal())})
        self.assertEqual(json.loads(self.requests[0].content)['model'], HOSTED_MODELS['Groq'].default_model)

    def test_a_failed_estimate_moves_that_model_back_for_next_time(self):
        """Go straight to the model that answered, without another wasted request."""
        replies = {GROQ_HOST: refused(), GEMINI_HOST: chat_reply(food_proposal())}
        self.estimate(replies)
        self.estimate(replies)
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST, GEMINI_HOST])

    def test_a_refusal_on_a_coach_is_remembered_by_the_estimates(self):
        """Share one queue, because both routes spend the same provider's tokens."""
        run_with_fake_providers(self.answering({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(FINAL_REPLY)}), HostedConversation()(MESSAGES))
        self.estimate({GEMINI_HOST: chat_reply(food_proposal())})
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST, GEMINI_HOST])

    def test_two_out_of_tokens_still_reaches_hugging_face(self):
        """Keep the third model when both free tiers have run out."""
        result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: refused(), HF_HOST: chat_reply(food_proposal())})
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST, HF_HOST])
        self.assertEqual(result.sources[-1].provider, 'Hugging Face AI')

    def test_a_gemini_reply_with_false_certainty_is_rejected_like_any_other(self):
        """Apply the same range check to Gemini, moving to the next model when it fails."""
        exact = food_proposal()
        exact['range']['kcal'] = {'low': 120, 'high': 120}
        result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(exact), HF_HOST: chat_reply(food_proposal())})
        self.assertEqual(result.sources[-1].provider, 'Hugging Face AI')

    # Seen live on 9 Nov: Gemini wrote an unknown's range as two nulls, and "nasi lemak, 2 plates" was thrown away
    def test_a_range_of_two_nulls_is_read_as_unknown(self):
        """Keep an estimate whose unknown nutrient has {"low": null, "high": null} as its range."""
        data = food_proposal()
        data['range']['added_sugar_g'] = {'low': None, 'high': None}
        result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(data)})
        self.assertIsNone(result.nutrients.added_sugar_g)
        self.assertIsNone(result.range['added_sugar_g'])
        self.assertEqual(result.sources[-1].provider, 'Gemini AI')

    # Seen live on 9 Nov: 4 of 12 Gemini estimates left a nutrient null but still wrote bounds for it
    def test_a_range_around_an_unknown_value_is_dropped(self):
        """Keep the nutrient unknown, never zero, whatever range the model wrote for it."""
        for spread in ({'low': 0.0, 'high': 3.0}, {'low': 0, 'high': 5}, {'low': 0.0, 'high': 0.0}, {'low': None, 'high': 5}):
            with self.subTest(spread=spread):
                data = food_proposal()
                data['range']['added_sugar_g'] = spread
                result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(data)})
                self.assertIsNone(result.nutrients.added_sugar_g)
                self.assertIsNone(result.range['added_sugar_g'])

    def test_one_bound_on_a_known_value_stays_invalid(self):
        """Reject half a range on a known value, because a model estimate needs real bounds."""
        data = food_proposal()
        data['range']['kcal'] = {'low': None, 'high': 150}
        self.assertIsNone(self.estimate({GROQ_HOST: chat_reply(data), GEMINI_HOST: refused(), HF_HOST: refused()}))

    def test_a_missing_range_key_stays_invalid(self):
        """Reject a reply that leaves a nutrient out of its ranges, because tidying must not hide that."""
        data = food_proposal()
        del data['range']['added_sugar_g']
        self.assertIsNone(self.estimate({GROQ_HOST: chat_reply(data), GEMINI_HOST: refused(), HF_HOST: refused()}))

    def test_a_known_value_with_two_null_bounds_stays_invalid(self):
        """Reject a known value with no range, because a model estimate needs real bounds."""
        data = food_proposal()
        data['range']['kcal'] = {'low': None, 'high': None}
        self.assertIsNone(self.estimate({GROQ_HOST: chat_reply(data), GEMINI_HOST: refused(), HF_HOST: refused()}))

    def test_a_field_that_is_not_an_object_stays_invalid(self):
        """Move on from malformed or missing nutrients or ranges, rather than crash on them."""
        for field in ('nutrients', 'range'):
            for malformed in (['not', 'an', 'object'], None):
                with self.subTest(field=field, malformed=malformed):
                    data = food_proposal()
                    data[field] = malformed
                    self.assertIsNone(self.estimate({GROQ_HOST: chat_reply(data), GEMINI_HOST: refused(), HF_HOST: refused()}))

    def test_gemini_is_sent_only_the_food_and_portion(self):
        """Keep Gemini to the two fields a lookup may send, and label its result a model estimate."""
        result = run_with_fake_providers(self.answering({GEMINI_HOST: chat_reply(food_proposal())}), model_estimate('Gemini', 'fictional oatcakes', '100 g'))
        body = json.loads(self.requests[0].content)
        self.assertEqual(json.loads(body['messages'][1]['content']), {'name': 'fictional oatcakes', 'portionText': '100 g'})
        self.assertEqual(body['response_format'], {'type': 'json_object'})
        self.assertEqual(body['model'], HOSTED_MODELS['Gemini'].default_model)
        self.assertEqual(self.requests[0].headers['authorization'], 'Bearer fictional-gemini-key')
        self.assertEqual(result.sourceKind, 'ai_estimate')

    def test_no_gemini_key_makes_no_request(self):
        """Return nothing and contact nobody when the laptop has no Gemini key."""
        with patch.dict('os.environ', {'GEMINI_API_KEY': ''}):
            result = run_with_fake_providers(self.answering({}), model_estimate('Gemini', 'fictional oatcakes', '100 g'))
        self.assertIsNone(result)
        self.assertEqual(self.requests, [])


class AnsweredByTests(SwitchTestCase):
    """Check that a reply names a model only when that model's words are on screen."""

    def setUp(self):
        """Serve a fictional reviewed card, so no test loads the encoder."""
        super().setUp()
        retriever = patch('coach.app.knowledge', return_value=FakeRetriever())
        retriever.start()
        self.addCleanup(retriever.stop)

    def post(self, path, body, respond):
        """Return the JSON reply from one endpoint, with every provider fictional."""
        with fake_providers(respond):
            return TestClient(app).post(path, json=body).json()

    def picking_from_the_shortlist(self, request):
        """Refuse on Groq, and on Gemini pick the first eight exercises the shortlist offers."""
        self.requests.append(request)
        if request.url.host == GROQ_HOST:
            return refused()
        shortlist = json.loads(json.loads(request.content)['messages'][1]['content'])['shortlist']
        return chat_reply({'final': {'exerciseIds': [entry['id'] for entry in shortlist[:8]], 'reason': 'Fictional reason.'}})

    def test_the_trainer_names_the_model_that_picked(self):
        """Say who chose the session after a hand-over."""
        body = self.post('/api/trainer', TRAINER_REQUEST, self.picking_from_the_shortlist)
        self.assertEqual((body['source'], body['answeredBy']), ('ai', 'Gemini'))

    def test_the_nutritionist_names_the_model_behind_its_ideas(self):
        """Say who suggested the food ideas."""
        idea = {'suggestions': [{'title': 'Fictional bowl', 'entry': '1 bowl fictional oats', 'why': {'text': 'Fictional guidance.', 'cites': [1]}}]}
        body = self.post('/api/nutritionist', {'goal': 'Fictional goal'}, self.answering({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(idea)}))
        self.assertEqual((body['mode'], body['answeredBy']), ('suggestions', 'Gemini'))

    def test_the_coach_names_the_model_behind_its_answer(self):
        """Say who wrote the checked answer."""
        answer = {'claims': [{'text': 'Fictional guidance.', 'cites': [1]}]}
        body = self.post('/api/coach', {'question': 'Fictional question?'}, self.answering({GROQ_HOST: chat_reply(answer)}))
        self.assertEqual((body['mode'], body['answeredBy']), ('answer', 'Groq'))

    def test_a_library_session_names_nobody(self):
        """Name no model when every provider refused and the library chose instead."""
        body = self.post('/api/trainer', TRAINER_REQUEST, self.answering({GROQ_HOST: refused(), GEMINI_HOST: refused()}))
        self.assertEqual((body['source'], body['answeredBy']), ('library', None))

    def test_a_trainer_reply_that_fails_its_checks_names_nobody(self):
        """Name no model when its picks were thrown away, even though it did reply."""
        invented = {'final': {'exerciseIds': ['invented-exercise'], 'reason': 'Fictional reason.'}}
        body = self.post('/api/trainer', TRAINER_REQUEST, self.answering({GROQ_HOST: chat_reply(invented)}))
        self.assertEqual((body['source'], body['answeredBy']), ('library', None))

    def test_cards_shown_after_every_refusal_name_nobody(self):
        """Name no model when only the reviewed cards are on screen."""
        for path, body in (('/api/nutritionist', {'goal': 'Fictional goal'}), ('/api/coach', {'question': 'Fictional question?'})):
            with self.subTest(path=path):
                reply = self.post(path, body, self.answering({GROQ_HOST: refused(), GEMINI_HOST: refused()}))
                self.assertEqual((reply['mode'], reply['answeredBy']), ('excerpts', None))

    def test_an_answer_that_fails_its_checks_names_nobody(self):
        """Name no model when its reply was thrown away and the cards are shown instead."""
        cases = (('/api/nutritionist', {'goal': 'Fictional goal'}, {'suggestions': [{'title': 'Fictional bowl', 'entry': '1 bowl fictional oats', 'why': {'text': 'Invented 99.', 'cites': [1]}}]}),
                 ('/api/coach', {'question': 'Fictional question?'}, {'claims': [{'text': 'Invented 99.', 'cites': [1]}]}))
        for path, body, invented in cases:
            with self.subTest(path=path):
                reply = self.post(path, body, self.answering({GROQ_HOST: chat_reply(invented)}))
                self.assertEqual((reply['mode'], reply['answeredBy']), ('excerpts', None))
