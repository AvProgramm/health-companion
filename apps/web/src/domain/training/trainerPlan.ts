/**
 * Turn the AI Trainer's proposal into a checked session.
 *
 * The model only proposes library IDs. Everything that matters happens here on the
 * device: unknown IDs are dropped, and the same hard rules and planner used everywhere
 * else decide what actually goes in the session.
 */
import type { MovementCard } from './catalogue';
import type { PlanRequest } from './eligibility';
import { reviewExercise, type ExerciseEntry } from './exerciseSearch';
import { bestPlan, type PlanResult } from './planner';

/** A ranked proposal from the coach service, best first. */
export interface TrainerReply {
  exerciseIds: string[];
  reason: string;
  source: 'ai' | 'library' | 'refused';
}

/** Return a validated reply, rejecting anything the service should never send. */
export function readTrainerReply(value: unknown): TrainerReply {
  const reply = value as Partial<TrainerReply> | null;
  if (reply === null || typeof reply !== 'object' || !Array.isArray(reply.exerciseIds) || !reply.exerciseIds.every(id => typeof id === 'string')
      || typeof reply.reason !== 'string' || (reply.source !== 'ai' && reply.source !== 'library' && reply.source !== 'refused')) {
    throw new Error('The Trainer sent a reply this app could not read. Try again.');
  }
  return { exerciseIds: reply.exerciseIds, reason: reply.reason, source: reply.source };
}

/**
 * Return planner cards for the proposed IDs, in the Trainer's order.
 *
 * Only exercises in the bundled library with fully known facts can become cards.
 */
export function proposalCards(ids: readonly string[], entries: readonly ExerciseEntry[]): MovementCard[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const cards: MovementCard[] = [];

  for (const id of new Set(ids)) {
    const entry = byId.get(id);
    // Ignore an ID the library does not hold, because a model can invent one
    if (entry === undefined) continue;
    try {
      cards.push(reviewExercise(entry, entry.minutes));
    } catch {
      // Ignore an exercise with an unknown fact, because the rules could not check it
    }
  }
  return cards;
}

/**
 * Return a session built from the proposal, checked by the same rules as every other plan.
 *
 * The Trainer's ranking becomes the preference score, so a short session keeps its top
 * picks. Repeat rounds stay on, so a long session repeats a varied set of exercises.
 */
export function planFromProposal(reply: TrainerReply, entries: readonly ExerciseEntry[], request: Omit<PlanRequest, 'preferences'>): PlanResult {
  const cards = proposalCards(reply.exerciseIds, entries);
  const preferences = Object.fromEntries(cards.map((card, index) => [card.id, cards.length - index]));
  return bestPlan({ ...request, preferences }, cards, true);
}
