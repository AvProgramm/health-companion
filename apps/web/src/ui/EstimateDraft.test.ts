// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateDraft } from './EstimateDraft';
import { DraftCard } from './DraftCard';
import { FoodEditor } from './FoodEditor';
import { estimatedFood, readEstimate } from '../domain/nutrition/estimates';

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
  it('shows sources and a range without saving until Use estimate is tapped', async () => {
    const onUse = vi.fn().mockResolvedValue(undefined);
    const onEdit = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => proposal });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: false, onUse, onEdit })));
    expect(fetchMock).not.toHaveBeenCalled();
    await tap('Estimate nutrition');
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
    await tap('Estimate nutrition');
    await tap('Edit');
    expect(onUse).not.toHaveBeenCalled();
    expect(onEdit.mock.calls[0]![0].source.kind).toBe('database');
  });

  it('keeps manual and unknown-value logging available when offline', async () => {
    const onUse = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: false, onUse, onEdit: vi.fn() })));
    await tap('Estimate nutrition');
    expect(container.textContent).toContain('Estimates need the laptop');
    expect(onUse).not.toHaveBeenCalled();
    await tap('Log with unknown values');
    expect(Object.values(onUse.mock.calls[0]![0].nutrients)).toEqual([null, null, null, null, null, null]);
    expect(onUse.mock.calls[0]![0].range).toBeUndefined();
  });

  it('hides all nutrient values when numbers are hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => proposal }));
    await act(async () => root.render(createElement(EstimateDraft, { name: 'Fictional oats', portionText: '50 g', hideNumbers: true, onUse: vi.fn(), onEdit: vi.fn() })));
    await tap('Estimate nutrition');
    expect(container.textContent).not.toContain('60.0');
    expect(container.textContent).toContain('USDA');
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
    await tap('Estimate nutrition');
    expect(container.textContent).toContain('No nutrition values');
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Use estimate')).toBe(false);
    expect(onUse).not.toHaveBeenCalled();
  });
});
