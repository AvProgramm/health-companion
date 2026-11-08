"""Find the reviewed cards that answer a question, by words and by meaning."""
from collections import defaultdict
from .bm25 import BM25Index
from .cards import chunk_card
from .vectors import VectorIndex

# The usual reciprocal-rank constant, which stops one list's top place dominating
RRF_K = 60
# How many pieces each index passes to the fusion step
CANDIDATES = 20


def rrf(rankings, k=RRF_K):
    """
    Return every id across the rankings, best first, by reciprocal rank fusion.

    Only positions are used, so BM25 scores and cosine similarities never have to be
    put on the same scale.
    """
    scores = defaultdict(float)
    for ranking in rankings:
        for position, identifier in enumerate(ranking, start=1):
            scores[identifier] += 1 / (k + position)

    # Break ties by id, so the same question always gets the same order
    return sorted(scores, key=lambda identifier: (-scores[identifier], identifier))


def parent_cards(chunk_ids, card_of):
    """Return the parent card of each ranked piece, once each, at its best position."""
    return list(dict.fromkeys(card_of[identifier] for identifier in chunk_ids))


class Retriever:
    """Search small pieces, fuse words with meaning, and hand back whole cards."""

    def __init__(self, cards, encode):
        """Initialise both indexes; without an encoder, words alone are used."""
        chunks = [chunk for card in cards for chunk in chunk_card(card)]
        self.cards = {card['id']: card for card in cards}
        self.card_of = {chunk.id: chunk.card_id for chunk in chunks}
        self.words = BM25Index(chunks)
        self.meaning = VectorIndex(chunks, encode) if encode is not None else None

    def rank(self, query, topics=None):
        """Return the card ids for a question, best first, and the closest similarity."""
        by_words = [chunk.id for chunk, _score in self.words.search(query, CANDIDATES, topics)]

        # Ignore meaning when the encoder is missing, because words still work alone
        if self.meaning is None:
            return parent_cards(by_words, self.card_of), None

        by_meaning = self.meaning.search(query, CANDIDATES, topics)
        fused = rrf([by_words, [chunk.id for chunk, _score in by_meaning]])
        return parent_cards(fused, self.card_of), max((score for _chunk, score in by_meaning), default=0.0)
