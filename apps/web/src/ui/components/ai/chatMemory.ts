import { boundedHistory, type ChatTurn } from '../../../domain/chat/chatHistory';
import type { ChatAnswer } from './askAi';

/** One message in the open chat and the reply it got, if any. */
export interface SpokenTurn {
  text: string;
  answer: ChatAnswer | null;
}

/**
 * Return the words of a reply that were shown on screen, or null when it gave no answer worth recalling.
 *
 * A refusal, a list of excerpts and a planned session are left out, so only what a
 * helper actually said can colour a later answer.
 */
function replyText(answer: ChatAnswer): string | null {
  // Join the claims of a Coach answer, checked or general
  if (answer.kind === 'coach' && (answer.reply.mode === 'answer' || answer.reply.mode === 'general')) {
    return answer.reply.claims.map(claim => claim.text).join(' ');
  }

  // Name each food idea with the entry it suggested
  if (answer.kind === 'nutritionist' && answer.reply.mode === 'suggestions') {
    return answer.reply.suggestions.map(suggestion => `${suggestion.title}: ${suggestion.entry}`).join('; ');
  }
  return null;
}

/**
 * Return the earlier messages to send with the next question, oldest first.
 *
 * Only messages that were answered are kept, each with its reply. The saved profile and
 * the diary are never part of this.
 */
export function chatMemory(turns: readonly SpokenTurn[]): ChatTurn[] {
  const spoken = turns.flatMap((turn): ChatTurn[] => {
    // Ignore a message that is still waiting, failed or was refused, because it has no answer to follow up on
    const reply = turn.answer === null ? null : replyText(turn.answer);
    return reply === null ? [] : [{ role: 'user', text: turn.text }, { role: 'assistant', text: reply }];
  });
  return boundedHistory(spoken);
}
