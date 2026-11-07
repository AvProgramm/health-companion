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
  ['an hour with all reviewed blocks available', { ...OPEN, minutes: 60 }],
  ['every bodyweight card ruled out, no equipment', { ...OPEN, minutes: 30, equipment: [], neverSuggest: ['push_up', 'plank', 'jump_squat'] }],
  ['a card excluded after seeing it in a preview', { ...OPEN, minutes: 16, neverSuggest: ['db_row'] }],
];

/**
 * Return every feasible session by brute force: the independent reference.
 *
 * Written separately from eligibility.ts and planner.ts on purpose, like the
 * oracle in the FIT3080 tests: it tries every subset and re-checks every rule.
 */
function oracle(request: PlanRequest, catalogue: readonly MovementCard[]): Candidate[] {
  const cards = [...catalogue].sort((a, b) => a.id.localeCompare(b.id));
  const sessions: Candidate[] = [];
  for (let mask = 1; mask < 1 << cards.length; mask += 1) {
    const chosen = cards.filter((_card, index) => (mask & (1 << index)) !== 0);
    const minutes = chosen.reduce((total, card) => total + card.minutes, 0);
    const allowed = chosen.every((card) =>
      !request.neverSuggest.includes(card.id)
      && card.requires.every((capability) => !request.unableTo.includes(capability))
      && card.equipment.every((item) => request.equipment.includes(item))
      && request.categories.includes(card.category));
    if (chosen.length <= 12 && minutes <= request.minutes && allowed) {
      sessions.push({ cards: chosen, minutes,
        covered: request.categories.filter(category => chosen.some(card => card.category === category)).length,
        preference: chosen.reduce((total, card) => total + (request.preferences[card.id] ?? 0), 0),
        ids: chosen.map(card => card.id).join(',') });
    }
  }
  return sessions.sort((left, right) => right.covered - left.covered || right.minutes - left.minutes || right.preference - left.preference || left.ids.localeCompare(right.ids));
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

  // Seen on 8 Nov: asking for push and pull returned jump squats and a plank
  it('leaves out an area the person did not choose today, after equipment and before time', () => {
    const plank = MOVEMENT_CARDS.find((card) => card.id === 'plank')!;
    const row = MOVEMENT_CARDS.find((card) => card.id === 'db_row')!;
    expect(ineligibleReason(plank, { ...OPEN, categories: ['push', 'pull'] })).toBe('it trains core, which you did not choose today');
    expect(ineligibleReason(row, { ...OPEN, categories: ['push'], equipment: [] })).toBe('it needs dumbbells');
    expect(ineligibleReason(row, { ...OPEN, categories: ['push'], minutes: 1 })).toBe('it trains pull, which you did not choose today');
  });
});

describe('feasibleCandidates', () => {
  it.each(SCENARIOS)('keeps the optimal session from the independent oracle: %s', (_name, request) => {
    const result = bestPlan(request, MOVEMENT_CARDS);
    expect(result.status === 'plan' ? result.plan.ids : undefined).toEqual(oracle(request, MOVEMENT_CARDS)[0]?.ids);
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

  it('breaks a coverage tie on the session closest to the time target', () => {
    const short = summarise([KIT_CARDS[1]!], { ...KIT_REQUEST, preferences: {} });
    const long = summarise([KIT_CARDS[0]!], { ...KIT_REQUEST, preferences: {} });
    expect(compareCandidates(long, short)).toBeLessThan(0);
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


describe('target-duration planning', () => {
  // Keep the sixty-minute regression fictional; every block has an explicitly reviewed duration.
  const cards: MovementCard[] = Array.from({ length: 12 }, (_, index) => ({
    id: `fictional-${String(index).padStart(2, '0')}`, name: `Fictional movement ${index}`, minutes: 5,
    category: (['push', 'pull', 'legs', 'core'] as const)[index % 4]!, equipment: [], requires: [], cue: 'Fictional instructions.',
  }));

  it('fills a 60-minute target with twelve distinct five-minute choices', () => {
    expect(MAX_CARDS).toBe(12);
    const result = bestPlan({ ...OPEN, minutes: 60, equipment: [] }, cards);
    expect(result).toMatchObject({ status: 'plan', unfilledMinutes: 0, plan: { minutes: 60, covered: 4 } });
    if (result.status !== 'plan') throw new Error('Expected a plan.');
    expect(result.plan.cards).toHaveLength(12);
    expect(new Set(result.plan.cards.map(card => card.id)).size).toBe(12);
  });

  it('reports the screenshot case honestly when only fifteen minutes of bodyweight blocks exist', () => {
    // Reported on 7 Nov: 60 requested, jump squat + plank + push-up total only 15.
    expect(bestPlan({ ...OPEN, minutes: 60, equipment: [] }, MOVEMENT_CARDS)).toMatchObject({
      status: 'plan', unfilledMinutes: 45, plan: { minutes: 15 },
    });
  });

  it('prefers a longer fitting session over a shorter favourite with the same coverage', () => {
    const short = { ...summarise([cards[0]!], OPEN), preference: 100 };
    const long = summarise([cards[0]!, cards[4]!], OPEN);
    expect(compareCandidates(long, short)).toBeLessThan(0);
  });

  it('uses preference after coverage and duration, with IDs compared one by one', () => {
    const first = { ...cards[0]!, id: 'a' };
    const second = { ...cards[0]!, id: 'aa' };
    const last = { ...cards[0]!, id: 'z' };
    expect(compareCandidates(summarise([first, last], OPEN), summarise([second, last], OPEN))).toBeLessThan(0);
    expect(compareCandidates({ ...summarise([second], OPEN), preference: 2 }, summarise([first], OPEN))).toBeLessThan(0);
  });

  it('finds a near target without stretching or repeating any block', () => {
    const uneven = [17, 19, 23, 25].map((minutes, index) => ({ ...cards[0]!, id: `uneven-${index}`, minutes }));
    expect(bestPlan({ ...OPEN, minutes: 60, categories: ['push'] }, uneven)).toMatchObject({
      status: 'plan', unfilledMinutes: 1, plan: { minutes: 59 },
    });
  });

  it('keeps larger-pool search states bounded and produces a deterministic feasible result', () => {
    const pool = Array.from({ length: 32 }, (_, index) => ({ ...cards[index % 12]!, id: `pool-${String(index).padStart(2, '0')}` }));
    const request = { ...OPEN, minutes: 60, equipment: [] };
    const states = feasibleCandidates(request, pool);
    expect(states.length).toBeLessThanOrEqual(61 * 16 * 13);
    expect(bestPlan(request, pool)).toMatchObject({ status: 'plan', unfilledMinutes: 0, plan: { minutes: 60 } });
    expect(bestPlan(request, [...pool].reverse())).toEqual(bestPlan(request, pool));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 60.5, Number.MAX_SAFE_INTEGER + 1])('refuses an invalid or unbounded target: %s', minutes => {
    expect(bestPlan({ ...OPEN, minutes }, cards)).toMatchObject({ status: 'none', reason: 'Enter a valid non-negative whole-minute target.' });
  });
});


it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])('matches exhaustive search with mixed durations, preferences and hard filters: case %i', seed => {
  // Enumerate all 1,023 nonempty subsets independently of the production state table.
  const cards: MovementCard[] = Array.from({ length: 10 }, (_, index) => ({
    id: `oracle-${String(index).padStart(2, '0')}`, name: 'Fictional oracle movement', minutes: [3, 5, 7, 11, 13][index % 5]!,
    category: (['push', 'pull', 'legs', 'core'] as const)[(index + seed) % 4]!,
    equipment: index % 3 === 0 ? ['band'] : [], requires: index % 4 === 0 ? ['jumping'] : [], cue: 'Fictional cue.',
  }));
  const request: PlanRequest = { ...OPEN, minutes: 12 + seed * 4, equipment: seed % 2 === 0 ? ['band'] : [],
    unableTo: seed % 3 === 0 ? ['jumping'] : [], neverSuggest: seed % 4 === 0 ? ['oracle-01'] : [],
    categories: seed % 2 === 0 ? ['push', 'pull', 'legs', 'core'] : ['core', 'pull'],
    preferences: Object.fromEntries(cards.map((card, index) => [card.id, ((index + seed) % 7) - 3])),
  };
  const result = bestPlan(request, cards);
  expect(result.status === 'plan' ? result.plan : undefined).toEqual(oracle(request, cards)[0]);
});

it('keeps the twelve-card bound even when another block would fill a longer target', () => {
  const cards: MovementCard[] = Array.from({ length: 13 }, (_, index) => ({ id: `limit-${index}`, name: 'Fictional block', minutes: 5,
    category: 'core', equipment: [], requires: [], cue: 'Fictional cue.' }));
  expect(bestPlan({ ...OPEN, minutes: 65, categories: ['core'] }, cards)).toMatchObject({ status: 'plan', unfilledMinutes: 5, plan: { minutes: 60 } });
});


it.each([7, 25, 60, 90, 241, 1000, 1_000_000_000])('accepts a whole-minute target without the artificial duration cap: %i', minutes => {
  expect(bestPlan({ ...OPEN, minutes, equipment: [] }, MOVEMENT_CARDS).status).toBe('plan');
});


it('repeats only selected, eligible blocks while preserving equipment exclusions', () => {
  const result = bestPlan({ ...OPEN, minutes: 60, equipment: [], unableTo: ['jumping'] }, MOVEMENT_CARDS, true);
  expect(result.status).toBe('plan');
  if (result.status !== 'plan') throw new Error('Expected a repeated plan.');
  expect(result.schedule?.minutes).toBe(60);
  expect(result.schedule?.blocks.map(block => block.card.id)).toEqual(['plank', 'push_up']);
  expect(result.excluded.some(entry => entry.card.id === 'jump_squat')).toBe(true);
});

describe('allocation across every whole-minute target (checked 8 Nov)', () => {
  // The app's real setups: the default form (no kit, push and pull), every area, dumbbells, and all kit
  const SETUPS: [string, PlanRequest][] = [
    ['no kit, push and pull', { ...OPEN, equipment: [], categories: ['push', 'pull'] }],
    ['no kit, every area', { ...OPEN, equipment: [] }],
    ['dumbbells, push and pull', { ...OPEN, equipment: ['dumbbells'], categories: ['push', 'pull'] }],
    ['all kit, every area', OPEN],
  ];
  // Every target up to two and a half hours, minute by minute
  const TARGETS = Array.from({ length: 151 }, (_, minutes) => minutes);

  /**
   * Return the largest total reachable with at least one full round, found by direct reachability.
   *
   * Independent of rounds.ts: no remainders and no shortest paths, just which totals can be made.
   */
  function fillOracle(durations: readonly number[], target: number): number {
    const round = durations.reduce((sum, minutes) => sum + minutes, 0);
    const reachable = Array<boolean>(target + 1).fill(false);
    reachable[0] = true;
    for (let total = 1; total <= target; total += 1) {
      reachable[total] = durations.some(minutes => total >= minutes && reachable[total - minutes]);
    }
    let extra = target - round;
    while (!reachable[extra]) extra -= 1;
    return round + extra;
  }

  it.each(SETUPS)('plans exactly what the oracle finds, once each, for every target: %s', (_name, setup) => {
    for (const minutes of TARGETS) {
      const request = { ...setup, minutes };
      const result = bestPlan(request, MOVEMENT_CARDS);
      const expected = oracle(request, MOVEMENT_CARDS)[0];
      expect(result.status === 'plan' ? result.plan : undefined, `${minutes} min`).toEqual(expected);
      if (result.status === 'plan') {
        // Only the chosen areas and the equipment available, never over the target
        expect(result.plan.cards.every(card => setup.categories.includes(card.category) && card.equipment.every(item => setup.equipment.includes(item)))).toBe(true);
        expect(result.unfilledMinutes).toBe(minutes - result.plan.minutes);
      }
    }
  });

  it.each(SETUPS)('fills the target as far as whole blocks can, never shrinking as time grows: %s', (_name, setup) => {
    let previous = 0;
    for (const minutes of TARGETS) {
      const result = bestPlan({ ...setup, minutes }, MOVEMENT_CARDS, true);
      if (result.status !== 'plan') continue;
      const schedule = result.schedule!;
      expect(schedule.minutes, `${minutes} min`).toBe(fillOracle(result.plan.cards.map(card => card.minutes), minutes));
      expect(schedule.blocks.every(block => block.repeatCount >= 1)).toBe(true);
      expect(schedule.blocks.reduce((sum, block) => sum + block.minutes, 0)).toBe(schedule.minutes);
      expect(result.unfilledMinutes).toBe(minutes - schedule.minutes);
      expect(schedule.minutes, `${minutes} min`).toBeGreaterThanOrEqual(previous);
      previous = schedule.minutes;
    }
  });

  // Worked by hand: what a person sees for a few common targets
  it('returns these sessions for common targets', () => {
    const counts = (setup: PlanRequest, minutes: number) => {
      const result = bestPlan({ ...setup, minutes }, MOVEMENT_CARDS, true);
      return result.status === 'plan' ? result.schedule!.blocks.map(block => `${block.card.id}×${block.repeatCount}`) : result.reason;
    };
    const [noKit, , dumbbells, allKit] = SETUPS.map(([, setup]) => setup);
    // Push-ups are the only bodyweight push or pull card, and take six minutes
    expect(counts(noKit!, 5)).toBe('No exercise fits today: every card was left out for a reason below.');
    expect(counts(noKit!, 60)).toEqual(['push_up×10']);
    // 22-minute round twice, plus one more floor press and row: 3 + 3 + 2 blocks
    expect(counts(dumbbells!, 60)).toEqual(['db_floor_press×3', 'db_row×3', 'push_up×2']);
    // All eight cards (52 min) once, then the 38 minutes left spread with no card twice
    const ninety = bestPlan({ ...allKit!, minutes: 90 }, MOVEMENT_CARDS, true);
    const repeats = ninety.status === 'plan' ? ninety.schedule!.blocks.map(block => block.repeatCount) : [];
    expect(ninety.status === 'plan' && ninety.schedule!.minutes).toBe(90);
    expect(Math.max(...repeats) - Math.min(...repeats)).toBeLessThanOrEqual(1);
  });
});
