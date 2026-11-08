// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCoachReply } from '../domain/coach/coachReply';
import { AskCoach } from './AskCoach';

// A fictional reviewed card
const SOURCE = { number: 1, title: 'Fictional title', source: 'Fictional source', sourceDate: '2026-01-26', url: 'https://example.org/card', excerpt: 'Fictional excerpt.' };

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(AskCoach)));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

/** Type a question and submit it, letting the reply settle. */
async function ask(text: string) {
  const field = container.querySelector<HTMLTextAreaElement>('#coach-question')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

/** Return a fetch that answers with this reply. */
function answering(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

describe('Ask the Coach', () => {
  it('asks for a question before calling anything', async () => {
    const fetchMock = answering({});
    vi.stubGlobal('fetch', fetchMock);
    await ask('   ');
    expect(container.textContent).toContain('Type a question first.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the question and shows each claim with its citation', async () => {
    const fetchMock = answering({ mode: 'answer', message: 'From reviewed guidance.', claims: [{ text: 'Fictional claim.', cites: [1] }], sources: [SOURCE] });
    vi.stubGlobal('fetch', fetchMock);
    await ask('Fictional question?');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ question: 'Fictional question?' });
    expect(container.textContent).toContain('Fictional claim. [1]');
  });

  it('shows sources as plain text, never links', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'answer', message: 'From reviewed guidance.', claims: [{ text: 'Fictional claim.', cites: [1] }], sources: [SOURCE] }));
    await ask('Fictional question?');
    expect(container.textContent).toContain('https://example.org/card');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows the cards themselves when there is no AI answer', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'excerpts', message: 'The AI answer is not available.', claims: [], sources: [SOURCE] }));
    await ask('Fictional question?');
    expect(container.textContent).toContain('Fictional excerpt.');
  });

  it('shows a refusal with no sources', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'refused', message: 'Please ask your care team.', claims: [], sources: [] }));
    await ask('Fictional question?');
    expect(container.textContent).toContain('Please ask your care team.');
  });

  it('says the diary still works when the service is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await ask('Fictional question?');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Coach is offline. Your diary still works.');
  });
});

describe('readCoachReply', () => {
  it.each([null, {}, { mode: 'other', message: 'm', claims: [], sources: [] }, { mode: 'answer', message: 'm', claims: [{ text: 1, cites: [] }], sources: [] }, { mode: 'answer', message: 'm', claims: [], sources: [{}] }])('rejects a malformed reply: %j', (value) => {
    expect(() => readCoachReply(value)).toThrow(/could not read/);
  });
});
