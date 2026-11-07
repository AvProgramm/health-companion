"""Validate hosted-model proposals and attach only real supplied citations."""
import json
import httpx
from .models import Estimate
from .prompts import estimate_prompt, estimate_schema

# Leave room within the pipeline deadline for validation and response transfer.
MODEL_TIMEOUT = 6.0


async def request_model(endpoint, token, model, provider, provider_url, name, portion_text, basis, evidence, strict_schema):
    """Request one bounded proposal while keeping user input to two fields."""
    payload = {
        'model': model, 'temperature': 0, 'max_tokens': 2048,
        'messages': [{'role': 'system', 'content': estimate_prompt(basis, evidence)},
            {'role': 'user', 'content': json.dumps({'name': name, 'portionText': portion_text})}],
        'response_format': {'type': 'json_object'},
    }
    if strict_schema:
        payload['response_format'] = {'type': 'json_schema', 'json_schema': {
            'name': 'nutrition_estimate', 'strict': True, 'schema': estimate_schema(basis)}}
        payload['reasoning_effort'] = 'low'
    async with httpx.AsyncClient(timeout=MODEL_TIMEOUT) as client:
        response = await client.post(endpoint, headers={'Authorization': f'Bearer {token}'}, json=payload)
    response.raise_for_status()
    data = json.loads(response.json()['choices'][0]['message']['content'])
    used_ids = data.pop('evidenceIds', [])
    available = {item.id: item for item in evidence}
    if not isinstance(used_ids, list) or any(not isinstance(identity, str) or identity not in available for identity in used_ids):
        raise ValueError('Cite only supplied public evidence.')
    sources = [{'provider': 'Tavily web', 'description': available[identity].title,
                'url': available[identity].url} for identity in dict.fromkeys(used_ids)]
    # Set provenance ourselves because a model cannot invent a source URL.
    data['sourceKind'] = 'ai_estimate'
    data['sources'] = sources + [{'provider': provider, 'description': 'Model estimate, not a database measurement.', 'url': provider_url}]
    result = Estimate.model_validate(data)
    if result.basis != basis:
        raise ValueError('Keep the requested portion basis unchanged.')
    return result
