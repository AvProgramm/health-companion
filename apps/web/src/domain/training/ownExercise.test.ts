import { describe, expect, it } from 'vitest';
import { assertCustomCard, ownExerciseCard, type CustomCardSelection, type OwnExerciseDraft } from './customCards';
import { ineligibleReason, type PlanRequest } from './eligibility';

// A complete fictional draft, changing only what a test cares about
const DRAFT: OwnExerciseDraft = { name: 'Fictional sled drag', category: 'legs', equipment: [], minutes: 6, cue: 'Fictional cue.', requires: [], seated: false, loads: [] };
// A request with nothing restricted, to change one rule at a time
const REQUEST: PlanRequest = { minutes: 30, equipment: [], unableTo: [], neverSuggest: [], categories: ['legs'], preferences: {} };

/** Return one saved snapshot of a card built from the fictional draft. */
function saved(source: CustomCardSelection['source'], id = 'draft-1'): CustomCardSelection {
  const card = ownExerciseCard(DRAFT, id);
  return { id: card.id, card, source, version: 1, deleted: false, operationKey: 'own-1', savedAt: '2026-11-09T10:00:00Z' };
}

describe('an exercise the person describes', () => {
  it('becomes a planner card under its own kind of ID, with the name tidied', () => {
    const card = ownExerciseCard({ ...DRAFT, name: '  Fictional sled drag ' }, 'draft-1');
    expect(card).toMatchObject({ id: 'own:draft-1', name: 'Fictional sled drag', category: 'legs', minutes: 6, equipment: [], requires: [] });
  });

  it('says so plainly when no instructions were written', () => {
    expect(ownExerciseCard({ ...DRAFT, cue: '   ' }, 'draft-1').cue).toBe('Added by you. No instructions were written.');
  });

  it.each(['', '   ', 'x'.repeat(81)])('refuses an unusable name: %j', (name) => {
    expect(() => ownExerciseCard({ ...DRAFT, name }, 'draft-1')).toThrow(/Enter the exercise name/);
  });

  it.each([0, 61, 2.5, Number.NaN])('refuses a planning block of %d minutes', (minutes) => {
    expect(() => ownExerciseCard({ ...DRAFT, minutes }, 'draft-1')).toThrow(/1 to 60 whole minutes/);
  });

  it('leaves unticked facts unknown rather than empty', () => {
    const card = ownExerciseCard(DRAFT, 'draft-1');
    expect(card.positions).toBeNull();
    expect(card.loads).toBeNull();
  });
});

describe('adaptations and own exercises', () => {
  it('passes a plan with no restrictions', () => {
    expect(ineligibleReason(ownExerciseCard(DRAFT, 'draft-1'), REQUEST)).toBeNull();
  });

  it('leaves out an exercise with unknown facts when a restriction needs them', () => {
    const card = ownExerciseCard(DRAFT, 'draft-1');
    expect(ineligibleReason(card, { ...REQUEST, seatedOnly: true })).toBe('its required positions are unknown');
    expect(ineligibleReason(card, { ...REQUEST, avoidAreas: ['knees'] })).toBe('its loaded areas are unknown');
  });

  it('includes an exercise whose stated facts satisfy the restriction', () => {
    const card = ownExerciseCard({ ...DRAFT, seated: true, loads: ['shoulders'] }, 'draft-1');
    expect(ineligibleReason(card, { ...REQUEST, seatedOnly: true, avoidAreas: ['knees'] })).toBeNull();
  });

  it('excludes an exercise that loads an avoided area', () => {
    const card = ownExerciseCard({ ...DRAFT, loads: ['knees'] }, 'draft-1');
    expect(ineligibleReason(card, { ...REQUEST, avoidAreas: ['knees'] })).toBe('it loads your knees');
  });

  it('respects a need the person ticked', () => {
    const card = ownExerciseCard({ ...DRAFT, requires: ['jumping'] }, 'draft-1');
    expect(ineligibleReason(card, { ...REQUEST, unableTo: ['jumping'] })).toBe('it needs jumping');
  });
});

describe('saved snapshots', () => {
  it('accepts an own exercise marked as the person\'s', () => {
    expect(() => assertCustomCard(saved({ dataset: 'own' }))).not.toThrow();
  });

  it('refuses an own exercise that claims to come from the library', () => {
    expect(() => assertCustomCard(saved({ dataset: 'free-exercise-db', revision: 'a'.repeat(40) }))).toThrow(/source details/);
  });

  it('refuses a library exercise that claims to be the person\'s', () => {
    const entry = saved({ dataset: 'own' });
    const card = { ...entry.card, id: 'free-exercise-db:fictional' };
    expect(() => assertCustomCard({ ...entry, id: card.id, card })).toThrow(/source details/);
  });
});
