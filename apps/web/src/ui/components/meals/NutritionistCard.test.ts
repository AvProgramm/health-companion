// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readNutritionistReply } from '../../../domain/nutrition/nutritionistReply';
import { NutritionistCard } from './NutritionistCard';

// A fictional reviewed card, and one idea that cites it
const SOURCE = { number: 1, title: 'Fictional title', source: 'Fictional source', sourceDate: '2026-01-26', url: 'https://example.org/card', excerpt: 'Fictional excerpt.' };
const IDEA = { title: 'Fictional bean bowl', entry: '1 bowl beans and 1 slice toast', why: { text: 'Beans add fibre.', cites: [1] } };

let root: Root;
let container: HTMLDivElement;
const onDraft = vi.fn();

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(NutritionistCard, { onDraft })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

/** Type a goal and submit it, letting the reply settle. */
async function ask(text: string) {
  const field = container.querySelector<HTMLTextAreaElement>('#nutritionist-goal')!;
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

describe('Ideas for what to eat', () => {
  it('asks for a goal before calling anything', async () => {
    const fetchMock = answering({});
    vi.stubGlobal('fetch', fetchMock);
    await ask('   ');
    expect(container.textContent).toContain('Tell the Nutritionist what you are looking for.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the typed goal', async () => {
    const fetchMock = answering({ mode: 'no_evidence', message: 'Nothing reviewed.', suggestions: [], sources: [] });
    vi.stubGlobal('fetch', fetchMock);
    await ask('Fictional goal');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ goal: 'Fictional goal' });
  });

  it('shows each idea with its checked reason and citation', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'suggestions', message: 'Ideas to try.', suggestions: [IDEA], sources: [SOURCE] }));
    await ask('Fictional goal');
    expect(container.textContent).toContain('Fictional bean bowl');
    expect(container.textContent).toContain('Beans add fibre. [1]');
  });

  it('names the model behind the ideas', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'suggestions', message: 'Ideas to try.', suggestions: [IDEA], sources: [SOURCE], answeredBy: 'Groq' }));
    await ask('Fictional goal');
    expect(container.textContent).toContain('Answered by Groq');
  });

  it('only makes a draft when the person chooses to', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'suggestions', message: 'Ideas to try.', suggestions: [IDEA], sources: [SOURCE] }));
    await ask('Fictional goal');
    expect(onDraft).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Use as draft')!.click());
    expect(onDraft).toHaveBeenCalledWith('1 bowl beans and 1 slice toast');
  });

  it('shows sources as plain text, never links', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'suggestions', message: 'Ideas to try.', suggestions: [IDEA], sources: [SOURCE] }));
    await ask('Fictional goal');
    expect(container.textContent).toContain('https://example.org/card');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows the cards themselves when there is no AI answer', async () => {
    vi.stubGlobal('fetch', answering({ mode: 'excerpts', message: 'The AI answer is not available.', suggestions: [], sources: [SOURCE] }));
    await ask('Fictional goal');
    expect(container.textContent).toContain('Fictional excerpt.');
    expect(container.textContent).not.toContain('Answered by');
  });

  it('says the diary still works when the service is offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await ask('Fictional goal');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('The Nutritionist is offline. Your diary still works.');
  });
});

describe('readNutritionistReply', () => {
  it.each([null, {}, { mode: 'other', message: 'm', suggestions: [], sources: [] }, { mode: 'suggestions', message: 'm', suggestions: [{ title: 1 }], sources: [] }, { mode: 'suggestions', message: 'm', suggestions: [], sources: [{}] }, { mode: 'suggestions', message: 'm', suggestions: [], sources: [], answeredBy: 7 }])('rejects a malformed reply: %j', (value) => {
    expect(() => readNutritionistReply(value)).toThrow(/could not read/);
  });
});
