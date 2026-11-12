// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PROFILE, type Profile } from '../../../domain/profile/profile';
import type { Category } from '../../../domain/training/catalogue';
import type { ExerciseEntry } from '../../../domain/training/exerciseSearch';
import { AiChat } from './AiChat';

// Four areas in turn, so the fictional pool covers all of them
const AREAS: Category[] = ['push', 'pull', 'legs', 'core'];
const LIBRARY: ExerciseEntry[] = Array.from({ length: 12 }, (_, number) => ({ id: `free-exercise-db:fictional_${number}`, name: `Fictional ${number}`, category: AREAS[number % 4]!,
  equipment: [], untracked: null, requires: [], minutes: 5, cue: 'Fictional cue.', primaryMuscles: ['quadriceps'], imagePath: null, sourceEquipment: 'body only', level: 'beginner' }));
// A fictional reviewed card
const SOURCE = { number: 1, title: 'Fictional title', source: 'Fictional source', sourceDate: '2026-01-26', url: 'https://example.org/card', excerpt: 'Fictional excerpt.' };
// One reply of each kind the services send
const COACH_ANSWER = { mode: 'answer', message: 'From reviewed guidance.', claims: [{ text: 'Fictional claim.', cites: [1] }], sources: [SOURCE], answeredBy: 'Gemini' };
const GENERAL_ANSWER = { mode: 'general', message: 'A general answer from the AI, not checked against reviewed guidance.', claims: [{ text: 'Fictional general claim.', cites: [] }], sources: [], answeredBy: 'Groq' };
const IDEAS = { mode: 'suggestions', message: 'Ideas to try.', suggestions: [{ title: 'Fictional bowl', entry: '1 bowl beans', why: { text: 'Beans add fibre.', cites: [1] } }], sources: [SOURCE], answeredBy: 'Groq' };
const SESSION = { exerciseIds: LIBRARY.map(entry => entry.id), reason: 'Fictional reason.', source: 'ai', answeredBy: 'Groq' };

let root: Root;
let container: HTMLDivElement;
const onDraft = vi.fn();
// Fictional diary lines, as the device would build them
const loadDiary = vi.fn(async () => ['2026-01-05: food 1800 kcal (Fictional oats); training 1 session; sleep 7 h 30 min']);

/** Display the chat for one saved profile. */
async function show(profile: Profile = EMPTY_PROFILE, entries: readonly ExerciseEntry[] = LIBRARY) {
  await act(async () => root.render(createElement(AiChat, { context: { entries, profile }, onDraft, loadDiary })));
}

/** Type a message and send it, letting the reply settle. */
async function say(text: string) {
  const field = container.querySelector<HTMLTextAreaElement>('#chat-input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

/** Return a fetch that answers each path with its reply, recording what was sent. */
function answering(replies: Record<string, unknown>) {
  return vi.fn(async (path: string, _init: RequestInit) => ({ ok: true, status: 200, json: async () => replies[path] }));
}

/** Return the credentials mode of each request a fetch was called with. */
function credentialsSent(fetchMock: ReturnType<typeof answering>) {
  return fetchMock.mock.calls.map(([, init]) => init.credentials);
}

/** Return the paths and bodies a fetch was called with. */
function sent(fetchMock: ReturnType<typeof answering>) {
  return fetchMock.mock.calls.map(([path, init]) => [path, JSON.parse(String(init.body))]);
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe('AI chat', () => {
  it('sends nothing for an empty message', async () => {
    const fetchMock = answering({});
    vi.stubGlobal('fetch', fetchMock);
    await show();
    await say('   ');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a question to the Coach, and shows each claim with its citation under the role', async () => {
    const fetchMock = answering({ '/api/coach': COACH_ANSWER });
    vi.stubGlobal('fetch', fetchMock);
    await show();
    await say('How much sodium is too much?');
    expect(sent(fetchMock)).toEqual([['/api/coach', { question: 'How much sodium is too much?' }]]);
    expect(container.querySelector('.chat-message')?.textContent).toBe('How much sodium is too much?');
    expect(container.querySelector('.chat-reply .badge')?.textContent).toBe('Coach');
    expect(container.textContent).toContain('Fictional claim. [1]');
  });

  it('names the role, never the hosted model', async () => {
    // Asked for on 10 Nov: the person talks to a Coach or a Nutritionist, not to a provider
    vi.stubGlobal('fetch', answering({ '/api/coach': COACH_ANSWER }));
    await show();
    await say('Fictional question?');
    expect(container.textContent).not.toMatch(/Gemini|Groq|Answered by/);
  });

  it('shows sources as plain text, never links', async () => {
    vi.stubGlobal('fetch', answering({ '/api/coach': COACH_ANSWER }));
    await show();
    await say('Fictional question?');
    expect(container.textContent).toContain('https://example.org/card');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows a general answer as plain chat, with the unchecked note once in the footer', async () => {
    vi.stubGlobal('fetch', answering({ '/api/coach': GENERAL_ANSWER }));
    await show();
    await say('Fictional question?');
    // Asked for on the phone on 10 Nov: the note belongs in the footer, not under every reply
    expect(container.querySelector('.chat-reply')?.textContent).toBe('CoachFictional general claim.');
    expect(container.textContent?.match(/not checked against reviewed guidance/g)).toHaveLength(1);
    expect(container.querySelector('.chat-reply p.body')?.textContent).toBe('Fictional general claim.');
    expect(container.querySelector('details')).toBeNull();
  });

  it('shows a refusal as the whole reply', async () => {
    vi.stubGlobal('fetch', answering({ '/api/coach': { mode: 'refused', message: 'I cannot advise on doses.', claims: [], sources: [] } }));
    await show();
    await say('Fictional question?');
    expect(container.querySelector('.chat-reply')?.textContent).toBe('CoachI cannot advise on doses.');
  });

  it('sends a request for food ideas to the Nutritionist, and an idea only becomes a draft', async () => {
    const fetchMock = answering({ '/api/nutritionist': IDEAS });
    vi.stubGlobal('fetch', fetchMock);
    await show();
    await say('Breakfast ideas with more fibre');
    expect(sent(fetchMock)).toEqual([['/api/nutritionist', { goal: 'Breakfast ideas with more fibre' }]]);
    expect(container.querySelector('.chat-reply .badge')?.textContent).toBe('Nutritionist');
    expect(onDraft).not.toHaveBeenCalled();
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Use as draft')!.click());
    expect(onDraft).toHaveBeenCalledWith('1 bowl beans');
  });

  it('still answers a food question the reviewed guidance does not cover', async () => {
    const fetchMock = answering({ '/api/nutritionist': { mode: 'no_evidence', message: 'No reviewed guidance.', suggestions: [], sources: [] }, '/api/coach': GENERAL_ANSWER });
    vi.stubGlobal('fetch', fetchMock);
    await show();
    await say('recipe ideas for a fictional stew');
    expect(sent(fetchMock).map(([path]) => path)).toEqual(['/api/nutritionist', '/api/coach']);
    expect(container.querySelector('.chat-reply .badge')?.textContent).toBe('Nutritionist');
    expect(container.textContent).toContain('Fictional general claim.');
  });

  it('offers diary sharing switched off, saying what would be sent and to whom', async () => {
    const fetchMock = answering({ '/api/coach': GENERAL_ANSWER });
    vi.stubGlobal('fetch', fetchMock);
    await show();
    const sharing = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect([sharing.disabled, sharing.checked]).toEqual([false, false]);
    expect(container.textContent).toContain('one line per day of food, training and sleep');
    expect(container.textContent).toContain('only one AI provider, which does not keep it by default');
    expect(container.textContent).toContain('Your profile and photos are not sent.');

    // Left off, a question about the week sends no diary and no cookie
    await say('What did I eat this week?');
    expect(loadDiary).not.toHaveBeenCalled();
    expect(sent(fetchMock)).toEqual([['/api/coach', { question: 'What did I eat this week?' }]]);
    expect(credentialsSent(fetchMock)).toEqual(['omit']);
  });

  it('sends the diary summary and the session cookie only while sharing is on', async () => {
    const fetchMock = answering({ '/api/coach': GENERAL_ANSWER, '/api/trainer': SESSION });
    vi.stubGlobal('fetch', fetchMock);
    await show();
    const sharing = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => sharing.click());
    await say('What did I eat this week?');
    expect(sent(fetchMock)[0]).toEqual(['/api/coach', { question: 'What did I eat this week?', context: await loadDiary.mock.results[0]!.value }]);

    // A session never carries the diary, and switching off stops it for a question too
    await say('A 30 minute workout with no equipment');
    await act(async () => sharing.click());
    await say('Fictional question?');
    expect(sent(fetchMock)[1]![1]).not.toHaveProperty('context');
    expect(sent(fetchMock)[2]![1]).not.toHaveProperty('context');
    expect(credentialsSent(fetchMock)).toEqual(['same-origin', 'omit', 'omit']);
  });

  it('starts with sharing off again whenever the screen is reopened', async () => {
    vi.stubGlobal('fetch', answering({ '/api/coach': GENERAL_ANSWER }));
    await show();
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => root.unmount());
    root = createRoot(container);
    await show();
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  });

  it('asks the person to sign in again when the session ended while sharing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ detail: 'Sign in to share your diary with the AI.' }) })));
    await show();
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await say('What did I eat this week?');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Sign in again to share your diary with the AI');
  });

  it('sends the earlier answered messages with a follow-up, and never the profile', async () => {
    const fetchMock = answering({ '/api/coach': GENERAL_ANSWER });
    vi.stubGlobal('fetch', fetchMock);
    await show({ ...EMPTY_PROFILE, seatedOnly: true, diabetes: true });
    await say('Fictional question?');
    await say('And for dinner?');
    expect(sent(fetchMock)[1]).toEqual(['/api/coach', { question: 'And for dinner?',
      history: [{ role: 'user', text: 'Fictional question?' }, { role: 'assistant', text: 'Fictional general claim.' }] }]);
  });

  it('keeps at most six earlier messages, and leaves out a refused one', async () => {
    const refusal = { mode: 'refused', message: 'I cannot advise on doses.', claims: [], sources: [] };
    const replies: Record<string, unknown> = { '/api/coach': refusal };
    const fetchMock = answering(replies);
    vi.stubGlobal('fetch', fetchMock);
    await show();
    await say('Fictional refused question?');
    replies['/api/coach'] = GENERAL_ANSWER;
    for (const number of [1, 2, 3, 4]) await say(`Fictional question ${number}?`);
    await say('And then?');
    const { history } = sent(fetchMock)[5]![1];
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ role: 'user', text: 'Fictional question 2?' });
    expect(JSON.stringify(sent(fetchMock))).not.toContain('"text":"Fictional refused question?"');
  });

  it('forgets the chat whenever the screen is reopened', async () => {
    const fetchMock = answering({ '/api/coach': GENERAL_ANSWER });
    vi.stubGlobal('fetch', fetchMock);
    await show();
    await say('Fictional question?');
    await act(async () => root.unmount());
    root = createRoot(container);
    await show();
    await say('And for dinner?');
    expect(sent(fetchMock)[1]).toEqual(['/api/coach', { question: 'And for dinner?' }]);
  });

  it('plans a session from the message, sending only what it says', async () => {
    const fetchMock = answering({ '/api/trainer': SESSION });
    vi.stubGlobal('fetch', fetchMock);
    await show();
    await say('A 60 minute workout with no equipment');
    expect(sent(fetchMock)).toEqual([['/api/trainer', { goal: 'A 60 minute workout with no equipment', minutes: 60, equipment: [], areas: AREAS, level: 'intermediate' }]]);
    expect(container.querySelector('.chat-reply .badge')?.textContent).toBe('Coach');
    expect(container.textContent).toContain('Planned for 60 minutes, no equipment, medium.');
    expect(container.textContent).toContain('60 of 60 min');
  });

  it('never sends the saved profile, and adapts the session on the device', async () => {
    const fetchMock = answering({ '/api/trainer': { exerciseIds: [], source: 'library', reason: 'Fictional proposal.' } });
    vi.stubGlobal('fetch', fetchMock);
    await show({ ...EMPTY_PROFILE, seatedOnly: true, avoidAreas: ['knees'], diabetes: true }, []);
    await say('Fictional workout');
    expect(sent(fetchMock)).toEqual([['/api/trainer', { goal: 'Fictional workout', minutes: 45, equipment: [], areas: AREAS, level: 'intermediate' }]]);
    expect(container.textContent).toContain('Picked from the library');
    expect(container.querySelector('.gym-plan-result')?.textContent).toContain('Seated arm raise');
    expect(container.querySelector('.gym-plan-result')?.textContent).not.toContain('Seated marching');
  });

  it('shows a refused session without any plan', async () => {
    vi.stubGlobal('fetch', answering({ '/api/trainer': { exerciseIds: [], reason: 'Please call your local emergency number.', source: 'refused' } }));
    await show();
    await say('Fictional workout');
    expect(container.textContent).toContain('Please call your local emergency number.');
    expect(container.querySelector('.gym-plan-result')).toBeNull();
  });

  it('says what still works when the service cannot be reached, and keeps the thread', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await show();
    await say('Fictional question?');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Your diary still works.');

    // A later message is answered under the first
    vi.stubGlobal('fetch', answering({ '/api/coach': COACH_ANSWER }));
    await say('Another fictional question?');
    expect(container.querySelectorAll('.chat-turn')).toHaveLength(2);
  });
});
