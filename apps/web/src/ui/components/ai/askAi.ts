import { askCoach } from '../../../api/coach';
import { askNutritionist } from '../../../api/nutritionist';
import { requestTrainerPlan } from '../../../api/trainer';
import { chatIntent } from '../../../domain/chat/chatIntent';
import type { CoachReply } from '../../../domain/coach/coachReply';
import type { NutritionistReply } from '../../../domain/nutrition/nutritionistReply';
import type { Profile } from '../../../domain/profile/profile';
import type { Category } from '../../../domain/training/catalogue';
import type { ExerciseEntry } from '../../../domain/training/exerciseSearch';
import { DIFFICULTIES, SETTINGS } from '../../../domain/training/packs';
import type { PlanResult } from '../../../domain/training/planner';
import { planFromProposal, type TrainerReply } from '../../../domain/training/trainerPlan';

// A session balances the whole body unless the message says otherwise
const ALL_AREAS: readonly Category[] = ['push', 'pull', 'legs', 'core'];

/** Who is speaking: the Coach also plans sessions, and the Nutritionist also covers cooking. */
export type ChatRole = 'Coach' | 'Nutritionist';

/** One reply in the chat, in the shape of whichever helper wrote it. */
export type ChatAnswer =
  | { kind: 'coach'; role: ChatRole; reply: CoachReply }
  | { kind: 'nutritionist'; role: 'Nutritionist'; reply: NutritionistReply }
  | { kind: 'trainer'; role: 'Coach'; reply: TrainerReply; result: PlanResult; minutes: number; assumed: string };

/** What the device knows that a session must respect; none of it is sent. */
export interface TrainerContext {
  entries: readonly ExerciseEntry[];
  profile: Profile;
}

/**
 * Return the right helper's reply to one chat message.
 *
 * Only the typed message is sent, or for a session the goal with the length, place and
 * difficulty read from it. The saved profile stays here and adapts the plan afterwards.
 * Diary lines are passed only when the person switched sharing on, and then go with a
 * question or a food request, so the answer can be about their own week.
 */
export async function askAi(text: string, context: TrainerContext, diaryLines: readonly string[] = []): Promise<ChatAnswer> {
  const intent = chatIntent(text);

  // Plan a session, then run the proposal through the checks on this device
  if (intent.kind === 'trainer') {
    const { minutes, setting, difficulty } = intent;
    const equipment = SETTINGS[setting].equipment;
    const reply = await requestTrainerPlan({ goal: text, minutes, equipment, areas: ALL_AREAS, level: DIFFICULTIES[difficulty].levels[0]! });
    const { unableTo, avoidAreas, seatedOnly } = context.profile;
    const result = planFromProposal(reply, context.entries, { minutes, equipment, unableTo, avoidAreas, seatedOnly, neverSuggest: [], categories: ALL_AREAS });
    const assumed = `Planned for ${minutes} minutes, ${SETTINGS[setting].label.toLowerCase()}, ${DIFFICULTIES[difficulty].label.toLowerCase()}. Say a length, place or difficulty to change it.`;
    return { kind: 'trainer', role: 'Coach', reply, result, minutes, assumed };
  }

  // Answer from the shared diary, under the role the message was meant for
  if (diaryLines.length > 0) {
    return { kind: 'coach', role: intent.kind === 'nutritionist' ? 'Nutritionist' : 'Coach', reply: await askCoach(text, diaryLines) };
  }

  // Ask for food ideas; with no reviewed guidance on the goal, answer it as a general question instead
  if (intent.kind === 'nutritionist') {
    const reply = await askNutritionist(text);
    return reply.mode === 'no_evidence' ? { kind: 'coach', role: 'Nutritionist', reply: await askCoach(text) } : { kind: 'nutritionist', role: 'Nutritionist', reply };
  }
  return { kind: 'coach', role: 'Coach', reply: await askCoach(text) };
}
