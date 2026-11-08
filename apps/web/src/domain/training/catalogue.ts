import reviewed from '../../../../../data/exercises/adaptations.json';
import type { BodyArea, Position } from '../profile/profile';

/**
 * The small, reviewed set of exercises the planner may suggest.
 *
 * Kept deliberately tiny (at most eight cards): every card is checked by hand,
 * and a plan can only ever be made of cards from this list, never invented.
 * These are general exercises, not advice for an injury or a medical condition.
 */

export type Category = 'push' | 'pull' | 'legs' | 'core';
// Home kit first, then the gym equipment the exercise library names
export type Equipment = 'dumbbells' | 'band' | 'pull_up_bar' | 'kettlebells' | 'barbell' | 'ez_curl_bar' | 'cable' | 'machine'
  | 'medicine_ball' | 'exercise_ball' | 'foam_roll';
export type Capability = 'pull_up' | 'jumping';

/**
 * One exercise as a block of a session.
 */
export interface MovementCard {
  id: string;
  name: string;
  category: Category;
  minutes: number;
  // Everything listed is needed; an empty list means bodyweight only
  equipment: readonly Equipment[];
  // Abilities the exercise needs; someone who cannot do one never gets the card
  requires: readonly Capability[];
  cue: string;
  // Missing facts remain unknown in old snapshots and cannot pass a relevant adaptation filter.
  loads?: readonly BodyArea[] | null;
  positions?: readonly Position[] | null;
  primaryMuscles?: readonly string[];
  imagePath?: string | null;
}

const STARTER_CARDS: readonly MovementCard[] = [
  { id: 'band_pull_apart', name: 'Band pull-apart', category: 'pull', minutes: 5, equipment: ['band'], requires: [], cue: '3 × 15, squeeze the shoulder blades together.' },
  { id: 'db_floor_press', name: 'Dumbbell floor press', category: 'push', minutes: 8, equipment: ['dumbbells'], requires: [], cue: '3 × 10, elbows about 45° from the body.' },
  { id: 'db_row', name: 'One-arm dumbbell row', category: 'pull', minutes: 8, equipment: ['dumbbells'], requires: [], cue: '3 × 10 each side, pull the elbow towards the hip.' },
  { id: 'goblet_squat', name: 'Goblet squat', category: 'legs', minutes: 8, equipment: ['dumbbells'], requires: [], cue: '3 × 10, hold the dumbbell at the chest.' },
  { id: 'jump_squat', name: 'Jump squat', category: 'legs', minutes: 5, equipment: [], requires: ['jumping'], cue: '3 × 8, land softly.' },
  { id: 'plank', name: 'Plank', category: 'core', minutes: 4, equipment: [], requires: [], cue: '3 × 30 s, keep the hips level.' },
  { id: 'pull_up', name: 'Pull-up', category: 'pull', minutes: 8, equipment: ['pull_up_bar'], requires: ['pull_up'], cue: '3 × as many as you can with good form.' },
  { id: 'push_up', name: 'Push-up', category: 'push', minutes: 6, equipment: [], requires: [], cue: '3 × 10, knees down if needed.' },
];


// Use reviewed tags for starter movements; never manufacture empty facts for an unlisted card.
const STARTER_ADAPTATIONS = reviewed.starters as unknown as Record<string, Pick<MovementCard, 'loads' | 'positions'>>;
// Keep the reviewed source facts beside each starter card, without changing older saved choices.
export const MOVEMENT_CARDS: readonly MovementCard[] = STARTER_CARDS.map(card => ({ ...card, ...STARTER_ADAPTATIONS[card.id] }));
