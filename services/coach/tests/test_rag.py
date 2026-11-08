"""Check each retrieval step against values worked out by hand."""
import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from coach.rag.bm25 import B, K1, BM25Index, stem, tokenise
from coach.rag.cards import Chunk, TOPICS, card_piece, load_cards
from coach.rag import evaluate
from coach.rag.metrics import context_precision, recall_at_k, reciprocal_rank
from coach.rag.retriever import Retriever, rrf
from coach.rag.vectors import VectorIndex, load_encoder, mean_pool, unit_length


def card(identifier='fictional-card', **changes):
    """Return a complete fictional card, changing only what a test cares about."""
    return {'id': identifier, 'title': 'Fictional title', 'topic': 'sleep', 'tags': ['fictional'], 'text': 'First idea here. Second idea here. Third idea here.',
            'source': 'Fictional source', 'url': 'https://example.org/card', 'source_date': '2026-01-26', 'licence': 'Fictional licence.', **changes}


def write_cards(folder, cards):
    """Return the path of a temporary card file holding these cards."""
    path = Path(folder) / 'cards.json'
    path.write_text(json.dumps(cards), encoding='utf-8')
    return path


def chunk(identifier, text, topic='sleep', card_id=None):
    """Return a fictional piece of a card."""
    return Chunk(identifier, card_id or identifier, topic, text)


def fake_encode(texts):
    """Return vectors that count two marker words, so the nearest piece is known by hand."""
    return unit_length(np.array([[text.count('alpha') + 1e-3, text.count('beta') + 1e-3] for text in texts], dtype=float))


class CardTests(unittest.TestCase):
    def test_real_cards_are_all_usable(self):
        cards = load_cards()
        self.assertGreaterEqual(len(cards), 20)
        self.assertEqual({item['topic'] for item in cards}, set(TOPICS))

    def test_a_card_missing_any_required_field_is_refused(self):
        for field in ('title', 'text', 'source', 'url', 'source_date', 'licence', 'tags'):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as folder:
                with self.assertRaisesRegex(ValueError, field):
                    load_cards(write_cards(folder, [card(**{field: ''})]))

    def test_a_card_with_bad_values_is_refused(self):
        for changes, message in (({'topic': 'astrology'}, 'topic'), ({'source_date': 'last week'}, 'source_date'), ({'url': 'http://example.org'}, 'https')):
            with self.subTest(changes=changes), tempfile.TemporaryDirectory() as folder:
                with self.assertRaisesRegex(ValueError, message):
                    load_cards(write_cards(folder, [card(**changes)]))

    def test_duplicate_ids_are_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, 'share an id'):
                load_cards(write_cards(folder, [card(), card()]))

    def test_sentences_keep_decimals_whole(self):
        self.assertEqual(evaluate.split_sentences('Eat 2.5 g a day. Then stop.'), ['Eat 2.5 g a day.', 'Then stop.'])

    def test_windows_overlap_by_one_sentence(self):
        pieces = evaluate.window_pieces([card()])
        self.assertEqual([piece.id for piece in pieces], ['fictional-card#0', 'fictional-card#1'])
        self.assertTrue(pieces[1].text.endswith('Second idea here. Third idea here.'))

    def test_a_card_piece_is_headed_with_its_title_and_tags(self):
        self.assertEqual(card_piece(card(text='Only idea here.')).text, 'Fictional title. fictional. Only idea here.')


class Bm25Tests(unittest.TestCase):
    def test_tokenise_drops_common_words_and_punctuation(self):
        self.assertEqual(tokenise('How much Sodium is in 2,000 mg?'), ['sodium', '2', '000', 'mg'])

    def test_stem_follows_the_s_stemmer_rules(self):
        cases = {'sugars': 'sugar', 'berries': 'berry', 'sauces': 'sauce', 'glass': 'glass', 'hummus': 'hummus', 'potatoes': 'potatoe', 'sugar': 'sugar'}
        self.assertEqual({word: stem(word) for word in cases}, cases)

    def test_score_matches_the_formula_worked_by_hand(self):
        index = BM25Index([chunk('a', 'salt salt pepper'), chunk('b', 'pepper')])
        # Two pieces, and "salt" is in one: rarity = ln(1 + 1.5 / 1.5)
        rarity = math.log(2)
        # Piece "a" has three words against an average of two
        expected = rarity * 2 * (K1 + 1) / (2 + K1 * (1 - B + B * 1.5))
        self.assertAlmostEqual(index.search('salt', 1)[0][1], expected, places=9)

    def test_a_piece_sharing_no_word_is_not_returned(self):
        index = BM25Index([chunk('a', 'salt'), chunk('b', 'pepper')])
        self.assertEqual([item.id for item, _score in index.search('salt', 5)], ['a'])

    def test_topics_filter_before_ranking(self):
        index = BM25Index([chunk('a', 'salt salt', topic='nutrition'), chunk('b', 'salt', topic='sleep')])
        self.assertEqual([item.id for item, _score in index.search('salt', 5, {'sleep'})], ['b'])

    def test_equal_scores_are_ordered_by_id(self):
        index = BM25Index([chunk('b', 'salt'), chunk('a', 'salt')])
        self.assertEqual([item.id for item, _score in index.search('salt', 5)], ['a', 'b'])

    def test_an_empty_index_returns_nothing(self):
        self.assertEqual(BM25Index([]).search('salt', 5), [])


class VectorTests(unittest.TestCase):
    def test_mean_pool_leaves_out_padding(self):
        hidden = np.array([[[2.0, 4.0], [100.0, 100.0]]])
        self.assertEqual(mean_pool(hidden, np.array([[1, 0]])).tolist(), [[2.0, 4.0]])

    def test_unit_length_scales_to_one(self):
        self.assertEqual(unit_length(np.array([[3.0, 4.0]])).tolist(), [[0.6, 0.8]])

    def test_a_missing_model_means_no_encoder(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertIsNone(load_encoder(folder))

    def test_search_returns_the_nearest_piece_first(self):
        index = VectorIndex([chunk('a', 'alpha alpha'), chunk('b', 'beta beta')], fake_encode)
        results = index.search('beta', 2)
        self.assertEqual([item.id for item, _score in results], ['b', 'a'])
        self.assertAlmostEqual(results[0][1], 1.0, places=3)

    def test_topics_filter_before_ranking(self):
        index = VectorIndex([chunk('a', 'beta', topic='nutrition'), chunk('b', 'alpha', topic='sleep')], fake_encode)
        self.assertEqual([item.id for item, _score in index.search('beta', 5, {'sleep'})], ['b'])


class RetrieverTests(unittest.TestCase):
    def test_rrf_matches_the_values_worked_by_hand(self):
        # "b" scores 1/61 + 1/62 and beats "a" (1/61) and "c" (1/62)
        self.assertEqual(rrf([['a', 'b'], ['b', 'c']]), ['b', 'a', 'c'])

    def test_rrf_breaks_ties_by_id(self):
        self.assertEqual(rrf([['b'], ['a']]), ['a', 'b'])

    def test_a_card_is_returned_once_at_its_best_position(self):
        owners = {'x#0': 'x', 'y#0': 'y', 'x#1': 'x'}
        self.assertEqual(evaluate.parent_cards(['x#0', 'y#0', 'x#1'], owners), ['x', 'y'])

    def test_retriever_falls_back_to_words_without_an_encoder(self):
        retriever = Retriever([card('one', text='alpha idea.'), card('two', text='beta idea.')], None)
        with patch('coach.rag.retriever.MIN_WORD_SCORE', 0.01):
            self.assertEqual([item['id'] for item in retriever.search('alpha')], ['one'])

    def test_retriever_without_an_encoder_abstains_below_its_cut_off(self):
        retriever = Retriever([card('one', text='alpha idea.'), card('two', text='beta idea.')], None)
        with patch('coach.rag.retriever.MIN_WORD_SCORE', 1000):
            self.assertEqual(retriever.search('alpha'), [])

    def test_retriever_abstains_when_the_closest_card_is_about_something_else(self):
        retriever = Retriever([card('one', title='beta', tags=['beta'], text='beta beta.')], fake_encode)
        self.assertEqual(retriever.search('alpha'), [])

    def test_retriever_finds_a_card_by_meaning_when_no_word_is_shared(self):
        retriever = Retriever([card('one', title='beta', tags=['beta'], text='beta beta.'), card('two', title='gamma', tags=['gamma'], text='gamma.')], fake_encode)
        # "gamma" has neither marker word, so the fake encoder puts it nearer "alpha" than "beta" is
        self.assertEqual(retriever.search('alpha')[0]['id'], 'two')

    def test_retriever_keeps_to_the_requested_topics(self):
        retriever = Retriever([card('one', text='alpha.', topic='nutrition'), card('two', text='alpha.', topic='sleep')], fake_encode)
        self.assertEqual([item['id'] for item in retriever.search('alpha', topics={'sleep'})], ['two'])


class MetricTests(unittest.TestCase):
    def test_recall_counts_the_share_found_in_the_top_k(self):
        self.assertEqual(recall_at_k(['a', 'b', 'c'], ['a', 'c'], 2), 0.5)

    def test_reciprocal_rank_uses_the_first_relevant_position(self):
        self.assertEqual(reciprocal_rank(['x', 'a', 'b'], ['a', 'b']), 0.5)
        self.assertEqual(reciprocal_rank(['x'], ['a']), 0.0)

    def test_context_precision_rewards_relevant_cards_near_the_top(self):
        # Relevant at 1 and 3: (1/1 + 2/3) / 2
        self.assertAlmostEqual(context_precision(['a', 'x', 'b'], ['a', 'b'], 3), 5 / 6, places=9)
        # Relevant only at 2: (1/2) / 1
        self.assertEqual(context_precision(['x', 'a'], ['a'], 2), 0.5)
        self.assertEqual(context_precision(['x'], ['a'], 1), 0.0)


class EvaluationTests(unittest.TestCase):
    def test_threshold_sits_in_the_middle_of_the_gap(self):
        self.assertAlmostEqual(evaluate.tune_threshold([0.5, 0.6], [0.1, 0.3]), 0.4, places=9)

    def test_abstention_counts_each_kind_of_question(self):
        self.assertEqual(evaluate.abstention([0.5, 0.2], [0.1, 0.4], 0.3), {'answered_when_it_should': 0.5, 'abstained_when_it_should': 0.5})

    def test_only_answerable_questions_are_scored_for_ranking(self):
        questions = [{'q': 'fictional', 'relevant': ['a']}, {'q': 'out of scope', 'relevant': []}]
        self.assertEqual(evaluate.score_design(lambda _question: ['a'], questions)['mrr'], 1.0)

    def test_a_second_sealed_run_is_refused(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(evaluate, 'SEALED_RESULT', write_cards(folder, [])):
            with self.assertRaisesRegex(SystemExit, 'already been run'):
                evaluate.main('sealed')


if __name__ == '__main__':
    unittest.main()
