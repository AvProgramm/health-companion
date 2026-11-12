import { describe, expect, it } from 'vitest';
import { boundedHistory, MAX_HISTORY_TEXT, MAX_HISTORY_TURNS, type ChatTurn } from './chatHistory';

/** Return a fictional message from the person. */
function said(text: string): ChatTurn {
  return { role: 'user', text };
}

describe('chat history', () => {
  it('keeps only the latest six messages, oldest first', () => {
    const turns = Array.from({ length: 9 }, (_, number) => said(`Fictional message ${number}`));
    const kept = boundedHistory(turns);
    expect(kept).toHaveLength(MAX_HISTORY_TURNS);
    expect(kept[0]!.text).toBe('Fictional message 3');
    expect(kept[5]!.text).toBe('Fictional message 8');
  });

  it('cuts a long message to the length the service accepts', () => {
    expect(boundedHistory([said('x'.repeat(MAX_HISTORY_TEXT + 40))])[0]!.text).toHaveLength(MAX_HISTORY_TEXT);
  });

  it('trims each message and leaves out a blank one', () => {
    expect(boundedHistory([said('  Fictional question  '), said('   '), { role: 'assistant', text: 'Fictional answer.' }]))
      .toEqual([said('Fictional question'), { role: 'assistant', text: 'Fictional answer.' }]);
  });

  it('copies only the role and the text', () => {
    const withExtra = { role: 'user', text: 'Fictional question', profile: 'Fictional.' } as ChatTurn;
    expect(boundedHistory([withExtra])).toEqual([said('Fictional question')]);
  });

  it('returns nothing for an empty chat', () => {
    expect(boundedHistory([])).toEqual([]);
  });
});
