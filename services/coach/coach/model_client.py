"""Validate hosted-model proposals and attach only real supplied citations."""
import json
import httpx
from .models import Basis, Estimate
from .prompts import estimate_prompt, estimate_schema

# Leave room within the pipeline deadline for validation and response transfer.
MODEL_TIMEOUT = 6.0

# What the model is asked for when the user gave a count of servings
ONE_SERVING = Basis(amount=1, unit='piece')


async def request_model(endpoint, token, model, provider, provider_url, name, portion_text, basis, evidence, strict_schema):
    """Request one bounded proposal while keeping user input to two fields.

    For a count of servings ("2 nasi lemak") the model is asked about one serving
    and the result is multiplied here, because language models are unreliable at
    arithmetic: on 7 Nov "2" came back as 350 kcal a plate while "1 plate" was 421.
    """
    per_serving = basis.unit == 'piece' and basis.amount != 1
    asked = ONE_SERVING if per_serving else basis
    # "1" matches the one-piece basis exactly: one item of a counted food, one plate of a dish
    asked_text = '1' if per_serving else portion_text
    proposal = await ask_model(endpoint, token, model, provider, provider_url, name, asked_text, asked, evidence, strict_schema)
    return scale_estimate(proposal, basis) if per_serving else proposal


async def ask_model(endpoint, token, model, provider, provider_url, name, portion_text, basis, evidence, strict_schema):
    """Return one validated proposal for exactly the given basis."""
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
    tidy_unknown_ranges(data)
    result = Estimate.model_validate(data)
    if result.basis != basis:
        raise ValueError('Keep the requested portion basis unchanged.')
    check_model_spread(result)
    check_energy_consistency(result)
    return result


def tidy_unknown_ranges(data):
    """
    Clear the range of every nutrient the model left unknown.

    Gemini often returns null for a nutrient and still writes a range for it, either two nulls
    or bounds such as 0 to 5 (seen live on 9 Nov). A range around no value can never be shown,
    and the nutrient stays unknown rather than zero, so only the stray range is dropped.
    """
    nutrients, ranges = data.get('nutrients'), data.get('range')

    # Ignore a malformed reply, because validation will reject it
    if not isinstance(nutrients, dict) or not isinstance(ranges, dict):
        return
    data['range'] = {key: None if nutrients.get(key) is None else spread for key, spread in ranges.items()}


def scale_estimate(estimate, basis):
    """Return a proposal multiplied out to the requested number of servings."""
    factor = basis.amount / estimate.basis.amount
    data = estimate.model_dump()
    data['basis'] = basis.model_dump()
    # Scale values and bounds alike; an unknown nutrient stays unknown
    data['nutrients'] = {key: None if value is None else value * factor for key, value in data['nutrients'].items()}
    data['range'] = {key: None if spread is None else {'low': spread['low'] * factor, 'high': spread['high'] * factor}
                     for key, spread in data['range'].items()}
    data['reason'] = f'Per serving, multiplied by {basis.amount:g}. {data["reason"]}'[:500]
    return Estimate.model_validate(data)


# Energy per gram of each macronutrient (general Atwater factors)
KCAL_PER_GRAM = {'protein_g': 4, 'carbs_g': 4, 'fat_g': 9}

# Real foods drift from those factors (fibre, alcohol, label rounding), so allow a quarter either way
ENERGY_TOLERANCE = 0.25


def check_energy_consistency(estimate):
    """Reject a model estimate whose macros contradict its own energy.

    With protein, carbohydrate and fat all known, energy must be within 25% of
    4P + 4C + 9F. With any of them unknown the check is one-sided: the known
    macros alone cannot add up to more energy than the stated total allows.
    """
    values = estimate.nutrients.model_dump()
    kcal = values['kcal']
    # Ignore an estimate without energy, since there is nothing to compare against
    if kcal is None:
        return
    known = [values[key] * factor for key, factor in KCAL_PER_GRAM.items() if values[key] is not None]
    from_macros = sum(known)
    if from_macros > kcal * (1 + ENERGY_TOLERANCE):
        raise ValueError('The macronutrients add up to more energy than the estimate states.')
    if len(known) == len(KCAL_PER_GRAM) and from_macros < kcal * (1 - ENERGY_TOLERANCE):
        raise ValueError('The macronutrients add up to much less energy than the estimate states.')


def check_model_spread(estimate):
    """Reject a model estimate that claims an exact value it cannot know.

    A dish varies with portion and recipe, so "494–494 kcal" would show false
    certainty. A true zero may still be exact (no sugar in plain rice).
    """
    for key, value in estimate.nutrients.model_dump().items():
        spread = estimate.range[key]
        if value is not None and value > 0 and spread is not None and spread.low == spread.high:
            raise ValueError('Give a real low-high range for every estimated value.')
