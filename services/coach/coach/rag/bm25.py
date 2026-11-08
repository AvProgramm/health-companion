"""Rank knowledge pieces by the words they share with a question."""
import math
import re
from collections import Counter

# How quickly repeating a word stops helping, at the usual Okapi setting
K1 = 1.5
# How much a longer piece is penalised, at the usual Okapi setting
B = 0.75
# Words too common to say what a question is about
STOPWORDS = frozenset('''a about after all am an and any are as at be been before but by can could did do does doing for from
    get had has have how i if im in into is it its ive just me more most much my no not of on or our should so some such than
    that the their them then there these they this to too very was we were what when where which who why will with would you your'''.split())


def stem(word):
    """Return a word without its plural ending, by Harman's S-stemmer rules."""
    if word.endswith('ies') and not word.endswith(('eies', 'aies')):
        return word[:-3] + 'y'
    if word.endswith('es') and not word.endswith(('aes', 'ees', 'oes')):
        return word[:-1]
    if word.endswith('s') and not word.endswith(('us', 'ss')):
        return word[:-1]
    return word


def tokenise(text):
    """Return the lower-case content words of a text, with plurals made singular."""
    return [stem(word) for word in re.findall(r'[a-z0-9]+', text.lower()) if word not in STOPWORDS]


class BM25Index:
    """Score pieces with Okapi BM25, which rewards rare words and short pieces."""

    def __init__(self, chunks):
        """Initialise the word counts each score needs."""
        self.chunks = list(chunks)
        self.counts = [Counter(tokenise(chunk.text)) for chunk in self.chunks]
        self.lengths = [sum(counts.values()) for counts in self.counts]
        self.average_length = sum(self.lengths) / len(self.lengths) if self.lengths else 0.0

        # Count how many pieces hold each word, so that rare words weigh more
        held_by = Counter(word for counts in self.counts for word in counts)
        self.rarity = {word: math.log(1 + (len(self.chunks) - pieces + 0.5) / (pieces + 0.5)) for word, pieces in held_by.items()}

    def score(self, words, position):
        """Return the BM25 score of one piece for a set of query words."""
        total = 0.0
        length_ratio = self.lengths[position] / self.average_length
        for word in words:
            found = self.counts[position][word]
            # Ignore a word this piece doesn't hold, because it adds nothing
            if found:
                total += self.rarity[word] * found * (K1 + 1) / (found + K1 * (1 - B + B * length_ratio))
        return total

    def search(self, query, k, topics=None):
        """Return up to k (chunk, score) pairs, best first, sharing at least one word."""
        words = set(tokenise(query))
        scored = []
        for position, chunk in enumerate(self.chunks):
            # Ignore a piece outside the requested topics, before it can be ranked
            if topics is not None and chunk.topic not in topics:
                continue
            value = self.score(words, position)
            if value > 0:
                scored.append((chunk, value))

        # Break ties by id, so the same question always gets the same order
        scored.sort(key=lambda pair: (-pair[1], pair[0].id))
        return scored[:k]
