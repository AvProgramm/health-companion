// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealComponent, MealEdit, MealRevision } from '../../../domain/meals/types';
import { foodKey } from '../../../domain/nutrition/aggregate';
import type { FoodVersion } from '../../../domain/nutrition/types';
import type { Unit } from '../../../domain/shared/units';
import { commitEdit, listRevisions, type SavedMeal } from '../../../data/storage/mealsRepo';
import { MealSheet } from './MealSheet';

vi.mock('../../../data/storage/mealsRepo', () => ({ commitEdit: vi.fn(), listRevisions: vi.fn() }));

// The sheet only hands the database to the storage functions, which are mocked here
const DB = {} as IDBDatabase;

/** Return a fictional food labelled per 100 of this unit. */
function food(id: string, unit: Unit): FoodVersion {
  return { id, version: 1, name: `Fictional ${id}`, basis: { amount: 100, unit }, nutrients: { kcal: 100 }, source: { kind: 'label' } };
}

/** Return one fictional item of the meal. */
function item(id: string, foodId: string, amount: number, unit: Unit, eatenFraction = 1): MealComponent {
  return { id, foodId, foodVersion: 1, served: { amount, unit }, eatenFraction, active: true };
}

/** Return a fictional revision of the one meal these tests open. */
function revision(number: number, components: readonly MealComponent[], deleted = false): MealRevision {
  return { mealId: 'meal', revision: number, supersedes: number === 1 ? null : number - 1, operationKey: `key-${number}`, localDate: '2026-11-08', zone: 'UTC', savedAt: '2026-11-08T01:00:00Z', components, ...(deleted ? { deleted } : {}) };
}

// Three foods, so a replacement has something to be replaced with
const CURRENT_FOODS = [food('milk', 'mL'), food('oats', 'g'), food('soya', 'mL')];
const FOODS = new Map(CURRENT_FOODS.map((entry) => [foodKey(entry.id, entry.version), entry]));

// The sheet opens on revision 2, so there is a change to undo
const MILK_ITEM = item('milk-item', 'milk', 300, 'mL');
const OATS_ITEM = item('oats-item', 'oats', 40, 'g');
const FIRST = revision(1, [item('milk-item', 'milk', 200, 'mL')]);
const LATEST = revision(2, [MILK_ITEM, OATS_ITEM]);

const onClose = vi.fn();
const onChanged = vi.fn(async () => undefined);
const onLogAgain = vi.fn();
let container: HTMLElement;
let root: Root;

/** Open the sheet on this revision, with this history. */
async function openSheet(latest: MealRevision = LATEST, history: readonly MealRevision[] = [FIRST, LATEST]) {
  vi.mocked(listRevisions).mockResolvedValue([...history]);
  const meal: SavedMeal = { header: { mealId: 'meal', localDate: '2026-11-08', createdAt: '2026-11-08T01:00:00Z', latestRevision: latest.revision }, latest };
  await act(async () => root.render(createElement(MealSheet, { db: DB, meal, foods: FOODS, currentFoods: CURRENT_FOODS, onClose, onChanged, onLogAgain })));
}

/** Click the button with this accessible name or text. */
async function click(name: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name);
  if (button === undefined) {
    throw new Error(`There is no button named ${name}.`);
  }
  await act(async () => button.click());
}

/** Set a control's value through the same event boundary as the browser. */
async function setValue(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const isSelect = control instanceof HTMLSelectElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(isSelect ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(control, value);
    control.dispatchEvent(new Event(isSelect ? 'change' : 'input', { bubbles: true }));
  });
}

/** Return the control with this accessible label. */
function labelled<T extends HTMLElement>(label: string): T {
  return container.querySelector(`[aria-label="${label}"]`) as T;
}

/** Return the choices a select offers, as their visible text. */
function optionTexts(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.textContent ?? '');
}

/** Return the one edit saved so far. */
function savedEdit(): MealEdit {
  expect(commitEdit).toHaveBeenCalledTimes(1);
  return vi.mocked(commitEdit).mock.calls[0]![1].edit;
}

/** Return the sheet's outcome line. */
function noticeText(): string | null {
  return container.querySelector('.notice')?.textContent ?? null;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(commitEdit).mockResolvedValue({ status: 'saved', revision: LATEST, replayed: false });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('changing an amount', () => {
  it('saves the new amount and eaten share against the revision on screen', async () => {
    await openSheet();
    await click('Change amount of Fictional milk');
    await setValue(labelled<HTMLInputElement>('Amount'), '250');
    await setValue(container.querySelector('.field select') as HTMLSelectElement, '0.5');
    await click('Save change');

    expect(commitEdit).toHaveBeenCalledWith(DB, expect.objectContaining({ mealId: 'meal', expectedRevision: 2 }), FOODS);
    expect(savedEdit()).toEqual({ kind: 'update_component', componentId: 'milk-item', served: { amount: 250, unit: 'mL' }, eatenFraction: 0.5 });
    expect(noticeText()).toBe('Saved revision 3.');
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(labelled('Amount')).toBeNull();
  });

  it('starts from the saved amount and offers only units the label can describe', async () => {
    await openSheet();
    await click('Change amount of Fictional milk');

    expect(labelled<HTMLInputElement>('Amount').value).toBe('300');
    expect(optionTexts(labelled<HTMLSelectElement>('Unit'))).toEqual(['mL', 'L']);
  });

  it('refuses an amount that is not a number without saving', async () => {
    await openSheet();
    await click('Change amount of Fictional milk');
    await setValue(labelled<HTMLInputElement>('Amount'), 'lots');
    await click('Save change');

    expect(commitEdit).not.toHaveBeenCalled();
    expect(noticeText()).toBe('Enter the amount as a number, for example 250.');
  });

  it('keeps a saved eaten share that is not one of the presets', async () => {
    await openSheet(revision(2, [item('milk-item', 'milk', 300, 'mL', 0.33)]));
    await click('Change amount of Fictional milk');

    const eaten = container.querySelector('.field select') as HTMLSelectElement;
    expect(optionTexts(eaten)).toContain('33%');
    expect(eaten.value).toBe('0.33');
  });

  it('closes the editor on Cancel without saving', async () => {
    await openSheet();
    await click('Change amount of Fictional milk');
    await click('Cancel');

    expect(commitEdit).not.toHaveBeenCalled();
    expect(labelled('Amount')).toBeNull();
  });
});

describe('replacing an item', () => {
  it('saves the chosen food as a new item, taking on its unit', async () => {
    await openSheet();
    await click('Replace Fictional oats');
    await setValue(labelled<HTMLSelectElement>('Replaced with'), foodKey('soya', 1));
    expect(labelled<HTMLSelectElement>('Unit').value).toBe('mL');
    await setValue(labelled<HTMLInputElement>('Amount'), '200');
    await click('Save replacement');

    expect(savedEdit()).toEqual({ kind: 'replace_food', componentId: 'oats-item', replacement: { id: expect.any(String), foodId: 'soya', foodVersion: 1, served: { amount: 200, unit: 'mL' }, eatenFraction: 1, active: true } });
    expect(noticeText()).toBe('Replaced Fictional oats with Fictional soya.');
  });

  it('asks for a food and an amount before saving', async () => {
    await openSheet();
    await click('Replace Fictional oats');
    await click('Save replacement');

    expect(commitEdit).not.toHaveBeenCalled();
    expect(noticeText()).toBe('Choose the food it was replaced with and enter how much.');
  });

  it('starts with an empty amount, because the old amount describes another food', async () => {
    await openSheet();
    await click('Replace Fictional oats');

    expect(labelled<HTMLInputElement>('Amount').value).toBe('');
  });
});

describe('the other changes', () => {
  it('removes one item', async () => {
    await openSheet();
    await click('Remove Fictional oats');

    expect(savedEdit()).toEqual({ kind: 'remove_component', componentId: 'oats-item' });
    expect(noticeText()).toBe('Removed Fictional oats.');
  });

  it('undoes by saving the previous revision again as a new one', async () => {
    await openSheet();
    await click('Undo last change');

    expect(savedEdit()).toEqual({ kind: 'restore', fromRevision: 1, components: FIRST.components, deleted: false });
    expect(noticeText()).toBe('Undone. Revision 2 stays in the history.');
  });

  it('offers no undo on a first revision', async () => {
    await openSheet(FIRST, [FIRST]);

    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Undo last change')).toBe(false);
  });

  it('needs a second tap to delete', async () => {
    await openSheet();
    await click('Delete meal');
    expect(commitEdit).not.toHaveBeenCalled();
    await click('Tap again to delete');

    expect(savedEdit()).toEqual({ kind: 'delete_meal' });
  });

  it('offers only restore on a deleted meal', async () => {
    const deleted = revision(3, LATEST.components, true);
    await openSheet(deleted, [FIRST, LATEST, deleted]);
    expect(labelled('Change amount of Fictional milk')).toBeNull();
    await click('Restore meal');

    expect(savedEdit()).toEqual({ kind: 'restore', fromRevision: 2, components: LATEST.components, deleted: false });
    expect(noticeText()).toBe('Meal restored.');
  });

  it('starts a new draft through Log again and saves nothing itself', async () => {
    await openSheet();
    await click('Log again today');

    expect(onLogAgain).toHaveBeenCalledTimes(1);
    expect(commitEdit).not.toHaveBeenCalled();
  });

  it('names the items already removed', async () => {
    await openSheet(revision(2, [MILK_ITEM, { ...OATS_ITEM, active: false }]));

    expect(container.querySelector('.hint')?.textContent).toBe('Removed from this meal: Fictional oats.');
  });
});

describe('saving safely', () => {
  it('reuses the operation key on a retry and takes a new one after a success', async () => {
    vi.mocked(commitEdit).mockRejectedValueOnce(new Error('The save did not finish. Try again.'));
    await openSheet();
    await click('Remove Fictional oats');
    expect(noticeText()).toBe('The save did not finish. Try again.');
    await click('Remove Fictional oats');
    await click('Remove Fictional oats');

    const keys = vi.mocked(commitEdit).mock.calls.map(([, request]) => request.operationKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('explains a conflict, keeps the editor open and reloads the meal', async () => {
    vi.mocked(commitEdit).mockResolvedValue({ status: 'conflict', latest: revision(5, LATEST.components) });
    await openSheet();
    await click('Change amount of Fictional milk');
    await click('Save change');

    expect(noticeText()).toBe('This meal changed since you opened it (now revision 5). Check it and try again.');
    expect(labelled('Amount')).not.toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe('the history', () => {
  it('lists every revision, newest first, in words', async () => {
    await openSheet();

    const changes = [...container.querySelectorAll('.history-main')].map((line) => line.textContent);
    expect(changes).toEqual(['Fictional milk 200 mL → 300 mL; Added Fictional oats', 'First saved']);
  });
});
