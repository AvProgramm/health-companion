"""Ask the hosted model for one JSON object, keeping the key on the laptop."""
import json
import os
import httpx

# Groq's chat endpoint, the same one the estimate fallback uses
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
# Long enough for a shortlist prompt, short enough that three steps fit the browser's wait
COACH_TIMEOUT = 12.0


async def ask_groq(messages):
    """
    Return the model's next message as a parsed JSON object.

    Anything that goes wrong raises, so the caller can fall back to library picks
    or plain excerpts instead of showing a broken reply.
    """
    # Ignore the call when no key is set, because the diary must work without one
    key = os.getenv('GROQ_API_KEY', '')
    if not key:
        raise ValueError('No Groq key is configured on this laptop.')

    # Ask for JSON only, with no randomness, so the same question gets a steady answer
    payload = {'model': os.getenv('GROQ_MODEL', 'openai/gpt-oss-20b'), 'temperature': 0, 'max_tokens': 2048,
               'messages': messages, 'response_format': {'type': 'json_object'}, 'reasoning_effort': 'low'}
    async with httpx.AsyncClient(timeout=COACH_TIMEOUT) as client:
        response = await client.post(GROQ_URL, headers={'Authorization': f'Bearer {key}'}, json=payload)
    response.raise_for_status()

    # Return the decoded message; a non-JSON reply raises here
    return json.loads(response.json()['choices'][0]['message']['content'])
