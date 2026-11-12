import { boundedHistory, type ChatTurn } from '../../domain/chat/chatHistory';
import { readCoachReply, type CoachReply } from '../../domain/coach/coachReply';
import { postJson, type ServiceMessages } from './post';

// One bounded model call, plus the proxy hop
const COACH_TIMEOUT_MS = 20000;
// What the person reads whenever the service cannot be reached
const OFFLINE = 'Coach is offline. Your diary still works.';

// What the person reads when diary lines were sent but the session has ended
const SIGN_IN_AGAIN = 'Sign in again to share your diary with the AI, or switch sharing off. Your diary still works.';
// The most diary lines the service accepts: one per day of a week
const MAX_DIARY_LINES = 7;

// What each kind of failure means for someone waiting on an answer
const MESSAGES: ServiceMessages = {
  slow: 'The Coach took too long to answer. Try again. Your diary still works.',
  unreachable: OFFLINE,
  notRunning: OFFLINE,
  busy: 'The Coach has no answer right now. Try again shortly. Your diary still works.',
  failed: (status) => status === 401 ? SIGN_IN_AGAIN : `The Coach returned an error (HTTP ${status}). Your diary still works.`,
};

/**
 * Ask the Coach, sending the typed question, the last few messages of the open chat and, only when passed, diary lines.
 *
 * The lines are a summary of recent days, and are only ever passed when the person has switched
 * sharing on. The session cookie goes with them and with nothing else, because the service
 * shares a diary only for a signed-in account.
 */
export async function askCoach(question: string, context: readonly string[] = [], history: readonly ChatTurn[] = []): Promise<CoachReply> {
  // Ignore more lines than a week holds because the service would refuse the whole request
  if (context.length > MAX_DIARY_LINES) throw new Error('Only the last seven days can be shared. Switch sharing off and on, then try again.');

  // Leave out an empty list, so a plain question carries nothing but itself
  const sharing = context.length > 0;
  const earlier = boundedHistory(history);
  const body = { question, ...(sharing ? { context } : {}), ...(earlier.length > 0 ? { history: earlier } : {}) };
  return readCoachReply(await postJson('/api/coach', body, COACH_TIMEOUT_MS, MESSAGES, sharing ? 'same-origin' : 'omit'));
}
