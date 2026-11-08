"""
Compare retrieval designs on the development questions, and run the sealed set once.

Run from services/coach:  python -m coach.rag.evaluate dev
                          python -m coach.rag.evaluate sealed

The rule, fixed before the sealed run. The Coach reads three cards, so recall at 3 is the
measure that counts, and MRR breaks a tie. The development questions chose fused search
over whole cards, because sentence windows lost on every measure. Fusion only ships if its
sealed recall at 3 is strictly higher than the better single search; otherwise the better
single search ships. Query rewriting and reranking are not built: development recall at 3
is 0.986, which leaves them nothing to improve on this set of cards.
"""
import json
import re
import sys
from pathlib import Path
from statistics import mean
from .bm25 import BM25Index
from .cards import Chunk, card_piece, load_cards
from .metrics import context_precision, recall_at_k, reciprocal_rank
from .retriever import CANDIDATES, CONTEXT_CARDS, ids_of, rrf
from .vectors import VectorIndex, load_encoder

# The repository's evaluation folder
EVAL = Path(__file__).resolve().parents[4] / 'eval'
# The record of the one sealed run; while this exists the sealed set cannot be run again
SEALED_RESULT = EVAL / 'results' / 'retrieval_final.json'
# Sentences in each window of the design that lost: overlapping pieces of each card
WINDOW_SIZE = 2


def whole_card_pieces(cards):
    """Return one piece per card, the design that shipped."""
    return [card_piece(card) for card in cards]


def split_sentences(text):
    """Return the sentences of a text, keeping a decimal such as 2.5 whole."""
    return [sentence.strip() for sentence in re.split(r'(?<=[.!?])\s+', text) if sentence.strip()]


def window_pieces(cards):
    """Return overlapping sentence windows of every card, each headed with its title and tags."""
    pieces = []
    for card in cards:
        sentences = split_sentences(card['text'])
        heading = f"{card['title']}. {', '.join(card['tags'])}."
        for start in range(max(len(sentences) - WINDOW_SIZE, 0) + 1):
            pieces.append(Chunk(f"{card['id']}#{start}", card['id'], card['topic'], f"{heading} {' '.join(sentences[start:start + WINDOW_SIZE])}"))
    return pieces


def parent_cards(chunk_ids, card_of):
    """Return the parent card of each ranked piece, once each, at its best position."""
    return list(dict.fromkeys(card_of[identifier] for identifier in chunk_ids))


def designs_over(chunks, encode, label):
    """Return word, meaning and fused search over one way of cutting the cards."""
    words = BM25Index(chunks)
    meaning = VectorIndex(chunks, encode)
    owners = {chunk.id: chunk.card_id for chunk in chunks}

    def by_words(question):
        return parent_cards(ids_of(words.search(question, CANDIDATES)), owners)

    def by_meaning(question):
        return parent_cards(ids_of(meaning.search(question, CANDIDATES)), owners)

    def fused(question):
        return parent_cards(rrf([ids_of(words.search(question, CANDIDATES)), ids_of(meaning.search(question, CANDIDATES))]), owners)
    return {f'words / {label}': by_words, f'meaning / {label}': by_meaning, f'fused / {label}': fused}


def score_design(search, questions):
    """Return the averaged metrics for one design over the answerable questions."""
    answerable = [item for item in questions if item['relevant']]
    rankings = [(search(item['q']), item['relevant']) for item in answerable]
    return {
        'recall_at_1': mean(recall_at_k(ranked, relevant, 1) for ranked, relevant in rankings),
        'recall_at_3': mean(recall_at_k(ranked, relevant, CONTEXT_CARDS) for ranked, relevant in rankings),
        'mrr': mean(reciprocal_rank(ranked, relevant) for ranked, relevant in rankings),
        'context_precision_at_3': mean(context_precision(ranked, relevant, CONTEXT_CARDS) for ranked, relevant in rankings),
    }


def best_similarities(chunks, encode, questions):
    """Return the closest piece's similarity for each answerable and each unanswerable question."""
    index = VectorIndex(chunks, encode)
    closest = [(item, index.search(item['q'], 1)[0][1]) for item in questions]
    return [value for item, value in closest if item['relevant']], [value for item, value in closest if not item['relevant']]


def abstention(answerable, unanswerable, threshold):
    """Return how many of each kind of question a similarity threshold gets right."""
    return {'answered_when_it_should': mean(value >= threshold for value in answerable), 'abstained_when_it_should': mean(value < threshold for value in unanswerable)}


def tune_threshold(answerable, unanswerable):
    """
    Return the threshold with the best balanced accuracy, in the middle of its gap.

    A threshold only changes outcomes between two observed similarities, so the midpoints
    are the only candidates. On a tie the widest gap wins, leaving the most margin.
    """
    observed = sorted(set(answerable) | set(unanswerable))
    gaps = [(low, high) for low, high in zip(observed, observed[1:])]
    best = max(gaps, key=lambda gap: (sum(abstention(answerable, unanswerable, (gap[0] + gap[1]) / 2).values()), gap[1] - gap[0]))
    return (best[0] + best[1]) / 2


def report(questions, encode, cards):
    """Return every design's metrics, and the closest similarities over whole cards."""
    whole_cards = whole_card_pieces(cards)
    designs = {**designs_over(whole_cards, encode, 'whole card'), **designs_over(window_pieces(cards), encode, 'windows')}
    return {name: score_design(search, questions) for name, search in designs.items()}, best_similarities(whole_cards, encode, questions)


def show(results):
    """Print one line per design, so the comparison reads at a glance."""
    print(f"{'design':26} {'recall@1':>9} {'recall@3':>9} {'MRR':>7} {'precision@3':>12}")
    for name, values in results.items():
        print(f"{name:26} {values['recall_at_1']:9.3f} {values['recall_at_3']:9.3f} {values['mrr']:7.3f} {values['context_precision_at_3']:12.3f}")


def main(split):
    """Run the named split, refusing a second sealed run."""
    # Ignore a repeat sealed run, because a second look would turn it into tuning data
    if split == 'sealed' and SEALED_RESULT.exists():
        sys.exit(f'The sealed set has already been run. See {SEALED_RESULT}.')

    # Ignore a machine without the model, because the comparison needs both searches
    encode = load_encoder()
    if encode is None:
        sys.exit('The MiniLM model is not on this machine; see services/coach/README.md.')

    # Score every design, always tuning the threshold on the development questions only
    cards = load_cards()
    dev = json.loads((EVAL / 'fixtures' / 'retrieval_dev.json').read_text(encoding='utf-8'))
    questions = dev if split == 'dev' else json.loads((EVAL / 'fixtures' / 'retrieval_sealed.json').read_text(encoding='utf-8'))
    threshold = tune_threshold(*best_similarities(whole_card_pieces(cards), encode, dev))
    results, similarities = report(questions, encode, cards)
    show(results)
    outcome = abstention(*similarities, threshold)
    print(f'similarity threshold {threshold:.3f} tuned on dev: {outcome}')

    # Record the sealed run, which also locks it
    if split == 'sealed':
        SEALED_RESULT.parent.mkdir(parents=True, exist_ok=True)
        SEALED_RESULT.write_text(json.dumps({'questions': len(questions), 'cards': len(cards), 'similarity_threshold': threshold, 'abstention': outcome, 'designs': results}, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'dev')
