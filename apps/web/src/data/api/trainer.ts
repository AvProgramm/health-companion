import type { Category, Equipment } from '../../domain/training/catalogue';
import type { ExerciseLevel } from '../../domain/training/exerciseSearch';
import { readTrainerReply, type TrainerReply } from '../../domain/training/trainerPlan';
import { postJson, type ServiceMessages } from './post';

// Three bounded model steps, plus the proxy hop
const TRAINER_TIMEOUT_MS = 35000;

// What still works when the Trainer can't be reached
const FALLBACK = 'Plan a session and the ready-made days still work without it.';

// What each kind of failure means for someone waiting on the Trainer
const MESSAGES: ServiceMessages = {
  slow: `The Trainer took too long to answer. Try again. ${FALLBACK}`,
  unreachable: `Could not reach the laptop. ${FALLBACK}`,
  notRunning: `The laptop is reachable, but its coach service is not running (see services/coach/README.md). ${FALLBACK}`,
  busy: `The Trainer has no answer right now. Try again shortly. ${FALLBACK}`,
  failed: (status) => `The Trainer returned an error (HTTP ${status}). ${FALLBACK}`,
};

/** What the person typed or picked on the Trainer card, and nothing else. */
export interface TrainerInput {
  goal: string;
  minutes: number;
  equipment: readonly Equipment[];
  areas: readonly Category[];
  level: ExerciseLevel;
}

/** Request a ranked proposal, naming each field so nothing extra can be sent. */
export async function requestTrainerPlan(input: TrainerInput): Promise<TrainerReply> {
  const { goal, minutes, equipment, areas, level } = input;
  return readTrainerReply(await postJson('/api/trainer', { goal, minutes, equipment, areas, level }, TRAINER_TIMEOUT_MS, MESSAGES));
}
