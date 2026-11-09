"""Ask a hosted model for one JSON object, keeping the keys on the laptop."""
import json
import os
from dataclasses import dataclass
import httpx
from .gemini import GEMINI_DEFAULT_MODEL, GEMINI_URL

# Groq's chat endpoint, the same one the estimate fallback uses
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
# Long enough for a shortlist prompt, short enough that three steps fit the browser's wait
COACH_TIMEOUT = 12.0


@dataclass(frozen=True)
class HostedModel:
    """Describe one OpenAI-compatible provider and where its settings live."""
    url: str
    key_setting: str
    model_setting: str
    default_model: str
    extra_fields: dict


# Who is asked, in order: Groq first, then Gemini once Groq is out of tokens. Only Groq gets
# a reasoning level, because Google's guide does not list this Gemini model among those that take one.
HOSTED_MODELS = (
    HostedModel(GROQ_URL, 'GROQ_API_KEY', 'GROQ_MODEL', 'openai/gpt-oss-20b', {'reasoning_effort': 'low'}),
    HostedModel(GEMINI_URL, 'GEMINI_API_KEY', 'GEMINI_MODEL', GEMINI_DEFAULT_MODEL, {}),
)


async def ask_hosted_model(messages):
    """
    Return the next message, as a parsed JSON object, from the first model able to answer.

    A provider that replies with an error, such as 429 when its free tokens run out,
    hands over to the next, because that reply costs almost none of the browser's wait.
    Anything else raises, so the caller can fall back to library picks or plain excerpts.
    """
    # Ignore a provider without a key, because the diary must work with none of them
    available = [model for model in HOSTED_MODELS if os.getenv(model.key_setting, '')]
    if not available:
        raise ValueError('No hosted model key is configured on this laptop.')

    # Ask each in turn, keeping the latest refusal in case none of them can answer
    refusal = None
    for model in available:
        try:
            return await ask_one_model(model, messages)
        except httpx.HTTPStatusError as problem:
            refusal = problem

    # Raise the last refusal, so the caller uses its fallback
    raise refusal


async def ask_one_model(model, messages):
    """Return one provider's next message as a parsed JSON object."""
    # Ask for JSON only, with no randomness, so the same question gets a steady answer
    payload = {'model': os.getenv(model.model_setting) or model.default_model, 'temperature': 0, 'max_tokens': 2048,
               'messages': messages, 'response_format': {'type': 'json_object'}, **model.extra_fields}
    async with httpx.AsyncClient(timeout=COACH_TIMEOUT) as client:
        response = await client.post(model.url, headers={'Authorization': f'Bearer {os.getenv(model.key_setting)}'}, json=payload)
    response.raise_for_status()

    # Return the decoded message; a non-JSON reply raises here
    return json.loads(response.json()['choices'][0]['message']['content'])
