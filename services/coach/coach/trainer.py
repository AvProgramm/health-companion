"""Let the AI Trainer choose exercises, keeping every hard limit outside the model."""
import asyncio
import json
import httpx
from .agent import Tool, run_coach
from .exercises import search_exercises
from .models import TrainerReply

# Enough candidates for variety, few enough to fit in one prompt
SHORTLIST_SIZE = 40
# Fewer valid picks than this means the model did not really answer
MIN_PICKS = 6
# More than a session needs, so some can still be dropped by the rules on the phone
MAX_PICKS = 16
# Three model calls have to fit inside the browser's wait
COACH_DEADLINE = 30.0

# What the model is told; the hard limits are enforced in code, not by asking nicely
SYSTEM = ('You are a careful gym trainer inside a health diary. Choose exercises only from the shortlist you are given, by id. '
          f'Rank {MIN_PICKS * 2} to {MAX_PICKS} exercises, best first, for the person\'s goal and time. Balance the areas and muscles '
          'unless the goal asks otherwise. Never invent an exercise or give medical advice. Finish with '
          '{"final": {"exerciseIds": ["..."], "reason": "One or two plain sentences on why this session suits the goal."}}.')


def describe(entry):
    """Return only the library facts the model needs to choose an exercise."""
    return {'id': entry['id'], 'name': entry['name'], 'area': entry['category'], 'muscle': entry['primaryMuscles'][:1], 'level': entry['level']}


def valid_picks(final, shortlist):
    """Return the model's picks that are really on the shortlist, once each, in its order."""
    # Ignore a malformed list, because a model's output cannot be trusted
    proposed = final.get('exerciseIds') if isinstance(final, dict) else None
    if not isinstance(proposed, list):
        return []

    # Keep each shortlisted exercise once and stop at the cap
    allowed = {entry['id'] for entry in shortlist}
    return list(dict.fromkeys(item for item in proposed if isinstance(item, str) and item in allowed))[:MAX_PICKS]


def search_tool(library, request):
    """
    Return the search tool for this request, with the person's kit and level fixed.

    The model may only narrow the areas. It has no way to ask for more equipment or a
    harder level, so it cannot talk its way past a hard filter.
    """
    def run(arguments):
        """Search again within the person's own limits."""
        areas = [area for area in arguments.get('areas', []) if area in request.areas] or request.areas
        return [describe(entry) for entry in search_exercises(library, areas, request.equipment, request.level, SHORTLIST_SIZE)]
    return Tool('search_exercises', 'Search again for one or more of the chosen areas. Arguments: {"areas": ["legs"]}.', run)


async def plan_session(request, library, ask):
    """
    Return the Trainer's ranked exercises for one request, or a safe fallback.

    The phone still checks every pick against the person's own rules and fits them to
    the time, so this reply is only ever a proposal.
    """
    # Filter first, so the model only ever sees exercises the person could do
    shortlist = search_exercises(library, request.areas, request.equipment, request.level, SHORTLIST_SIZE)
    if not shortlist:
        return TrainerReply(exerciseIds=[], reason='Nothing in the library fits this equipment, area and level.', source='library')

    # Ask the model, treating any provider failure as "use the fallback"
    message = json.dumps({'goal': request.goal, 'minutes': request.minutes, 'shortlist': [describe(entry) for entry in shortlist]})
    try:
        final = await asyncio.wait_for(run_coach(SYSTEM, message, [search_tool(library, request)], ask), timeout=COACH_DEADLINE)
    except (TimeoutError, httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
        final = None

    # Use the model's picks only if there are enough real ones
    picks = valid_picks(final, shortlist)
    if len(picks) >= MIN_PICKS:
        reason = final.get('reason')
        return TrainerReply(exerciseIds=picks, reason=reason[:300] if isinstance(reason, str) and reason.strip() else 'Chosen for your goal.', source='ai')

    # Return a balanced library set, which is already spread over the muscles
    return TrainerReply(exerciseIds=[entry['id'] for entry in shortlist[:MAX_PICKS]], source='library',
                        reason='The AI is busy right now, so this is a balanced set from the library.')
