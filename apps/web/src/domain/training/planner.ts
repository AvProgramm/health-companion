/**
 * The workout planner: a depth-first search over the reviewed cards.
 *
 * State: the next card index, the cards chosen so far, and the minutes left.
 * Action: skip the next card, or include it if it still fits.
 * Every action moves to the next index, so the search always ends, and an
 * over-time plan is never built (it is pruned before it is explored).
 * With at most eight cards an exhaustive search is cheap; that is the point:
 * the result can be checked against a brute-force oracle in the tests.
 */
import type { Category, MovementCard } from './catalogue';
import { splitCards, type PlanRequest } from './eligibility';

// A short session stays focused; more cards would mostly add transitions
export const MAX_CARDS = 3;

/**
 * One possible session, with the numbers compareCandidates ranks on.
 */
export interface Candidate {
  cards: readonly MovementCard[];
  minutes: number;
  // How many of the requested categories the session covers
  covered: number;
  // Sum of the person's preferences for the chosen cards
  preference: number;
  // The chosen IDs in order, the final tie-break so the result never depends on luck
  ids: string;
}

export type PlanResult =
  | { status: 'plan'; plan: Candidate; considered: number; excluded: { card: MovementCard; reason: string }[] }
  | { status: 'none'; reason: string; excluded: { card: MovementCard; reason: string }[] };

/**
 * Return every session that fits the request, found by depth-first include/skip search.
 */
export function feasibleCandidates(request: PlanRequest, catalogue: readonly MovementCard[]): Candidate[] {
  const { eligible } = splitCards(request, catalogue);
  const found: Candidate[] = [];

  /**
   * Explore the two choices for the card at this index.
   */
  function search(index: number, chosen: MovementCard[], minutesLeft: number): void {
    // Every card has been decided: keep the session if it has at least one card
    if (index === eligible.length) {
      if (chosen.length > 0) {
        found.push(summarise(chosen, request));
      }
      return;
    }
    const card = eligible[index]!;

    // Skip this card
    search(index + 1, chosen, minutesLeft);

    // Include it only if it fits the time left and the session has room
    if (card.minutes <= minutesLeft && chosen.length < MAX_CARDS) {
      search(index + 1, [...chosen, card], minutesLeft - card.minutes);
    }
  }

  search(0, [], request.minutes);
  return found;
}

/**
 * Return the numbers a session is ranked on.
 */
export function summarise(cards: readonly MovementCard[], request: PlanRequest): Candidate {
  const categories = new Set<Category>(cards.map((card) => card.category));
  return {
    cards,
    minutes: cards.reduce((total, card) => total + card.minutes, 0),
    covered: request.categories.filter((category) => categories.has(category)).length,
    preference: cards.reduce((total, card) => total + (request.preferences[card.id] ?? 0), 0),
    ids: cards.map((card) => card.id).join(','),
  };
}

/**
 * Return a negative number if session a is better than b, positive if b is better.
 *
 * Written by Yash. Tests: planner.test.ts, "compareCandidates" and "bestPlan with compareCandidates".
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  // 1. More requested categories covered is better
  if (a.covered !== b.covered) {
    return b.covered - a.covered;
  }

  // 2. Higher preference total is better
  if (a.preference !== b.preference) {
    return b.preference - a.preference;
  }

  // 3. Shorter session is better
  if (a.minutes !== b.minutes) {
    return a.minutes - b.minutes;
  }

  // 4. Deterministic tie-breaker
  return a.ids.localeCompare(b.ids);
}

/**
 * Return the best session for the request, or why there is none.
 *
 * "No plan" is a real answer: with no time, or nothing that fits, rest is a valid choice.
 */
export function bestPlan(request: PlanRequest, catalogue: readonly MovementCard[]): PlanResult {
  const { excluded } = splitCards(request, catalogue);
  const candidates = feasibleCandidates(request, catalogue);

  // Nothing fits: say why rather than relaxing a rule
  if (candidates.length === 0) {
    const reason = request.minutes <= 0
      ? 'There is no time for a session today. Rest is a valid choice.'
      : 'No exercise fits today: every card was left out for a reason below.';
    return { status: 'none', reason, excluded };
  }

  // Rank every candidate with the same rule and keep the best
  const plan = [...candidates].sort(compareCandidates)[0]!;
  return { status: 'plan', plan, considered: candidates.length, excluded };
}
