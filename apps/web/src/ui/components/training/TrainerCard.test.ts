// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '../../../domain/training/catalogue';
import type { ExerciseEntry } from '../../../domain/training/exerciseSearch';
import { TrainerCard } from './TrainerCard';

// Four areas in turn, so the fictional pool covers all of them
const AREAS: Category[] = ['push', 'pull', 'legs', 'core'];
const LIBRARY: ExerciseEntry[] = Array.from({ length: 12 }, (_, number) => ({ id: `free-exercise-db:fictional_${number}`, name: `Fictional ${number}`, category: AREAS[number % 4]!,
  equipment: [], untracked: null, requires: [], minutes: 5, cue: 'Fictional cue.', primaryMuscles: ['quadriceps'], imagePath: null, sourceEquipment: 'body only', level: 'beginner' }));

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(TrainerCard, { entries: LIBRARY })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

/** Type into a field using the native setter so React receives a real change. */
async function type(selector: string, text: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Submit the card and let the reply settle. */
async function ask() {
  await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

/** Return a fetch that answers with this reply. */
function answering(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

describe('Ask the Trainer', () => {
  it('asks for a goal before calling anything', async () => {
    const fetchMock = answering({});
    vi.stubGlobal('fetch', fetchMock);
    await ask();
    expect(container.textContent).toContain('Tell the Trainer what you want from today.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the card fields and shows a checked, varied session', async () => {
    const fetchMock = answering({ exerciseIds: LIBRARY.map(entry => entry.id), reason: 'Fictional reason.', source: 'ai' });
    vi.stubGlobal('fetch', fetchMock);
    await type('#trainer-goal', 'I want to be healthy');
    await type('#trainer-minutes', '120');
    await ask();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ goal: 'I want to be healthy', minutes: 120, equipment: [], areas: AREAS, level: 'intermediate' });
    expect(container.textContent).toContain('Picked by the AI');
    expect(container.textContent).toContain('Fictional reason.');
    expect(container.querySelectorAll('.planned-exercise')).toHaveLength(12);
    expect(container.textContent).toContain('120 of 120 min');
  });

  it('keeps the minutes a session was planned for after the box is edited', async () => {
    vi.stubGlobal('fetch', answering({ exerciseIds: LIBRARY.map(entry => entry.id), reason: 'Fictional reason.', source: 'ai' }));
    await type('#trainer-goal', 'Fictional goal');
    await type('#trainer-minutes', '120');
    await ask();
    await type('#trainer-minutes', '30');
    expect(container.textContent).toContain('120 of 120 min');
  });

  it('shows a refusal without any session', async () => {
    vi.stubGlobal('fetch', answering({ exerciseIds: [], reason: 'Please call your local emergency number.', source: 'refused' }));
    await type('#trainer-goal', 'Fictional goal');
    await ask();
    expect(container.textContent).toContain('Please call your local emergency number.');
    expect(container.textContent).not.toContain('Picked');
    expect(container.querySelector('.gym-plan-result')).toBeNull();
  });

  it('labels a library fallback plainly', async () => {
    vi.stubGlobal('fetch', answering({ exerciseIds: LIBRARY.map(entry => entry.id), reason: 'The AI is busy right now.', source: 'library' }));
    await type('#trainer-goal', 'Fictional goal');
    await ask();
    expect(container.textContent).toContain('Picked from the library');
  });

  it('says what still works when the laptop cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await type('#trainer-goal', 'Fictional goal');
    await ask();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Could not reach the laptop.*ready-made days still work/);
  });

  it('refuses a time the service would reject', async () => {
    const fetchMock = answering({});
    vi.stubGlobal('fetch', fetchMock);
    await type('#trainer-goal', 'Fictional goal');
    await type('#trainer-minutes', '0');
    await ask();
    expect(container.textContent).toContain('from 1 to 600');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
