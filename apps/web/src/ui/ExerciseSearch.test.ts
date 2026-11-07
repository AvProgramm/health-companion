// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseSearch } from './ExerciseSearch';
import type { ExerciseEntry } from '../domain/training/exerciseSearch';

// These fictional rows test the confirmation flow without a real exercise history.
const entries: ExerciseEntry[] = [{ id: 'free-exercise-db:fictional', name: 'Fictional row', category: 'pull', equipment: ['dumbbells'], untracked: null,
  requires: [], cue: 'Fictional cue.', minutes: 5, primaryMuscles: ['middle back'], sourceEquipment: 'dumbbell', imagePath: null, level: 'beginner' }];
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
    // Asked for on 8 Nov: the source's equipment is shown as a fact, with nothing to tick or untick
    const sheet = container.querySelector('[role="dialog"]') ?? container;
    expect(sheet.textContent).toContain('Dumbbells');
    expect(sheet.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(onAdd).not.toHaveBeenCalled();
    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent === 'Add to my exercises')!;
    await act(async () => confirm.click());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ equipment: ['dumbbells'], requires: [], category: 'pull' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps unsupported equipment searchable, says why, and never treats it as bodyweight', async () => {
    const blocked = { ...entries[0]!, equipment: null, untracked: 'a decline bench', sourceEquipment: 'body only' };
    await act(async () => root.render(createElement(ExerciseSearch, { entries: [blocked], chosen: [], busy: false, onAdd: vi.fn(), onRemove: vi.fn() })));
    await search('fictional');
    expect(container.textContent).toContain('It needs a decline bench');
    expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Review and add')!.disabled).toBe(true);
  });
});
