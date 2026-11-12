/**
 * The short memory of the open chat: the last few messages, sent with a question so a follow-up makes sense.
 *
 * Only text that was already on screen belongs here. It is never saved, and the service
 * applies the same bounds again.
 */

/** One earlier message: who said it, and the text that was on screen. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

// The most earlier messages one question carries, matching the service's limit
export const MAX_HISTORY_TURNS = 6;
// The longest text kept from one earlier message, matching the service's limit
export const MAX_HISTORY_TEXT = 500;

/** Return the latest few messages, each trimmed and cut to the length the service accepts. */
export function boundedHistory(turns: readonly ChatTurn[]): ChatTurn[] {
  // Ignore a blank message because the service refuses an empty text
  const spoken = turns.map(({ role, text }) => ({ role, text: text.trim().slice(0, MAX_HISTORY_TEXT) })).filter(turn => turn.text !== '');
  return spoken.slice(-MAX_HISTORY_TURNS);
}
