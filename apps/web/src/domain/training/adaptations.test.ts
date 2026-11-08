import { expect, it } from 'vitest';
import { BODY_AREAS, EMPTY_PROFILE } from '../profile/profile';
import { ineligibleReason, type PlanRequest } from './eligibility';
import { MOVEMENT_CARDS, type MovementCard } from './catalogue';
import { SEATED_CARDS } from './seated';
import { bestPlan } from './planner';

// Give the fictional card known facts so each hard rule can be isolated.
const card: MovementCard = { id: 'fictional', name: 'Fictional seated row', category: 'pull', minutes: 5, equipment: [], requires: [], cue: 'Fictional cue.', loads: ['shoulders', 'elbows'], positions: ['seated'] };
const request: PlanRequest = { minutes: 30, equipment: [], unableTo: [], neverSuggest: [], categories: ['push', 'pull', 'legs', 'core'], preferences: {} };

it('blocks avoided areas and unknown facts, without treating unrecorded tags as no load', () => {
  expect(ineligibleReason(card, { ...request, avoidAreas: ['shoulders'] })).toContain('shoulders');
  expect(ineligibleReason({ ...card, loads: null }, { ...request, avoidAreas: ['knees'] })).toContain('unknown');
  expect(ineligibleReason({ ...card, positions: undefined }, { ...request, seatedOnly: true })).toContain('unknown');
  expect(ineligibleReason({ ...card, positions: ['floor', 'seated'] }, { ...request, seatedOnly: true })).toContain('seated');
  expect(ineligibleReason(card, { ...request, seatedOnly: true, avoidAreas: ['knees'] })).toBeNull();
});

it('matches an independent exhaustive profile sweep without a hard-rule violation', () => {
  const cards = [card, { ...card, id: 'floor', positions: ['floor'] as const }, { ...card, id: 'unknown', loads: null, positions: null }];
  for (let mask = 0; mask < 2 ** BODY_AREAS.length; mask += 1) {
    const avoidAreas = BODY_AREAS.filter((_, index) => (mask & 2 ** index) !== 0);
    for (const seatedOnly of [false, true]) {
      for (const candidate of cards) {
        const expected = (avoidAreas.length === 0 || (candidate.loads != null && !candidate.loads.some(area => avoidAreas.includes(area))))
          && (!seatedOnly || (candidate.positions?.length === 1 && candidate.positions[0] === 'seated'));
        expect(ineligibleReason(candidate, { ...request, avoidAreas, seatedOnly }) === null).toBe(expected);
      }
    }
  }
});

it('provides a real seated plan and never substitutes a standing or unknown movement', () => {
  const result = bestPlan({ ...request, ...EMPTY_PROFILE, seatedOnly: true }, [...MOVEMENT_CARDS, ...SEATED_CARDS], true);
  expect(result.status).toBe('plan');
  if (result.status !== 'plan') throw new Error('Expected a seated plan.');
  expect(result.plan.cards.every(item => item.positions?.length === 1 && item.positions[0] === 'seated')).toBe(true);
});
