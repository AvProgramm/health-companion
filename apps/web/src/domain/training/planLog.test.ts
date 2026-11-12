import { describe, expect, it } from 'vitest';
import type { MovementCard } from './catalogue';
import { sessionDrafts, type PlannedSession } from './planLog';

// Fictional movements with different block lengths
const press: MovementCard = { id: 'fictional-press', name: 'Fictional press', category: 'push', equipment: [], requires: [], minutes: 5, cue: 'Fictional cue.' };
const row: MovementCard = { ...press, id: 'fictional-row', name: 'Fictional row', category: 'pull', minutes: 10 };
const session: PlannedSession = { status: 'plan', plan: { cards: [press, row], minutes: 15, covered: 2, preference: 0, ids: 'fictional-press,fictional-row' }, unfilledMinutes: 0, considered: 1, excluded: [] };

describe('sessionDrafts', () => {
  it('returns one timed draft for each planned exercise', () => {
    expect(sessionDrafts(session)).toEqual([
      { movement: 'Fictional press', status: 'done', sets: [{ reps: null, load: null, loadUnit: null, perHand: false, minutes: 5, distanceKm: null }] },
      { movement: 'Fictional row', status: 'done', sets: [{ reps: null, load: null, loadUnit: null, perHand: false, minutes: 10, distanceKm: null }] },
    ]);
  });

  it('logs the total minutes of a repeated round, not one block', () => {
    const schedule = { blocks: [{ card: press, repeatCount: 3, minutes: 15 }], minutes: 15, fullRounds: 3, extraBlocks: 0, unfilledMinutes: 0 } as NonNullable<PlannedSession['schedule']>;
    expect(sessionDrafts({ ...session, schedule }).map((draft) => draft.sets[0]!.minutes)).toEqual([15]);
  });
});
