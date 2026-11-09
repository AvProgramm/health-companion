// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovementCard } from '../domain/training/catalogue';
import type { CustomCardSelection } from '../domain/training/customCards';
import { ExerciseSearch } from './ExerciseSearch';

// One fictional library card already chosen, and one the person described
const LIBRARY_CARD: MovementCard = { id: 'free-exercise-db:fictional', name: 'Fictional row', category: 'pull', equipment: [], requires: [], minutes: 5, cue: 'Fictional cue.' };
const OWN_CARD: MovementCard = { id: 'own:draft-1', name: 'Fictional sled drag', category: 'legs', equipment: [], requires: [], minutes: 6, cue: 'Fictional cue.' };
const CHOSEN: CustomCardSelection[] = [
  { id: LIBRARY_CARD.id, card: LIBRARY_CARD, source: { dataset: 'free-exercise-db', revision: 'a'.repeat(40) }, version: 1, deleted: false, operationKey: 'one', savedAt: '2026-11-09T10:00:00Z' },
  { id: OWN_CARD.id, card: OWN_CARD, source: { dataset: 'own' }, version: 1, deleted: false, operationKey: 'two', savedAt: '2026-11-09T10:00:00Z' },
];

let root: Root;
let container: HTMLDivElement;
const onAdd = vi.fn(async () => {});
const onRemove = vi.fn(async () => {});

/** Display the search with the given exercises already chosen. */
async function show(chosen: CustomCardSelection[]) {
  await act(async () => root.render(createElement(ExerciseSearch, { entries: [], chosen, busy: false, onAdd, onRemove })));
}

/** Type into a field using the native setter so React receives a real change. */
async function type(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Press the first button whose text matches. */
async function press(text: RegExp) {
  const button = [...document.querySelectorAll('button')].find(item => text.test(item.textContent ?? ''))!;
  await act(async () => button.click());
}

/** Search for a name the fictional library does not have. */
async function searchMiss(name: string) {
  await type(container.querySelector<HTMLInputElement>('input[aria-label="Search exercises"]')!, name);
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.open = false; };
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('adding my own exercise', () => {
  it('offers a search miss as a new exercise, already named', async () => {
    await show([]);
    await searchMiss('Fictional sled drag');
    await press(/as my own/);
    expect(document.querySelector<HTMLInputElement>('#own-name')!.value).toBe('Fictional sled drag');
  });

  it('saves nothing until the person confirms, then saves one card', async () => {
    await show([]);
    await searchMiss('Fictional sled drag');
    await press(/as my own/);
    await type(document.querySelector<HTMLInputElement>('#own-minutes')!, '12');
    expect(onAdd).not.toHaveBeenCalled();
    await act(async () => document.querySelector<HTMLFormElement>('.form')!.requestSubmit());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]).toEqual([expect.objectContaining({ name: 'Fictional sled drag', minutes: 12, equipment: [], positions: null, loads: null })]);
    expect((onAdd.mock.calls[0] as unknown as [MovementCard])[0].id).toMatch(/^own:/);
  });

  it('explains what to fix and saves nothing when the name is blank', async () => {
    await show([]);
    await press(/Add my own exercise/);
    await act(async () => document.querySelector<HTMLFormElement>('.form')!.requestSubmit());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Enter the exercise name');
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('the list of added exercises', () => {
  it('deletes an own exercise and removes a library one', async () => {
    await show(CHOSEN);
    expect(container.querySelector('[aria-label="Delete Fictional sled drag"]')?.textContent).toBe('Delete');
    expect(container.querySelector('[aria-label="Remove Fictional row"]')?.textContent).toBe('Remove');
  });

  it('marks which exercises are the person\'s own', async () => {
    await show(CHOSEN);
    expect(container.textContent).toContain('6 min · legs · my own');
  });

  it('passes the chosen exercise to the delete action', async () => {
    await show(CHOSEN);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Delete Fictional sled drag"]')!.click());
    expect(onRemove).toHaveBeenCalledWith(CHOSEN[1]);
  });
});
