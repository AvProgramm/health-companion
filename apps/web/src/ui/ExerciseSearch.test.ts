// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseSearch } from './ExerciseSearch';
import type { ExerciseEntry } from '../domain/training/exerciseSearch';

// These fictional rows test the confirmation flow without a real exercise history.
const entries: ExerciseEntry[] = [{ id: 'free-exercise-db:fictional', name: 'Fictional row', category: 'pull', equipment: ['dumbbells'], requires: null,
  cue: 'Fictional cue.', minutes: 5, primaryMuscles: ['middle back'], sourceEquipment: 'dumbbell', imagePath: null }];
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

/** Enter search text using the native input setter so React receives a real change. */
async function search(text: string) {
  const input = container.querySelector('input[aria-label="Search exercises"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('offline exercise selection', () => {
  it('searches without fetch and saves only after review and explicit confirmation', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Offline.'));
    vi.stubGlobal('fetch', fetchMock);
    const onAdd = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(createElement(ExerciseSearch, { entries, chosen: [], busy: false, onAdd, onRemove: vi.fn() })));
    await search('fictional');
    expect(container.textContent).toContain('Fictional row');
    expect(onAdd).not.toHaveBeenCalled();
    const review = [...container.querySelectorAll('button')].find(button => button.textContent === 'Review and add')!;
    await act(async () => review.click());
    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent === 'Add to my exercises')!;
    expect(confirm.disabled).toBe(true);
    await act(async () => (container.querySelector('input[name="requirementsReviewed"]') as HTMLInputElement).click());
    await act(async () => confirm.click());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0].requires).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unsupported equipment searchable without silently treating it as bodyweight', async () => {
    await act(async () => root.render(createElement(ExerciseSearch, { entries: [{ ...entries[0]!, equipment: null, sourceEquipment: 'machine' }], chosen: [], busy: false, onAdd: vi.fn(), onRemove: vi.fn() })));
    await search('fictional');
    expect(container.textContent).toContain('machine');
    expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Review and add')!.disabled).toBe(true);
  });
});
