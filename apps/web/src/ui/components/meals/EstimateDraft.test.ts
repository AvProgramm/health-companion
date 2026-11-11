// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateDraft } from './EstimateDraft';
import { parseEntry } from '../../../domain/parsing/parseEntry';
import { toDraftRow } from './DraftCard';
import { DraftCard } from './DraftCard';
import { FoodEditor } from './FoodEditor';
import { estimatedFood, readEstimate } from '../../../domain/nutrition/estimates';
import { NUTRIENT_KEYS } from '../../../domain/nutrition/types';

// A fictional response makes the confirmation test independent of a provider.
const proposal = {
  basis: { amount: 50, unit: 'g' },
  nutrients: { kcal: 60, protein_g: null, fat_g: null, satfat_g: null, total_sugar_g: null, added_sugar_g: null },
  range: { kcal: { low: 50, high: 70 }, protein_g: null, fat_g: null, satfat_g: null, total_sugar_g: null, added_sugar_g: null },
  sourceKind: 'database', reason: 'Two fictional matches.',
  sources: [{ provider: 'USDA', description: 'Fictional oats', url: 'https://example.org/food' }],
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Tap one visible action and flush its request. */
async function tap(label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe('estimate draft', () => {
  // Reported on the phone on 7 Nov: the card showed only protein and fat, and sources as links
  it('lists every tracked nutrient, says which are unknown, and shows sources as plain text', async () => {
    const full = {
      ...proposal,
      nutrients: { ...proposal.nutrients, protein_g: 6, fat_g: 3.5, satfat_g: 0.6, total_sugar_g: 0.5 },
      range: { ...proposal.range, protein_g: { low: 5, high: 7 }, fat_g: { low: 3, high: 4 }, satfat_g: { low: 0.5, high: 0.7 }, total_sugar_g: { low: 0.4, high: 0.6 } },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => full }));
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: false, onUse: vi.fn(), onEdit: vi.fn() })));
    for (const label of ['Protein', 'Fat', 'Saturated fat', 'Total sugar', 'Added sugar']) {
      expect(container.textContent).toContain(label);
    }
    // Added sugar was not given, so it reads Unknown rather than 0
    expect(container.querySelector('.estimate-macros')?.textContent).toContain('Added sugarUnknown');
    expect(container.querySelectorAll('.estimate-sources a')).toHaveLength(0);
  });

  it('estimates at once, and shows sources and a range without saving until Use estimate is tapped', async () => {
    const onUse = vi.fn().mockResolvedValue(undefined);
    const onEdit = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => proposal });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: false, onUse, onEdit })));
    // Asked for on the phone on 10 Nov: the estimate arrives without a tap, sending only the name and portion
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ name: 'Fictional oats', portionText: '50 g' });
    expect(container.textContent).toContain('60.0 kcal (50.0–70.0)');
    expect(container.textContent).toContain('USDA');
    expect(onUse).not.toHaveBeenCalled();
    await tap('Use estimate');
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse.mock.calls[0]![0].range.kcal).toEqual({ low: 50, high: 70 });
  });

  it('allows editing a proposal without accepting its values', async () => {
    const onUse = vi.fn();
    const onEdit = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => proposal }));
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: false, onUse, onEdit })));
    await tap('Edit');
    expect(onUse).not.toHaveBeenCalled();
    expect(onEdit.mock.calls[0]![0].source.kind).toBe('database');
  });

  it('keeps manual and unknown-value logging available when offline', async () => {
    const onUse = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: false, onUse, onEdit: vi.fn() })));
    await tap('Estimate nutrition');
    expect(container.textContent).toContain('Could not reach the laptop');
    expect(onUse).not.toHaveBeenCalled();
    await tap('Log with unknown values');
    expect(Object.values(onUse.mock.calls[0]![0].nutrients)).toEqual(NUTRIENT_KEYS.map(() => null));
    expect(onUse.mock.calls[0]![0].range).toBeUndefined();
  });

  it('hides all nutrient values when numbers are hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => proposal }));
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: true, onUse: vi.fn(), onEdit: vi.fn() })));
    expect(container.textContent).not.toContain('60.0');
    expect(container.textContent).toContain('USDA');
  });
});

describe('portions left open after a photo', () => {
  // Typed on the phone on 11 Nov. Look up a typical serving when the portion is open.
  it('automatically shows a typical serving without saving it', async () => {
    const typical = { ...proposal, basis: { amount: 1, unit: 'piece' } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => typical });
    const onUse = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => root.render(createElement(EstimateDraft, {
      name: 'salted rgg fish', portionText: '', hideNumbers: false, onUse, onEdit: vi.fn(),
    })));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name: 'salted rgg fish', portionText: '' });
    expect(container.textContent).toContain('For 1 typical serving');
    expect(onUse).not.toHaveBeenCalled();
  });

  // Reported on the phone on 11 Nov: the returned count had a generic piece basis.
  it.each([
    ['1 cup', 1, 'For 1 cup.'],
    ['3 slice', 3, 'For 3 slices.'],
    ['3 slice', 2, 'For 2 pieces.'],
  ])('shows the requested container %s only when its count matches', async (portionText, amount, label) => {
    const counted = { ...proposal, basis: { amount, unit: 'piece' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => counted }));
    await act(async () => root.render(createElement(EstimateDraft, {
      name: 'Fictional food', portionText, hideNumbers: false, onUse: vi.fn(), onEdit: vi.fn(),
    })));
    expect(container.querySelector('.estimate-result')?.textContent).toContain(label);
  });
});

describe('accepted and deferred estimate rows', () => {
  it('keeps an accepted estimate labelled with its source and range', async () => {
    const food = estimatedFood('Fictional oats', readEstimate(proposal), 'food');
    await act(async () => root.render(createElement(DraftCard, {
      rows: [{ key: 'row', text: '50 g Fictional oats', foodKey: 'food@1', amountText: '50', unit: 'g', eatenFraction: 1, problem: null }],
      foods: new Map([['food@1', food]]), currentFoods: [food], hideNumbers: false, dateLabel: 'today', busy: false,
      onRowsChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), onCreateFood: vi.fn(), onUseEstimate: vi.fn(), onEditEstimate: vi.fn(),
    })));
    expect(container.textContent).toContain('Database estimate');
    expect(container.textContent).toContain('60.0 kcal (50.0–70.0)');
    expect(container.textContent).not.toContain('50 g label');
  });

  it('offers estimation again for a food previously logged with unknown values', async () => {
    const food = { ...estimatedFood('Fictional oats', readEstimate(proposal), 'food'),
      nutrients: { kcal: null, protein_g: null, fat_g: null, satfat_g: null, total_sugar_g: null, added_sugar_g: null }, range: undefined };
    await act(async () => root.render(createElement(DraftCard, {
      rows: [{ key: 'row', text: 'Fictional oats', foodKey: 'food@1', amountText: '1', unit: 'g', eatenFraction: 1, problem: null }],
      foods: new Map([['food@1', food]]), currentFoods: [food], hideNumbers: false, dateLabel: 'today', busy: false,
      onRowsChange: vi.fn(), onSave: vi.fn(), onCancel: vi.fn(), onCreateFood: vi.fn(), onUseEstimate: vi.fn(), onEditEstimate: vi.fn(),
    })));
    expect(container.textContent).toContain('Estimate nutrition');
  });
});

describe('manual estimate editing', () => {
  it('seeds the editor but drops database attribution and ranges when values are edited', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initialFood = estimatedFood('Fictional oats', readEstimate(proposal), 'food');
    await act(async () => root.render(createElement(FoodEditor, { initialFood, onSave, onClose: vi.fn() })));
    expect(onSave).not.toHaveBeenCalled();
    const form = container.querySelector('form')!;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSave.mock.calls[0]![0].nutrients.kcal).toBe(60);
    expect(onSave.mock.calls[0]![0].source.kind).toBe('user_estimate');
    expect(onSave.mock.calls[0]![0].range).toBeUndefined();
  });

  it('keeps a scanned label as a label, and where it was found', async () => {
    // Found while testing on 9 Nov: a scanned Nutella saved with the badge "My estimate".
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initialFood = { ...estimatedFood('Fictional oats', readEstimate(proposal), 'food'), source: { kind: 'label' as const, reference: 'Open Food Facts: Fictional oats' } };
    await act(async () => root.render(createElement(FoodEditor, { initialFood, onSave, onClose: vi.fn() })));
    const form = container.querySelector('form')!;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onSave.mock.calls[0]![0].source).toEqual({ kind: 'label', reference: 'Open Food Facts: Fictional oats' });
  });
});

describe('phone estimate regression', () => {
  it('never offers Use estimate when the provider returned no nutrition', async () => {
    // Reported from the phone on 7 Nov: nasi lemak with empty portion text.
    const onUse = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...proposal,
      nutrients: Object.fromEntries(Object.keys(proposal.nutrients).map((key) => [key, null])),
      range: Object.fromEntries(Object.keys(proposal.range).map((key) => [key, null])),
    }) }));
    await act(async () => root.render(createElement(EstimateDraft, { name: 'nasi lemak', portionText: '', hideNumbers: false, onUse, onEdit: vi.fn() })));
    expect(container.textContent).toContain('No nutrition values');
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Use estimate')).toBe(false);
    expect(onUse).not.toHaveBeenCalled();
  });
});


describe('counted photo containers', () => {
  it.each([
    ['2 bowls of dal', 'dal', '2 bowl'],
    ['half bowl of dal', 'dal', '0.5 bowl'],
    ['2 cups of rice', 'rice', '2 cup'],
    ['12 almonds', 'almonds', '12 piece'],
    ['150 g rice', 'rice', '150 g'],
    ['bowl noodles', 'bowl noodles', ''],
  ])('keeps the typed portion from %s through review', async (entry, name, portionText) => {
    // Reported in the 10 Nov handover: "2 bowls of dal" lost its count before lookup.
    const parsed = parseEntry(entry, []);
    if (parsed.kind !== 'meal') throw new Error('Expected a meal draft.');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => proposal });
    const onUseEstimate = vi.fn();
    const onSave = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => root.render(createElement(DraftCard, {
      rows: parsed.items.map(toDraftRow), foods: new Map(), currentFoods: [], hideNumbers: false, dateLabel: 'today', busy: false,
      onRowsChange: vi.fn(), onSave, onCancel: vi.fn(), onCreateFood: vi.fn(), onUseEstimate, onEditEstimate: vi.fn(),
    })));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ name, portionText });
    expect(onUseEstimate).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
