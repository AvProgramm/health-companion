import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { NUTRIENT_KEYS } from '../domain/nutrition/types';
import type { DaySummary } from '../domain/nutrition/day';
import { DaySummaryCard } from './DaySummaryCard';

it('promotes all three priorities while keeping an unknown apart from a true zero', () => {
  // Use fictional totals with no underlying meal or health history.
  const totals = Object.fromEntries(NUTRIENT_KEYS.map(key => [key, { known: 0, knownItems: 0, unknownItems: 1 }])) as DaySummary['totals'];
  totals.added_sugar_g = { known: 0, knownItems: 1, unknownItems: 0 };
  const markup = renderToStaticMarkup(createElement(DaySummaryCard, { diabetes: true, hideNumbers: false, dateLabel: 'fictional day',
    summary: { date: '2026-11-08', mealCount: 1, coverage: 'some_entries', totals } }));
  const labels = [...markup.matchAll(/<dt>([^<]+)<\/dt>/g)].map(match => match[1]);
  expect(labels.slice(0, 3)).toEqual(['Carbohydrate', 'Added sugar', 'Fibre']);
  expect(markup).toContain('Unknown');
  expect(markup).toContain('0.0 g');
  expect(labels).toHaveLength(8);
});
