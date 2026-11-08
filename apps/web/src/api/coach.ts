import { readCoachReply, type CoachReply } from '../domain/coach/coachReply';
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

/** Ask the Coach, sending only the typed question. */
export async function askCoach(question: string): Promise<CoachReply> {
  return readCoachReply(await postJson('/api/coach', { question }, COACH_TIMEOUT_MS, MESSAGES));
}
