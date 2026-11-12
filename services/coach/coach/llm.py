"""Ask whichever hosted model is available for one JSON object, keeping the keys on the laptop."""
import json
import httpx
from .availability import asking_order, send_to_back
from .failures import PROVIDER_FAILURES
from .hosted_models import HOSTED_MODELS

# Long enough for a shortlist prompt, short enough that three steps fit the browser's wait
COACH_TIMEOUT = 12.0
# The models a coach can ask. Hugging Face is left out, because its hosted inference returns
# HTTP 402 on this laptop and it has never been checked on a coach's prompt.
COACH_MODELS = ('Groq', 'Gemini')
# The only models that may see shared diary lines. Groq does not keep inference data by default,
# while the Gemini free tier may use what it is sent to improve Google products and Hugging Face
# routes to providers nobody here has checked. A request with diary lines never falls back past this list.
DIARY_MODELS = ('Groq',)
# The models that can read a photo; Groq's default model reads text only
PHOTO_MODELS = ('Gemini',)


class HostedConversation:
    """Ask whichever hosted model is available during one request, and remember who answered."""

    def __init__(self, names=COACH_MODELS):
        """Start with nobody having answered, choosing among the given models."""
        self.names = names
        self.answered_by = None

    async def __call__(self, messages):
        """
        Return the next message, as a parsed JSON object, from the first model able to answer.

        A model that fails goes to the back of the queue. One that replies with an error,
        such as 429 when its free tokens run out, also hands over at once, because that reply
        costs almost none of the browser's wait. Anything else raises, so the caller can fall
        back to library picks or plain excerpts.
        """
        # Ignore a provider without a key, because the diary must work with none of them
        names = [name for name in asking_order(self.names) if HOSTED_MODELS[name].key()]
        if not names:
            raise ValueError('No hosted model key is configured on this laptop.')

        # Ask each in turn, keeping the latest refusal in case none of them can answer
        refusal = None
        for name in names:
            try:
                reply = await ask_one_model(HOSTED_MODELS[name], messages)
            except httpx.HTTPStatusError as problem:
                send_to_back(name)
                refusal = problem
            except PROVIDER_FAILURES:
                # Stop at a slow or garbled reply, because the browser cannot wait for a second model
                send_to_back(name)
                raise
            else:
                self.answered_by = name
                return reply

        # Raise the last refusal, so the caller uses its fallback
        raise refusal


async def ask_one_model(model, messages):
    """Return one provider's next message as a parsed JSON object."""
    # Ask for JSON only, with no randomness, so the same question gets a steady answer
    payload = {'model': model.model(), 'temperature': 0, 'max_tokens': 2048,
               'messages': messages, 'response_format': {'type': 'json_object'}, **model.coach_fields}
    async with httpx.AsyncClient(timeout=COACH_TIMEOUT) as client:
        response = await client.post(model.url, headers={'Authorization': f'Bearer {model.key()}'}, json=payload)
    response.raise_for_status()

    # Return the decoded message; a non-JSON reply raises here
    return json.loads(response.json()['choices'][0]['message']['content'])
