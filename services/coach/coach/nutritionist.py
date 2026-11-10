"""Let the AI Nutritionist suggest foods to try, grounded in reviewed guidance and never saved."""
import re
from .models import CoachClaim, NutritionistReply, NutritionistSuggestion
from .rag.answer import EXCERPTS_ONLY, NO_EVIDENCE, proposed_from_cards, sources_for, valid_claim
from .safety import check_safety

# Few enough to read at a glance
MAX_SUGGESTIONS = 3
# The reviewed guidance a nutritionist has any business reading
TOPICS = {'nutrition', 'diabetes'}
# Long enough for a simple meal, short enough for the entry box and a chip
MAX_TITLE_LENGTH = 60
MAX_ENTRY_LENGTH = 100
# Portions are fine in an entry, but energy and nutrient amounts come only from the estimate step
STATED_NUTRIENT = re.compile(r'\d\s*(k?cal|calories?)\b|\d\s*(g|mg|grams?)\s+(of\s+)?(protein|carbs?|carbohydrate|fat|sugar|fibre|fiber|sodium|salt)\b', re.IGNORECASE)

# What the model is told; what it returns is still checked in code
SYSTEM = ('You are a careful nutritionist inside a personal diary app. Suggest 1 to 3 simple foods or meals for what the person asks, '
          'using only the numbered evidence cards for any health reason. For each suggestion give a short "title", an "entry" with the foods and '
          'simple portions as someone would type them in a diary, such as "1 bowl oatmeal and 1 banana", and "why": one short claim citing the card numbers behind it. '
          'Never state calories or nutrient amounts for a food, because the app estimates those. Never diagnose or suggest a dose. '
          'If the cards do not help, return no suggestions. Reply with only JSON: '
          '{"suggestions": [{"title": "...", "entry": "...", "why": {"text": "...", "cites": [1]}}]}.')

# What the person reads with the suggestions
SUGGESTED = 'Ideas to try, based on reviewed guidance. Each one becomes a draft you can check and change. General information only, not medical advice.'


def valid_suggestion(item, cards):
    """Return whether one suggestion is well formed, states no nutrients, and has a checked reason."""
    # Ignore a malformed suggestion, because a model's output cannot be trusted
    title = item.get('title') if isinstance(item, dict) else None
    entry = item.get('entry') if isinstance(item, dict) else None
    if not isinstance(title, str) or not title.strip() or len(title) > MAX_TITLE_LENGTH or not isinstance(entry, str) or not entry.strip() or len(entry) > MAX_ENTRY_LENGTH:
        return False

    # Ignore a stated nutrient amount, because model output is never trusted for numbers
    if STATED_NUTRIENT.search(title) or STATED_NUTRIENT.search(entry):
        return False

    # Keep it only if its reason cites real cards and invents no figures
    return valid_claim(item.get('why'), cards)


def checked_suggestions(proposed, cards):
    """Return only the suggestions that survive the checks, in the model's order."""
    # Ignore anything that is not a list of suggestions
    if not isinstance(proposed, list):
        return []
    return [NutritionistSuggestion(title=item['title'].strip(), entry=item['entry'].strip(), why=CoachClaim(text=item['why']['text'].strip(), cites=sorted(set(item['why']['cites']))))
            for item in proposed[:MAX_SUGGESTIONS] if valid_suggestion(item, cards)]


async def suggest_meals(goal, retriever, ask):
    """
    Return checked food ideas, the evidence itself, or an honest reason for neither.

    Only the typed goal is used. A suggestion is text for the entry box, so the person
    still reviews it, gets an estimate and confirms before anything is saved.
    """
    # Refuse first; a mention of the diary is fine here, since a goal can refer to past days
    refusal = check_safety(goal)
    if refusal is not None and refusal.kind != 'diary':
        return NutritionistReply(mode='refused', message=refusal.message, suggestions=[], sources=[])

    # Say so plainly when nothing reviewed is about this goal
    cards = retriever.search(goal, topics=TOPICS)
    if not cards:
        return NutritionistReply(mode='no_evidence', message=NO_EVIDENCE, suggestions=[], sources=[])

    # Take the model at its word when it says the cards do not help
    proposed = await proposed_from_cards(ask, SYSTEM, cards, 'GOAL', goal, 'suggestions')
    if proposed == []:
        return NutritionistReply(mode='no_evidence', message=NO_EVIDENCE, suggestions=[], sources=[])

    # Show the cards themselves if no suggestion survives the checks, or the model could not be asked
    suggestions, sources = checked_suggestions(proposed, cards), sources_for(cards)
    if not suggestions:
        return NutritionistReply(mode='excerpts', message=EXCERPTS_ONLY, suggestions=[], sources=sources)
    return NutritionistReply(mode='suggestions', message=SUGGESTED, suggestions=suggestions, sources=sources)
