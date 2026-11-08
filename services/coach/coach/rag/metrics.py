"""Score a ranked list of cards against the cards a question really needs."""


def recall_at_k(ranked, relevant, k):
    """Return the share of the relevant cards that appear in the top k."""
    return len(set(ranked[:k]) & set(relevant)) / len(relevant)


def reciprocal_rank(ranked, relevant):
    """Return one over the position of the first relevant card, or zero if there is none."""
    for position, identifier in enumerate(ranked, start=1):
        if identifier in relevant:
            return 1 / position
    return 0.0


def context_precision(ranked, relevant, k):
    """
    Return how near the top the relevant cards sit among the first k.

    This averages precision at each position holding a relevant card, so a relevant
    card at position one counts for more than the same card at position three.
    """
    found = 0
    total = 0.0
    for position, identifier in enumerate(ranked[:k], start=1):
        if identifier in relevant:
            found += 1
            total += found / position

    # Ignore a list with no relevant card, because there is nothing to average
    return total / found if found else 0.0
