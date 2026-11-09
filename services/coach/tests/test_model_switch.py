"""Check that a hosted model out of tokens hands over to the next one, with fictional data."""
import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch
import httpx
from coach.gemini import GEMINI_DEFAULT_MODEL, gemini_estimate
from coach.llm import ask_hosted_model
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


def run_with_fake_providers(respond, coroutine):
    """Return the coroutine's result with every HTTP request answered by a fictional responder."""
    original_client = httpx.AsyncClient
    with patch('httpx.AsyncClient', side_effect=lambda **kwargs: original_client(**kwargs, transport=httpx.MockTransport(respond))):
        return asyncio.run(coroutine)


class SwitchTestCase(unittest.TestCase):
    """Give each test fictional keys and a record of who was asked."""

    def setUp(self):
        """Replace the laptop's credentials and start an empty request log."""
        environment = patch.dict('os.environ', FICTIONAL_KEYS)
        environment.start()
        self.addCleanup(environment.stop)
        self.requests = []

    def hosts_asked(self):
        """Return the provider hosts contacted, in order."""
        return [request.url.host for request in self.requests]

    def answering(self, replies):
        """Return a responder that logs each request and answers it by host."""
        def respond(request):
            """Record who was asked, then give that host's fictional reply."""
            self.requests.append(request)
            return replies[request.url.host]

        return respond


class AskHostedModelTests(SwitchTestCase):
    """Check the switch behind the Trainer, Nutritionist and Coach."""

    def ask(self, replies):
        """Return the reply to one fictional question."""
        return run_with_fake_providers(self.answering(replies), ask_hosted_model(MESSAGES))

    def test_groq_out_of_tokens_hands_the_same_messages_to_gemini(self):
        """Ask Gemini once Groq answers 429, and send it only what Groq was sent."""
        reply = self.ask({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(FINAL_REPLY)})
        self.assertEqual(reply, FINAL_REPLY)
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])
        gemini_request = self.requests[1]
        self.assertEqual(gemini_request.url.path, '/v1beta/openai/chat/completions')
        self.assertEqual(gemini_request.headers['authorization'], 'Bearer fictional-gemini-key')
        body = json.loads(gemini_request.content)
        self.assertEqual(body['messages'], MESSAGES)
        self.assertEqual(body['model'], GEMINI_DEFAULT_MODEL)
        # Google's table of reasoning levels does not list this model, so the field stays out
        self.assertNotIn('reasoning_effort', body)

    def test_gemini_is_left_alone_while_groq_has_tokens(self):
        """Send nothing to Gemini when Groq answers, and keep Groq's request as it was."""
        self.assertEqual(self.ask({GROQ_HOST: chat_reply(FINAL_REPLY)}), FINAL_REPLY)
        self.assertEqual(self.hosts_asked(), [GROQ_HOST])
        self.assertEqual(self.requests[0].headers['authorization'], 'Bearer fictional-groq-key')
        self.assertEqual(json.loads(self.requests[0].content)['reasoning_effort'], 'low')

    def test_any_error_reply_hands_over(self):
        """Move on from an overloaded provider too, because its reply comes back at once."""
        self.assertEqual(self.ask({GROQ_HOST: refused(503), GEMINI_HOST: chat_reply(FINAL_REPLY)}), FINAL_REPLY)

    def test_a_timeout_raises_without_spending_another_wait(self):
        """Stop at a slow provider, because the browser cannot wait for a second one."""
        def time_out(request):
            """Record who was asked, then never answer."""
            self.requests.append(request)
            raise httpx.ReadTimeout('Fictional timeout.', request=request)

        with self.assertRaises(httpx.TimeoutException):
            run_with_fake_providers(time_out, ask_hosted_model(MESSAGES))
        self.assertEqual(self.hosts_asked(), [GROQ_HOST])

    def test_both_out_of_tokens_raises_so_the_caller_uses_its_fallback(self):
        """Raise once every provider has refused, leaving library picks or plain excerpts."""
        with self.assertRaises(httpx.HTTPStatusError):
            self.ask({GROQ_HOST: refused(), GEMINI_HOST: refused()})
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])

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
    """Check the nutrition route through the real adapters and the real order."""

    def estimate(self, replies):
        """Return one estimate through the default model order, after empty lookups."""
        return run_with_fake_providers(self.answering(replies), estimate_food('fictional oatcakes', '100 g',
            AsyncMock(return_value=None), AsyncMock(return_value=[])))

    def test_groq_out_of_tokens_uses_gemini_before_hugging_face(self):
        """Try Gemini second, and name it as the source of the estimate."""
        result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(food_proposal()), HF_HOST: chat_reply(food_proposal())})
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST])
        self.assertEqual(result.sources[-1].provider, 'Gemini AI')

    def test_gemini_out_of_tokens_still_reaches_hugging_face(self):
        """Keep the final backup when both free tiers have run out."""
        result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: refused(), HF_HOST: chat_reply(food_proposal())})
        self.assertEqual(self.hosts_asked(), [GROQ_HOST, GEMINI_HOST, HF_HOST])
        self.assertEqual(result.sources[-1].provider, 'Hugging Face AI')

    def test_a_gemini_reply_with_false_certainty_is_rejected_like_any_other(self):
        """Apply the same range check to Gemini, moving to the next model when it fails."""
        exact = food_proposal()
        exact['range']['kcal'] = {'low': 120, 'high': 120}
        result = self.estimate({GROQ_HOST: refused(), GEMINI_HOST: chat_reply(exact), HF_HOST: chat_reply(food_proposal())})
        self.assertEqual(result.sources[-1].provider, 'Hugging Face AI')

    def test_gemini_is_sent_only_the_food_and_portion(self):
        """Keep Gemini to the two fields a lookup may send, and label its result a model estimate."""
        result = run_with_fake_providers(self.answering({GEMINI_HOST: chat_reply(food_proposal())}), gemini_estimate('fictional oatcakes', '100 g'))
        body = json.loads(self.requests[0].content)
        self.assertEqual(json.loads(body['messages'][1]['content']), {'name': 'fictional oatcakes', 'portionText': '100 g'})
        self.assertEqual(body['response_format'], {'type': 'json_object'})
        self.assertEqual(body['model'], GEMINI_DEFAULT_MODEL)
        self.assertEqual(self.requests[0].headers['authorization'], 'Bearer fictional-gemini-key')
        self.assertEqual(result.sourceKind, 'ai_estimate')

    def test_no_gemini_key_makes_no_request(self):
        """Return nothing and contact nobody when the laptop has no Gemini key."""
        with patch.dict('os.environ', {'GEMINI_API_KEY': ''}):
            result = run_with_fake_providers(self.answering({}), gemini_estimate('fictional oatcakes', '100 g'))
        self.assertIsNone(result)
        self.assertEqual(self.requests, [])
