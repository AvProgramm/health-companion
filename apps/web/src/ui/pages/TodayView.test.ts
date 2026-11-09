// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodKey } from '../../domain/nutrition/aggregate';
import type { FoodVersion } from '../../domain/nutrition/types';
import { openDiary } from '../../storage/connection';
import { logsOn } from '../../storage/logsRepo';
import { commitEdit, mealsOn } from '../../storage/mealsRepo';
import { TEST_FOODS } from '../../test/testFoods';
import { formatDiaryDate } from '../format';
import { useToday } from '../hooks/useToday';
import { TodayView } from './TodayView';

vi.mock('../../vision/recogniseDish', () => ({ loadDishFacts: vi.fn(async () => null), modelIsKept: vi.fn(async () => false), recogniseDish: vi.fn() }));
vi.mock('../hooks/useToday', () => ({ useToday: vi.fn() }));

// A fixed fictional day, so nothing here depends on when the tests run
const TODAY = '2026-11-09';
const YESTERDAY = '2026-11-08';
const TOMORROW = '2026-11-10';

let db: IDBDatabase;
let container: HTMLElement;
let root: Root;
let currentFoods: readonly FoodVersion[];
const scrollTo = vi.fn();

/** Keep a saved food, as the app shell does; the test shows the screen again afterwards. */
async function saveFood(food: FoodVersion) {
  currentFoods = [...currentFoods, food];
}

/** Show the Today screen with the current foods and let it finish loading. */
async function show(overrides: Partial<ComponentProps<typeof TodayView>> = {}) {
  const foods = new Map(currentFoods.map((food) => [foodKey(food.id, food.version), food]));
  await act(async () => root.render(createElement(TodayView, { db, foods, currentFoods, hideNumbers: false, durability: 'persistent', onSaveFood: saveFood, ...overrides })));
  await settle();
}

/** Let storage and React finish what they are doing. */
async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}

/** Keep letting the screen settle until this check passes. */
async function until(check: () => void) {
  await vi.waitFor(async () => {
    await settle();
    check();
  });
}

/** Return the last button with this accessible name or text, so a sheet or panel wins over the page. */
function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].filter((candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name).at(-1);
  if (found === undefined) {
    throw new Error(`There is no button named ${name}.`);
  }
  return found;
}

/** Click the button with this accessible name or text. */
async function click(name: string) {
  await act(async () => button(name).click());
}

/** Set a control's value through the same event boundary as the browser. */
async function setValue(control: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Return the entry box. */
function composer(): HTMLTextAreaElement {
  return container.querySelector('#composer') as HTMLTextAreaElement;
}

/** Type into the entry box and ask for it to be read. */
async function enter(text: string) {
  await setValue(composer(), text);
  await click('Review entry');
}

/** Type a meal and confirm it on the day shown. */
async function logMeal(text: string, dateLabel = 'today') {
  await enter(text);
  await click(`Save meal to ${dateLabel}`);
  await until(() => expect(noticeText()).toBe(`Saved to ${dateLabel}.`));
}

/** Return all the text on screen. */
function screenText(): string {
  return container.textContent ?? '';
}

/** Return the outcome line under the entry box. */
function noticeText(): string | null {
  return container.querySelector('.notice')?.textContent ?? null;
}

/** Return the date the screen is showing. */
function dateTitle(): string | null {
  return container.querySelector('.date-title')?.textContent ?? null;
}

/** Open the one meal in the diary. */
async function openMeal() {
  await act(async () => (container.querySelector('.timeline button[aria-label^="Change"]') as HTMLButtonElement).click());
  await settle();
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(useToday).mockReturnValue(TODAY);
  window.scrollTo = scrollTo;
  currentFoods = TEST_FOODS;
  db = await openDiary(new IDBFactory());
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  db.close();
  vi.clearAllMocks();
});

describe('the day on screen', () => {
  it('shows an empty day as nothing logged, never as zero', async () => {
    await show();

    expect(screenText()).toContain('Start with one small thing.');
    expect(screenText()).toContain('Nothing logged for today.');
    expect(screenText()).not.toContain('0 kcal');
  });

  it('moves between days and never past today', async () => {
    await show();
    expect(dateTitle()).toBe(formatDiaryDate(TODAY));
    expect(button('Next day').disabled).toBe(true);

    await click('Previous day');
    await settle();
    expect(dateTitle()).toBe(formatDiaryDate(YESTERDAY));
    expect(button('Next day').disabled).toBe(false);

    await click('Today');
    await settle();
    expect(dateTitle()).toBe(formatDiaryDate(TODAY));
  });

  it('follows the device into a new day', async () => {
    await show();
    vi.mocked(useToday).mockReturnValue(TOMORROW);
    await show();

    expect(dateTitle()).toBe(formatDiaryDate(TOMORROW));
  });

  it('stays on an older day that was picked on purpose', async () => {
    await show();
    await click('Previous day');
    await settle();
    vi.mocked(useToday).mockReturnValue(TOMORROW);
    await show();

    expect(dateTitle()).toBe(formatDiaryDate(YESTERDAY));
  });

  it('says how the diary is kept on this device', async () => {
    await show();

    expect(container.querySelector('.day-sidebar')?.textContent).toContain('Saved on this device.');
  });

  it('leaves the balance and the week out when numbers are hidden', async () => {
    await show();
    await logMeal('300 ml milk');
    const withNumbers = container.querySelectorAll('.day-sidebar > *').length;
    await show({ hideNumbers: true });

    expect(container.querySelectorAll('.day-sidebar > *').length).toBeLessThan(withNumbers);
  });
});

describe('the entry box', () => {
  it('answers a question from the diary on this device', async () => {
    await show();
    await enter('how much protein today?');

    expect(screenText()).toContain('Nothing is logged for today, so protein is unknown, not zero.');
    expect(screenText()).toContain('Answered from your diary on this device. No AI was used.');
    await click('OK');
    expect(screenText()).not.toContain('No AI was used.');
  });

  it('answers with the total once something is logged', async () => {
    await show();
    await logMeal('300 ml milk');
    await enter('how much protein today?');

    expect(screenText()).toMatch(/Protein for today: .+ g, from 1 meal logged\./);
  });

  it('keeps a total out of the answer when numbers are hidden', async () => {
    await show();
    await logMeal('300 ml milk');
    await show({ hideNumbers: true });
    await enter('how much protein today?');

    expect(screenText()).toContain('Numbers are hidden. Turn them back on in Me to see this total.');
  });

  it('says what it cannot read, keeps the text and offers manual entry', async () => {
    await show();
    await enter('should i rest?');

    expect(screenText()).toContain('That is not something the diary can answer yet.');
    expect(composer().value).toBe('should i rest?');
    await click('Add manually');
    expect(button('Save meal to today').disabled).toBe(true);
  });

  it('clears the box once the entry is understood', async () => {
    await show();
    await enter('how much protein today?');

    expect(composer().value).toBe('');
  });

  it('starts with text handed over by the Nutritionist, without saving it', async () => {
    await show({ initialEntry: 'grilled fish 1 plate' });

    expect(composer().value).toBe('grilled fish 1 plate');
    expect(await mealsOn(db, TODAY)).toEqual([]);
  });
});

describe('saving what was typed', () => {
  it('saves a meal only after it is confirmed', async () => {
    await show();
    await enter('2 weetabix and 300 ml milk');
    expect(await mealsOn(db, TODAY)).toEqual([]);

    await click('Save meal to today');
    await until(() => expect(noticeText()).toBe('Saved to today.'));
    const saved = await mealsOn(db, TODAY);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.latest.revision).toBe(1);
    expect(saved[0]!.latest.components).toHaveLength(2);
    expect(screenText()).not.toContain('Start with one small thing.');
    expect(screenText()).not.toContain('Save meal to today');
  });

  it('saves on the day shown, not the day it is', async () => {
    await show();
    await click('Previous day');
    await settle();
    await logMeal('300 ml milk', formatDiaryDate(YESTERDAY));

    expect(await mealsOn(db, TODAY)).toEqual([]);
    expect(await mealsOn(db, YESTERDAY)).toHaveLength(1);
  });

  it('discards a draft without saving', async () => {
    await show();
    await enter('300 ml milk');
    await click('Discard');

    expect(screenText()).not.toContain('Save meal to today');
    expect(await mealsOn(db, TODAY)).toEqual([]);
  });

  it('saves a correction as a new revision of the meal previewed', async () => {
    await show();
    await logMeal('300 ml milk');
    await enter('actually 250 ml');
    expect((await mealsOn(db, TODAY))[0]!.latest.revision).toBe(1);

    await click('Save correction');
    await until(() => expect(noticeText()).toBe('Saved. Milk is now 250 mL.'));
    const [meal] = await mealsOn(db, TODAY);
    expect(meal!.latest.revision).toBe(2);
    expect(meal!.latest.components[0]!.served).toEqual({ amount: 250, unit: 'mL' });
  });

  it('explains a conflict and keeps the correction open when the meal changed underneath it', async () => {
    await show();
    await logMeal('300 ml milk');
    await enter('actually 250 ml');
    const [meal] = await mealsOn(db, TODAY);
    const milk = meal!.latest.components[0]!;
    await commitEdit(db, { mealId: meal!.header.mealId, expectedRevision: 1, operationKey: 'another-screen', savedAt: '2026-11-09T02:00:00Z', edit: { kind: 'update_component', componentId: milk.id, served: { amount: 200, unit: 'mL' }, eatenFraction: 1 } }, new Map(currentFoods.map((food) => [foodKey(food.id, food.version), food])));

    await click('Save correction');
    await until(() => expect(noticeText()).toBe('This meal changed since the preview (now revision 2). The preview is updated; check it and save again.'));
    expect(screenText()).toContain('Save correction');
    expect((await mealsOn(db, TODAY))[0]!.latest.components[0]!.served).toEqual({ amount: 200, unit: 'mL' });
  });

  it('logs sleep once it is confirmed', async () => {
    await show();
    await enter('slept 23:30 to 7');
    expect(await logsOn(db, 'sleep', TODAY)).toEqual([]);

    await click('Save sleep to today');
    await until(() => expect(noticeText()).toBe('Saved sleep to today.'));
    expect(await logsOn(db, 'sleep', TODAY)).toHaveLength(1);
    expect(screenText()).not.toContain('Save sleep to today');
  });

  it('logs training once it is confirmed', async () => {
    await show();
    await enter('row 3x8 at 5kg each hand');
    expect(await logsOn(db, 'workouts', TODAY)).toEqual([]);

    await click('Save training to today');
    await until(() => expect(noticeText()).toBe('Saved Row to today.'));
    expect(await logsOn(db, 'workouts', TODAY)).toHaveLength(1);
    expect(screenText()).not.toContain('Save training to today');
  });

  it('puts a food made for a draft row straight into that row', async () => {
    await show();
    await enter('200 g fictional dumpling');
    expect(button('Save meal to today').disabled).toBe(true);

    await click('Enter nutrition manually');
    const energy = [...container.querySelectorAll('.sheet label.field')].find((field) => field.textContent?.startsWith('Energy'))!.querySelector('input')!;
    await setValue(energy, '250');
    await click('Save food');
    await until(() => expect(container.querySelector('.sheet')).toBeNull());
    await show();
    expect(button('Save meal to today').disabled).toBe(false);

    await click('Save meal to today');
    await until(() => expect(noticeText()).toBe('Saved to today.'));
    const added = currentFoods.at(-1)!;
    expect((await mealsOn(db, TODAY))[0]!.latest.components[0]).toMatchObject({ foodId: added.id, served: { amount: 200, unit: 'g' } });
  });
});

describe('the meal sheet from the diary', () => {
  it('starts a draft for today from a meal on another day, saving nothing yet', async () => {
    await show();
    await click('Previous day');
    await settle();
    await logMeal('300 ml milk', formatDiaryDate(YESTERDAY));
    await openMeal();
    await click('Log again today');
    await settle();

    expect(dateTitle()).toBe(formatDiaryDate(TODAY));
    expect(container.querySelector('.sheet')).toBeNull();
    expect(button('Save meal to today').disabled).toBe(false);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(await mealsOn(db, TODAY)).toEqual([]);
  });

  it('reloads the day after the sheet changes a meal', async () => {
    await show();
    await logMeal('300 ml milk');
    await openMeal();
    await click('Delete meal');
    await click('Tap again to delete');
    await until(() => expect(container.querySelector('.sheet')?.textContent).toContain('This meal is deleted'));
    await click('Close');
    await settle();

    expect(container.querySelector('.timeline')?.textContent).toContain('Restore');
  });
});
