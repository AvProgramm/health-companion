"""Find the reviewed cards that answer a question, by words and by meaning."""
from collections import defaultdict
from functools import lru_cache
from .bm25 import BM25Index
from .cards import card_piece, load_cards
from .vectors import VectorIndex, load_encoder

# The usual reciprocal-rank constant, which stops one list's top place dominating
RRF_K = 60
# How many cards each index passes to the fusion step
CANDIDATES = 20
# Cards handed to the model, so the answer stays short and every card can be read
CONTEXT_CARDS = 3
# Below this cosine the closest card is about something else; tuned on development questions only
MIN_SIMILARITY = 0.336
# The same cut-off for word search, used only when the encoder is missing
MIN_WORD_SCORE = 3.725


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


def ids_of(results):
    """Return only the ids from a list of (chunk, score) pairs."""
    return [chunk.id for chunk, _score in results]


class Retriever:
    """
    Fuse word search with meaning search over whole cards.

    This design won on the sealed questions; see eval/results/retrieval_final.json.
    """

    def __init__(self, cards, encode):
        """Initialise both indexes; without an encoder, words alone are used."""
        pieces = [card_piece(card) for card in cards]
        self.cards = {card['id']: card for card in cards}
        self.words = BM25Index(pieces)
        self.meaning = VectorIndex(pieces, encode) if encode is not None else None

    def search(self, query, k=CONTEXT_CARDS, topics=None):
        """Return up to k cards for a question, best first, or none if nothing is close."""
        by_words = self.words.search(query, CANDIDATES, topics)

        # Use words alone when the encoder is missing, with their own cut-off
        if self.meaning is None:
            close_enough = bool(by_words) and by_words[0][1] >= MIN_WORD_SCORE
            ranking = ids_of(by_words)
        else:
            by_meaning = self.meaning.search(query, CANDIDATES, topics)
            close_enough = bool(by_meaning) and by_meaning[0][1] >= MIN_SIMILARITY
            ranking = rrf([ids_of(by_words), ids_of(by_meaning)])

        # Return nothing rather than cards about something else
        return [self.cards[identifier] for identifier in ranking[:k]] if close_enough else []


@lru_cache(maxsize=1)
def knowledge():
    """Return the retriever over the reviewed cards, built once on first use because it loads the encoder."""
    return Retriever(load_cards(), load_encoder())
