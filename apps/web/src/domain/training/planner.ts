/**
 * Choose a target-duration session from reviewed or explicitly chosen cards.
 *
 * Keep only the best partial session for each time, category mask and card count.
 * Equivalent states have the same future choices, so weaker ones need not be expanded.
 */
import type { Category, MovementCard } from './catalogue';
import { splitCards, type PlanRequest } from './eligibility';
import { fillRepeatedRound, type RoundSchedule } from './rounds';

// Twelve distinct five-minute blocks can fill an hour without repeating an exercise.
export const MAX_CARDS = 12;
// Four category bits encode all sixteen possible coverage combinations.
const CATEGORY_BITS: Record<Category, number> = { push: 1, pull: 2, legs: 4, core: 8 };
// Reserve sixteen mask values and thirteen counts, including the empty session.
const MASK_COUNT = 16;

/** Describe one session and the values used to rank it. */
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
  | { status: 'plan'; plan: Candidate; schedule?: RoundSchedule; unfilledMinutes: number; considered: number; excluded: { card: MovementCard; reason: string }[] }
  | { status: 'none'; reason: string; excluded: { card: MovementCard; reason: string }[] };

/**
 * Return the best representative of each feasible time, category mask and count.
 *
 * Process each card once. Read a snapshot of the previous states so a card cannot
 * be reused in the same pass. Retain preference and ID ties only within equivalent
 * states; different coverage masks and counts may lead to different future plans.
 */
export function feasibleCandidates(request: PlanRequest, catalogue: readonly MovementCard[]): Candidate[] {
  // Ignore an invalid target because exact planning requires a safe whole-minute number.
  if (!validTarget(request.minutes)) return [];

  // Filter before searching; equipment and capability rules are never loosened.
  const { eligible } = splitCards(request, catalogue);
  const empty = { candidate: summarise([], request), mask: 0 };
  const states = new Map<number, typeof empty>([[0, empty]]);

  // Extend each earlier state by this card, or leave it unchanged to skip the card.
  for (const card of eligible) {
    const previousStates = [...states.values()];
    for (const state of previousStates) {
      const count = state.candidate.cards.length + 1;
      const minutes = state.candidate.minutes + card.minutes;
      // Ignore an over-limit extension because extra time and repeated blocks are not invented.
      if (count > MAX_CARDS || minutes > request.minutes) continue;

      // Combine coverage bits and pack the three state values into a unique integer key.
      const mask = state.mask | CATEGORY_BITS[card.category];
      const key = (minutes * MASK_COUNT + mask) * (MAX_CARDS + 1) + count;
      const candidate = summarise([...state.candidate.cards, card], request);
      const previous = states.get(key);
      // Keep the better equivalent prefix because both can use exactly the same later cards.
      if (previous === undefined || compareCandidates(candidate, previous.candidate) < 0) {
        states.set(key, { candidate, mask });
      }
    }
  }

  // Leave out the empty seed; no eligible card means an honest no-plan result.
  return [...states.values()].filter(state => state.candidate.cards.length > 0).map(state => state.candidate);
}

/** Return whether a target can be represented exactly in whole minutes. */
function validTarget(minutes: number): boolean {
  return Number.isSafeInteger(minutes) && minutes >= 0;
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
 * Originally written by Yash; revise duration ranking with his explicit approval (7 Nov).
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  // 1. More requested categories covered is better
  if (a.covered !== b.covered) {
    return b.covered - a.covered;
  }

  // 2. Fill more of the target: every feasible candidate already fits within it.
  if (a.minutes !== b.minutes) {
    return b.minutes - a.minutes;
  }

  // 3. Prefer the person's favourites only after coverage and duration agree.
  if (a.preference !== b.preference) {
    return b.preference - a.preference;
  }

  // 4. Compare ordered IDs one by one so an appended suffix cannot reverse a prefix tie.
  for (let index = 0; index < Math.min(a.cards.length, b.cards.length); index += 1) {
    const order = a.cards[index]!.id.localeCompare(b.cards[index]!.id);
    if (order !== 0) return order;
  }
  return a.cards.length - b.cards.length;
}

/**
 * Return the best session for the request, or why there is none.
 *
 * "No plan" is a real answer: with no time, or nothing that fits, rest is a valid choice.
 */
export function bestPlan(request: PlanRequest, catalogue: readonly MovementCard[], repeatRounds = false): PlanResult {
  // Ignore an invalid target because unsafe numbers would make block counts inaccurate.
  if (!validTarget(request.minutes)) {
    return { status: 'none', reason: 'Enter a valid non-negative whole-minute target.', excluded: [] };
  }

  // Search only eligible choices and retain every hard-filter exclusion for explanation.
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
  // Repeat only the selected, filtered round; preserve all reviewed block lengths.
  const schedule = repeatRounds ? fillRepeatedRound(plan.cards, request.minutes) : undefined;
  return { status: 'plan', plan, ...(schedule === undefined ? {} : { schedule }),
    unfilledMinutes: schedule?.unfilledMinutes ?? request.minutes - plan.minutes, considered: candidates.length, excluded };
}
