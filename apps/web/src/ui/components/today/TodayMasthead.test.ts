import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TodayMasthead } from './TodayMasthead';

/** Return the masthead's markup for one fictional day's energy. */
function render(energy: Parameters<typeof TodayMasthead>[0]['energy'], hideNumbers = false) {
  return renderToStaticMarkup(createElement(TodayMasthead, { date: '2026-11-16', today: '2026-11-16', energy, hideNumbers, onDateChange: () => {} }));
}

describe('energy so far above the date', () => {
  it('sits before the date and shows the kcal eaten so far', () => {
    const markup = render({ known: 640.4, knownItems: 2, unknownItems: 0 });
    expect(markup).toContain('640 kcal');
    expect(markup.indexOf('energy-so-far')).toBeLessThan(markup.indexOf('date-title'));
  });

  it('says nothing was logged on an empty day instead of 0 kcal', () => {
    expect(render(null)).toContain('Nothing logged');
    expect(render(null)).not.toContain('0 kcal');
  });

  it('keeps the number hidden when numbers are hidden', () => {
    expect(render({ known: 640, knownItems: 2, unknownItems: 0 }, true)).not.toContain('640');
  });
});
