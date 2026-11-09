import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MinutesRing } from './MinutesRing';

it('keeps ordinary minute labels exact', () => {
  const markup = renderToStaticMarkup(createElement(MinutesRing, { used: 60, available: 60 }));
  expect(markup).toContain('>60</strong>');
});

it('compacts large ring labels while keeping the exact accessible total', () => {
  // Found at phone width while verifying the new uncapped duration input.
  const markup = renderToStaticMarkup(createElement(MinutesRing, { used: 1_000_000_007, available: 1_000_000_007 }));
  expect(markup).toContain('>1B</strong>');
  expect(markup).toContain('aria-label="1000000007 of 1000000007 minutes planned"');
});
