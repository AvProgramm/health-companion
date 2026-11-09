import { readNutritionistReply, type NutritionistReply } from '../domain/nutrition/nutritionistReply';
import { postJson, type ServiceMessages } from './post';

// One bounded model call, plus the proxy hop
const NUTRITIONIST_TIMEOUT_MS = 20000;
// What the person reads whenever the service cannot be reached
const OFFLINE = 'The Nutritionist is offline. Your diary still works.';

// What each kind of failure means for someone waiting on ideas
const MESSAGES: ServiceMessages = {
  slow: 'The Nutritionist took too long to answer. Try again. Your diary still works.',
  unreachable: OFFLINE,
  notRunning: OFFLINE,
  busy: 'The Nutritionist has no answer right now. Try again shortly. Your diary still works.',
  failed: (status) => `The Nutritionist returned an error (HTTP ${status}). Your diary still works.`,
};

/** Ask for food ideas, sending only the typed goal. */
export async function askNutritionist(goal: string): Promise<NutritionistReply> {
  return readNutritionistReply(await postJson('/api/nutritionist', { goal }, NUTRITIONIST_TIMEOUT_MS, MESSAGES));
}
