"""Load the reviewed knowledge cards and split them into small searchable pieces."""
import json
import re
from dataclasses import dataclass
from pathlib import Path

# The reviewed cards, paraphrased from public health guidance
CARDS_FILE = Path(__file__).resolve().parents[2] / 'knowledge' / 'cards.json'
# A card missing any of these could not be cited honestly, so it is never loaded
REQUIRED_FIELDS = ('id', 'title', 'topic', 'tags', 'text', 'source', 'url', 'source_date', 'licence')
# The areas a search can be limited to
TOPICS = ('nutrition', 'activity', 'sleep', 'diabetes', 'blood_pressure')
# The date printed on the source page, to the day where the page gives one
SOURCE_DATE = re.compile(r'\d{4}-\d{2}(-\d{2})?')


@dataclass(frozen=True)
class Chunk:
    """One searchable piece of text, which always knows its parent card."""
    id: str
    card_id: str
    topic: str
    text: str


def check_card(card):
    """Raise an error naming the problem if a card could not be cited honestly."""
    label = card.get('id', 'A card')

    # Check every field is present and filled in
    for field in REQUIRED_FIELDS:
        if not card.get(field):
            raise ValueError(f'{label} is missing {field}.')

    # Check the values a search or a citation depends on
    if card['topic'] not in TOPICS:
        raise ValueError(f'{label} has an unknown topic.')
    if not SOURCE_DATE.fullmatch(card['source_date']):
        raise ValueError(f'{label} needs a source_date like 2026-01-26.')
    if not card['url'].startswith('https://'):
        raise ValueError(f'{label} needs an https source link.')


def load_cards(path=CARDS_FILE):
    """Return every card in the file, refusing the whole file if any card is unusable."""
    cards = json.loads(Path(path).read_text(encoding='utf-8'))

    # Check each card, since one bad citation should stop the service starting
    for card in cards:
        check_card(card)

    # Check the ids are unique, because answers cite cards by id
    identifiers = [card['id'] for card in cards]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError('Two knowledge cards share an id.')
    return cards


def card_piece(card):
    """Return the searchable form of a card: its title and tags, then its text."""
    return Chunk(card['id'], card['id'], card['topic'], f"{card['title']}. {', '.join(card['tags'])}. {card['text']}")
