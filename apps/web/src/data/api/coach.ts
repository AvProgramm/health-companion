import { readCoachReply, type CoachReply } from '../../domain/coach/coachReply';
import { postJson, type ServiceMessages } from './post';

// One bounded model call, plus the proxy hop
const COACH_TIMEOUT_MS = 20000;
// What the person reads whenever the service cannot be reached
const OFFLINE = 'Coach is offline. Your diary still works.';

// What each kind of failure means for someone waiting on an answer
const MESSAGES: ServiceMessages = {
  slow: 'The Coach took too long to answer. Try again. Your diary still works.',
  unreachable: OFFLINE,
  notRunning: OFFLINE,
  busy: 'The Coach has no answer right now. Try again shortly. Your diary still works.',
  failed: (status) => `The Coach returned an error (HTTP ${status}). Your diary still works.`,
};

/**
 * Ask the Coach, sending the typed question and nothing else unless diary lines are passed.
 *
 * The lines are a summary of recent days, and are only ever passed when the person has switched sharing on.
 */
export async function askCoach(question: string, context: readonly string[] = []): Promise<CoachReply> {
  // Ignore a diary-context request because Yash has not enabled a permitted paid route.
  if (context.length > 0) throw new Error('Diary sharing is paused for the current free-tier setup. Send only your question.');
  const body = { question };
  return readCoachReply(await postJson('/api/coach', body, COACH_TIMEOUT_MS, MESSAGES));
}
