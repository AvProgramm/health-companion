import type { PlanResult } from './planner';
import type { WorkoutDraft } from './workouts';

/** A found session, as opposed to the reason there is none. */
export type PlannedSession = Extract<PlanResult, { status: 'plan' }>;

/**
 * Return one timed workout draft for each exercise in a planned session.
 *
 * A repeated round is logged as the exercise's total minutes, so the diary shows the
 * time spent on each movement and not one row per block. These are drafts: nothing
 * is saved until the person says they did the session.
 */
export function sessionDrafts(session: PlannedSession): WorkoutDraft[] {
  // Use the repeated schedule when there is one, because its minutes include every round
  const blocks = session.schedule?.blocks ?? session.plan.cards.map((card) => ({ card, minutes: card.minutes }));
  return blocks.map(({ card, minutes }) => ({
    movement: card.name,
    status: 'done',
    sets: [{ reps: null, load: null, loadUnit: null, perHand: false, minutes, distanceKm: null }],
  }));
}
