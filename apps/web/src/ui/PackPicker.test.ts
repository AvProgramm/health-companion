// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_ENTRIES } from '../data/exerciseLibrary';
import { PackPicker } from './PackPicker';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

/** Choose the radio tile with this label. */
async function choose(label: string) {
  const tile = [...container.querySelectorAll('label')].find(item => item.textContent === label)!;
  await act(async () => tile.querySelector('input')!.click());
}

/** Return the exercise names shown, in order. */
function shown(): string[] {
  return [...container.querySelectorAll('.pack-exercises .item-main > span:first-child')].map(item => item.textContent ?? '');
}

describe('ready-made days', () => {
  it('shows a day straight away and updates it from the three choices', async () => {
    await act(async () => root.render(createElement(PackPicker, { entries: EXERCISE_ENTRIES, chosen: [], busy: false, onAdd: vi.fn() })));
    expect(shown()).toEqual(['Bodyweight Squat', 'Butt Lift (Bridge)', 'Pushups', 'Plank']);
    expect(container.textContent).toContain('Full body · Easy · about 16 min');
    await choose('Leg day');
    await choose('Gym');
    expect(shown()).toEqual(['Barbell Squat', 'Stiff-Legged Dumbbell Deadlift', 'Standing Calf Raises', 'Butt Lift (Bridge)']);
    await choose('Hard');
    expect(container.textContent).toContain('Leg day · Hard · about 48 min');
  });

  it('says plainly when nothing in a day fits, rather than showing an empty list', async () => {
    await act(async () => root.render(createElement(PackPicker, { entries: EXERCISE_ENTRIES, chosen: [], busy: false, onAdd: vi.fn() })));
    await choose('Pull day');
    expect(shown()).toEqual([]);
    expect(container.textContent).toContain('Nothing in Pull day fits No equipment at this level. Try Home kit or Gym.');
  });

  it('adds an exercise only through the review sheet and its confirmation', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(createElement(PackPicker, { entries: EXERCISE_ENTRIES, chosen: [], busy: false, onAdd })));
    const review = [...container.querySelectorAll('button')].find(button => button.textContent === 'Review and add')!;
    await act(async () => review.click());
    expect(onAdd).not.toHaveBeenCalled();
    const confirm = [...container.querySelectorAll('button')].find(button => button.textContent === 'Add to my exercises')!;
    await act(async () => confirm.click());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ name: 'Bodyweight Squat', equipment: [], category: 'legs' });
  });
});
