import { describe, expect, it } from 'vitest';
import type { Category } from './catalogue';
import type { ExerciseEntry } from './exerciseSearch';
import { planFromProposal, proposalCards, readTrainerReply, type TrainerReply } from './trainerPlan';

// Four areas in turn, so a pool of fictional exercises covers all of them
const AREAS: Category[] = ['push', 'pull', 'legs', 'core'];

/** Return a fictional library entry with a numbered ID. */
function entry(number: number, changes: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return { id: `free-exercise-db:fictional_${number}`, name: `Fictional ${number}`, category: AREAS[number % 4]!, equipment: [], untracked: null, requires: [],
    minutes: 5, cue: 'Fictional cue.', primaryMuscles: ['quadriceps'], imagePath: null, sourceEquipment: 'body only', level: 'beginner', ...changes };
}

// A request with everything allowed, to change one field at a time
const REQUEST = { minutes: 120, equipment: [], unableTo: [], neverSuggest: [], categories: AREAS };
const LIBRARY = Array.from({ length: 16 }, (_, number) => entry(number));

/** Return a reply proposing the numbered exercises. */
function reply(...numbers: number[]): TrainerReply {
  return { exerciseIds: numbers.map(number => `free-exercise-db:fictional_${number}`), reason: 'Fictional reason.', source: 'ai' };
}

describe('readTrainerReply', () => {
  it('accepts a well-formed reply', () => {
    expect(readTrainerReply(reply(1))).toEqual(reply(1));
  });

  it('keeps the name of the model that answered', () => {
    expect(readTrainerReply({ ...reply(1), answeredBy: 'Gemini' }).answeredBy).toBe('Gemini');
  });

  it.each([null, {}, { exerciseIds: 'x', reason: 'r', source: 'ai' }, { exerciseIds: [1], reason: 'r', source: 'ai' }, { exerciseIds: [], reason: 'r', source: 'other' }, { exerciseIds: [], reason: 'r', source: 'ai', answeredBy: 7 }])('rejects a malformed reply: %j', (value) => {
    expect(() => readTrainerReply(value)).toThrow(/could not read/);
  });
});

describe('proposalCards', () => {
  it('keeps the Trainer order, once each, and drops an invented ID', () => {
    const ids = [...reply(3, 1).exerciseIds, 'made-up', ...reply(3).exerciseIds];
    expect(proposalCards(ids, LIBRARY).map(card => card.id)).toEqual(reply(3, 1).exerciseIds);
  });

  it('drops an exercise whose kit is unknown', () => {
    const library = [entry(0), entry(1, { equipment: null, sourceEquipment: 'other' })];
    expect(proposalCards(reply(0, 1).exerciseIds, library).map(card => card.id)).toEqual(reply(0).exerciseIds);
  });
});

describe('planFromProposal', () => {
  // Reported on 8 Nov: 120 minutes gave jump squats, plank and push-ups, eight blocks each
  it('fills 120 minutes with a varied set instead of repeating three exercises', () => {
    const result = planFromProposal(reply(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11), LIBRARY, REQUEST);
    expect(result.status).toBe('plan');
    if (result.status !== 'plan') throw new Error('Expected a plan.');
    expect(result.schedule!.minutes).toBe(120);
    expect(result.schedule!.blocks).toHaveLength(12);
    expect(Math.max(...result.schedule!.blocks.map(block => block.repeatCount))).toBeLessThanOrEqual(2);
  });

  it('keeps the top-ranked exercises when time is short', () => {
    const result = planFromProposal(reply(4, 8, 12, 0), LIBRARY, { ...REQUEST, minutes: 10, categories: ['push'] });
    expect(result.status === 'plan' && result.plan.cards.map(card => card.id).sort()).toEqual(reply(4, 8).exerciseIds.sort());
  });

  it('cannot put a banned exercise in the plan, however the Trainer ranks it', () => {
    const library = [entry(0, { requires: ['jumping'] }), entry(1, { equipment: ['barbell'] }), entry(2)];
    const result = planFromProposal(reply(0, 1, 2), library, { ...REQUEST, unableTo: ['jumping'], minutes: 10 });
    expect(result.status === 'plan' && result.plan.cards.map(card => card.id)).toEqual(reply(2).exerciseIds);
  });

  it('answers honestly when nothing proposed can be used', () => {
    expect(planFromProposal(reply(99), LIBRARY, REQUEST).status).toBe('none');
  });
});


it('applies the local injury filter to a high-ranked model proposal', () => {
  const library = [entry(0, { loads: ['knees'], positions: ['standing'] }), entry(1, { loads: ['shoulders'], positions: ['seated'] })];
  const result = planFromProposal(reply(0, 1), library, { ...REQUEST, avoidAreas: ['knees'] });
  expect(result.status === 'plan' && result.plan.cards.map(card => card.id)).toEqual(reply(1).exerciseIds);
});

it('uses a local seated fallback without loosening profile rules, but never overrides a refusal', () => {
  const request = { ...REQUEST, seatedOnly: true };
  const result = planFromProposal(reply(0), LIBRARY, request);
  expect(result.status === 'plan' && result.plan.cards.every(card => card.positions?.every(position => position === 'seated'))).toBe(true);
  expect(planFromProposal({ source: 'refused', reason: 'Fictional refusal.', exerciseIds: [] }, LIBRARY, request).status).toBe('none');
});
