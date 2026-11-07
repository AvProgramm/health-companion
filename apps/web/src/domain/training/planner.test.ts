import { describe, expect, it } from 'vitest';
import { MOVEMENT_CARDS, type MovementCard } from './catalogue';
import { ineligibleReason, splitCards, type PlanRequest } from './eligibility';
import { MAX_CARDS, bestPlan, compareCandidates, feasibleCandidates, summarise, type Candidate } from './planner';

// A request with everything allowed, to change one field at a time
const OPEN: PlanRequest = {
  minutes: 30,
  equipment: ['dumbbells', 'band', 'pull_up_bar'],
  unableTo: [],
  neverSuggest: [],
  categories: ['push', 'pull', 'legs', 'core'],
  preferences: {},
};

// The twelve fixed scenarios from the build kit (doc 04), against the real catalogue
const SCENARIOS: [string, PlanRequest][] = [
  ['no time at all', { ...OPEN, minutes: 0 }],
  ['no equipment, 12 min', { ...OPEN, minutes: 12, equipment: [] }],
  ['dumbbells, 12 min, no pull-ups (the kit demo)', { ...OPEN, minutes: 12, equipment: ['dumbbells'], unableTo: ['pull_up'] }],
  ['everything, 30 min', OPEN],
  ['impossible goal: pull with no equipment and no pull-ups', { ...OPEN, minutes: 10, equipment: [], unableTo: ['pull_up'], categories: ['pull'] }],
  ['never suggest push-ups', { ...OPEN, minutes: 12, neverSuggest: ['push_up'] }],
  ['only 4 min', { ...OPEN, minutes: 4 }],
  ['band only, 10 min', { ...OPEN, minutes: 10, equipment: ['band'] }],
  ['no jumping, no pull-ups, 20 min', { ...OPEN, minutes: 20, unableTo: ['jumping', 'pull_up'] }],
  ['an hour, so the three-card limit decides', { ...OPEN, minutes: 60 }],
  ['every bodyweight card ruled out, no equipment', { ...OPEN, minutes: 30, equipment: [], neverSuggest: ['push_up', 'plank', 'jump_squat'] }],
  ['a card excluded after seeing it in a preview', { ...OPEN, minutes: 16, neverSuggest: ['db_row'] }],
];

/**
 * Return every feasible session by brute force: the independent reference.
 *
 * Written separately from eligibility.ts and planner.ts on purpose, like the
 * oracle in the FIT3080 tests: it tries every subset and re-checks every rule.
 */
function oracle(request: PlanRequest, catalogue: readonly MovementCard[]): string[] {
  const cards = [...catalogue].sort((a, b) => a.id.localeCompare(b.id));
  const sessions: string[] = [];
  for (let mask = 1; mask < 1 << cards.length; mask += 1) {
    const chosen = cards.filter((_card, index) => (mask & (1 << index)) !== 0);
    const minutes = chosen.reduce((total, card) => total + card.minutes, 0);
    const allowed = chosen.every((card) =>
      !request.neverSuggest.includes(card.id)
      && card.requires.every((capability) => !request.unableTo.includes(capability))
      && card.equipment.every((item) => request.equipment.includes(item)));
    if (chosen.length <= MAX_CARDS && minutes <= request.minutes && allowed) {
      sessions.push(chosen.map((card) => card.id).join(','));
    }
  }
  return sessions.sort();
}

/**
 * Return the greedy first-fit baseline from the kit: favourite cards first, take while they fit.
 */
function greedyPlan(request: PlanRequest, catalogue: readonly MovementCard[]): Candidate {
  const byPreference = [...splitCards(request, catalogue).eligible]
    .sort((a, b) => (request.preferences[b.id] ?? 0) - (request.preferences[a.id] ?? 0) || a.id.localeCompare(b.id));
  const chosen: MovementCard[] = [];
  let minutesLeft = request.minutes;
  for (const card of byPreference) {
    if (card.minutes <= minutesLeft && chosen.length < MAX_CARDS) {
      chosen.push(card);
      minutesLeft -= card.minutes;
    }
  }
  return summarise(chosen, request);
}

// The kit's worked counterexample: 12 min, A = 10 min push (pref 3), B = 6 min push (pref 2), C = 6 min pull (pref 2)
const KIT_CARDS: readonly MovementCard[] = [
  { id: 'A', name: 'A', category: 'push', minutes: 10, equipment: [], requires: [], cue: '' },
  { id: 'B', name: 'B', category: 'push', minutes: 6, equipment: [], requires: [], cue: '' },
  { id: 'C', name: 'C', category: 'pull', minutes: 6, equipment: [], requires: [], cue: '' },
];
const KIT_REQUEST: PlanRequest = { ...OPEN, minutes: 12, equipment: [], categories: ['push', 'pull'], preferences: { A: 3, B: 2, C: 2 } };

describe('ineligibleReason', () => {
  it('gives the reason a card is left out, firmest rule first', () => {
    const pullUp = MOVEMENT_CARDS.find((card) => card.id === 'pull_up')!;
    const row = MOVEMENT_CARDS.find((card) => card.id === 'db_row')!;
    expect(ineligibleReason(pullUp, { ...OPEN, unableTo: ['pull_up'] })).toBe('it needs a pull-up');
    expect(ineligibleReason(row, { ...OPEN, equipment: [] })).toBe('it needs dumbbells');
    expect(ineligibleReason(row, { ...OPEN, minutes: 5 })).toBe('it takes 8 min and you have 5');
    expect(ineligibleReason(row, { ...OPEN, neverSuggest: ['db_row'], equipment: [] })).toBe('you asked never to suggest it');
    expect(ineligibleReason(row, OPEN)).toBeNull();
  });
});

describe('feasibleCandidates', () => {
  it.each(SCENARIOS)('finds exactly the oracle sessions: %s', (_name, request) => {
    const found = feasibleCandidates(request, MOVEMENT_CARDS).map((candidate) => candidate.ids).sort();
    expect(found).toEqual(oracle(request, MOVEMENT_CARDS));
  });

  it('never breaks a hard rule in any scenario (target: zero violations)', () => {
    let violations = 0;
    for (const [, request] of SCENARIOS) {
      for (const candidate of feasibleCandidates(request, MOVEMENT_CARDS)) {
        const brokenRule = candidate.cards.length > MAX_CARDS
          || candidate.minutes > request.minutes
          || candidate.cards.some((card) => ineligibleReason(card, request) !== null);
        violations += brokenRule ? 1 : 0;
      }
    }
    expect(violations).toBe(0);
  });

  it('shows why greedy first-fit is not enough (the kit counterexample)', () => {
    // Greedy takes the favourite, A (10 min), and then nothing else fits: push only
    const greedy = greedyPlan(KIT_REQUEST, KIT_CARDS);
    expect(greedy.ids).toBe('A');
    expect(greedy.covered).toBe(1);
    // The search finds a session covering both push and pull: B + C
    const bestCoverage = Math.max(...feasibleCandidates(KIT_REQUEST, KIT_CARDS).map((candidate) => candidate.covered));
    expect(bestCoverage).toBe(2);
  });
});

describe('bestPlan without a ranking', () => {
  it('answers "no plan" when there is no time, and says rest is valid', () => {
    const result = bestPlan({ ...OPEN, minutes: 0 }, MOVEMENT_CARDS);
    expect(result.status).toBe('none');
    expect(result.status === 'none' && result.reason).toMatch(/Rest is a valid choice/);
  });

  it('answers "no plan" when every card is ruled out, keeping each reason', () => {
    const result = bestPlan(SCENARIOS[10]![1], MOVEMENT_CARDS);
    expect(result.status).toBe('none');
    expect(result.excluded).toHaveLength(MOVEMENT_CARDS.length);
  });
});

describe('compareCandidates', () => {
  // Build a candidate from the kit cards
  const pick = (...ids: string[]) => summarise(KIT_CARDS.filter((card) => ids.includes(card.id)), KIT_REQUEST);

  it('ranks more requested categories first, even over a favourite', () => {
    expect(compareCandidates(pick('B', 'C'), pick('A'))).toBeLessThan(0);
  });

  it('breaks a coverage tie on the higher preference total', () => {
    expect(compareCandidates(pick('A'), pick('B'))).toBeLessThan(0);
  });

  it('breaks a preference tie on the shorter session', () => {
    const short = summarise([KIT_CARDS[1]!], { ...KIT_REQUEST, preferences: {} });
    const long = summarise([KIT_CARDS[0]!], { ...KIT_REQUEST, preferences: {} });
    expect(compareCandidates(short, long)).toBeLessThan(0);
  });

  it('breaks every other tie on the ids, so the result never depends on luck', () => {
    const b = summarise([KIT_CARDS[1]!], { ...KIT_REQUEST, preferences: {} });
    const c = summarise([KIT_CARDS[2]!], { ...KIT_REQUEST, categories: ['push', 'pull'], preferences: {} });
    // Same coverage (1), preference (0) and minutes (6): "B" comes before "C"
    expect(compareCandidates(b, c)).toBeLessThan(0);
    expect(compareCandidates(c, b)).toBeGreaterThan(0);
  });
});

describe('bestPlan with compareCandidates', () => {
  it('picks B + C over the favourite A in the kit counterexample', () => {
    const result = bestPlan(KIT_REQUEST, KIT_CARDS);
    expect(result.status === 'plan' && result.plan.ids).toBe('B,C');
  });

  it('plans the kit demo: 12 min, dumbbells, no pull-ups', () => {
    const result = bestPlan(SCENARIOS[2]![1], MOVEMENT_CARDS);
    expect(result.status).toBe('plan');
    expect(result.status === 'plan' && result.plan.cards.some((card) => card.id === 'pull_up')).toBe(false);
  });
});
