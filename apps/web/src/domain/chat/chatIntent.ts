import type { Difficulty, Setting } from '../training/packs';

/** Which helper a chat message is for, with what the Trainer needs read from the words. */
export type ChatIntent =
  | { kind: 'coach' }
  | { kind: 'nutritionist' }
  | { kind: 'trainer'; minutes: number; setting: Setting; difficulty: Difficulty };

// The session length assumed when the message names none, matching the Trainer card's default
const DEFAULT_MINUTES = 45;
// The longest session the service accepts
const MAX_MINUTES = 600;

// Asking for a session to do: a noun for one, or a verb with a thing to train
const TRAINER_WORDS = /\b(workouts?|work out|exercises?|routine|training (plan|session)|gym (plan|session|day)|session|stretch(es|ing)?|build (some |more )?muscle|train (my|at|for|today)|leg day|push day|pull day)\b/;
// Asking how or why, which is a question for the Coach even when it mentions exercise
const QUESTION_START = /^(how (much|many|often|long)|why|is|are|does|do|should|can|what (is|are|does))\b/;
// Asking what to eat
const NUTRITIONIST_WORDS = /\b(what (should|can|could|do) i (eat|have|cook|drink)|what to (eat|cook)|(meal|food|snack|breakfast|lunch|dinner|recipe) ideas?|ideas? for (a |my )?(meal|snack|breakfast|lunch|dinner)|(suggest|recommend|give me|i want|i need)\b.*\b(meals?|snacks?|breakfasts?|lunch(es)?|dinners?|foods?|recipes?|something to eat))\b/;

// A length of time written in the message: "30 min", "1.5 hours", "an hour"
const MINUTES = /\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|m)\b/;
const HOURS = /\b(\d+(?:\.\d+)?|an?|one|two)\s*(hours?|hrs?|h)\b/;
// Number words people use for hours
const HOUR_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2 };

// Words that say where the session happens; the first match wins, and no match means no equipment
const SETTING_WORDS: readonly [RegExp, Setting][] = [
  [/\b(no (equipment|kit|weights)|bodyweight|body weight|without (equipment|weights))\b/, 'bodyweight'],
  [/\b(gym|barbell|machines?|cables?)\b/, 'gym'],
  [/\b(dumbbells?|kettlebells?|bands?|pull[- ]up bar|home kit)\b/, 'home'],
];
// Words that say how hard; no match means medium
const DIFFICULTY_WORDS: readonly [RegExp, Difficulty][] = [
  [/\b(easy|gentle|light|beginner|new to)\b/, 'easy'],
  [/\b(hard|tough|intense|advanced|expert|challenging)\b/, 'hard'],
];

/** Return the session length a message asks for, within what the service accepts. */
function readMinutes(clean: string): number {
  const minutes = MINUTES.exec(clean);
  const hours = HOURS.exec(clean);
  const asked = minutes !== null ? Number(minutes[1]) : hours !== null ? (HOUR_WORDS[hours[1]!] ?? Number(hours[1])) * 60 : DEFAULT_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(1, Math.round(asked)));
}

/**
 * Return which helper should answer one chat message.
 *
 * The rules are plain keywords, because the sealed router test (experiments/router) found a
 * trained head did not beat them. Anything that is not clearly a session or a food idea goes
 * to the Coach, which can answer any general question.
 */
export function chatIntent(text: string): ChatIntent {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // A plan to do, unless the message is asking how or why
  if (TRAINER_WORDS.test(clean) && !QUESTION_START.test(clean)) {
    const setting = SETTING_WORDS.find(([pattern]) => pattern.test(clean))?.[1] ?? 'bodyweight';
    const difficulty = DIFFICULTY_WORDS.find(([pattern]) => pattern.test(clean))?.[1] ?? 'medium';
    return { kind: 'trainer', minutes: readMinutes(clean), setting, difficulty };
  }
  return NUTRITIONIST_WORDS.test(clean) ? { kind: 'nutritionist' } : { kind: 'coach' };
}
