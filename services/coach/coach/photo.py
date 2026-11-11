"""Let a hosted vision model list the foods in one photo, as text for the entry box and never saved."""
import re
from .failures import PROVIDER_FAILURES
from .models import PhotoFood, PhotoReply

# Enough for a full banana-leaf plate, few enough to review at a glance
MAX_FOODS = 8
# Long enough for "chicken rendang", short enough for one item in the entry box
MAX_NAME_LENGTH = 40
# A count above this is more likely a misread than a plate
MAX_AMOUNT = 50
# The portions the composer and the estimate step already understand, so the model cannot invent one
UNITS = {'piece', 'bowl', 'cup', 'plate', 'glass', 'can', 'slice', 'spoon', 'g', 'ml'}
# Words the composer reads as a break between items, so a name holding one would split in two
SEPARATOR = re.compile(r'[,+&]|\b(and|with|plus)\b', re.IGNORECASE)
# Portions are fine, but energy and nutrient amounts come only from the estimate step
NUTRIENT_WORD = re.compile(r'\b(k?cal|calories?|protein|carbs?|fat|sugar|sodium)\b', re.IGNORECASE)

# Group served portions and name only what the image supports.
SYSTEM = (
    'Look at one photo of food or drink for a personal diary app. Return one entry per separately served food '
    'or drink you can see, up to 8, largest first. Count ingredients inside a mixed side only as part of that side. '
    'For example, list a cucumber salad once when the cucumber belongs to the salad. '
    'Use the most specific everyday English name supported by the visible food, without brand names. '
    'Coating and sauce alone cannot distinguish fish from chicken. Do not infer the protein, sauce or recipe '
    'from colour alone. Use a broader name when it is still informative, such as rice if the variety is unclear. '
    'Omit a food if no useful name is supported. '
    'Give each entry a name, a numeric amount and one unit: piece, bowl, cup, plate, glass, can, slice, spoon, g, ml. '
    'Count visible pieces where possible. For an uncountable portion, use a rough household measure, including '
    'fractions when appropriate. Use a plate only when that food occupies a full plate on its own. '
    'Use grams or millilitres only for an explicitly visible measurement of the portion shown. '
    'Never state calories or nutrients. Return an empty list if no food can be identified. '
    'Reply with only JSON: {"foods": [{"name": "...", "amount": 1, "unit": "piece"}]}.'
)

# What the person reads with the list
LISTED = 'Check the suggested foods and amounts. Put them in the entry box to edit or add anything missing. Nothing is saved yet.'
# What the person reads when the model could not be asked or found nothing usable
NOTHING = 'No foods could be read from this photo. Type what you ate in the entry box instead.'


def valid_food(item):
    """Return whether one listed food is well formed and states no nutrients."""
    # Ignore a malformed item, because a model's output cannot be trusted
    if not isinstance(item, dict):
        return False
    name, amount, unit = item.get('name'), item.get('amount'), item.get('unit')
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > MAX_NAME_LENGTH:
        return False

    # Ignore a name the composer would split or read as a nutrient
    if SEPARATOR.search(name) or NUTRIENT_WORD.search(name) or any(character.isdigit() for character in name):
        return False

    # Ignore an amount that is not a positive, believable number, or a unit outside the list
    if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not 0 < amount <= MAX_AMOUNT:
        return False
    return unit in UNITS


def entry_text(food):
    """
    Return one food as someone would type it in the diary.

    Pieces read "12 almonds" and weights "150 g rice", which the composer takes as amounts.
    A container reads "1 bowl of dal", which the composer keeps as portion text for the estimate.
    """
    amount = int(food['amount']) if float(food['amount']).is_integer() else food['amount']
    name, unit = food['name'].strip().lower(), food['unit']
    if unit == 'piece':
        return f'{amount} {name}'
    if unit in ('g', 'ml'):
        return f'{amount} {unit} {name}'
    return f'{amount} {unit} of {name}'


def checked_foods(proposed):
    """Return only the foods that survive the checks, in the model's order."""
    # Ignore anything that is not a list of foods
    if not isinstance(proposed, list):
        return []
    return [PhotoFood(name=item['name'].strip().lower(), entry=entry_text(item)) for item in proposed[:MAX_FOODS] if valid_food(item)]


async def list_foods(image, ask):
    """
    Return the checked foods in one photo, or an honest reason for none.

    Only the photo is sent, and only after the person tapped the button. The reply is text
    for the entry box, so the normal estimate and confirmation still decide what is saved.
    """
    # Send the photo once, with the instructions beside it
    messages = [{'role': 'system', 'content': SYSTEM},
                {'role': 'user', 'content': [{'type': 'text', 'text': 'List the foods in this photo.'},
                                             {'type': 'image_url', 'image_url': {'url': image}}]}]
    try:
        reply = await ask(messages)
    except PROVIDER_FAILURES:
        return PhotoReply(mode='nothing', message=NOTHING, foods=[])

    # Keep only what passed every check
    foods = checked_foods(reply.get('foods') if isinstance(reply, dict) else None)
    if not foods:
        return PhotoReply(mode='nothing', message=NOTHING, foods=[])
    return PhotoReply(mode='foods', message=LISTED, foods=foods)
