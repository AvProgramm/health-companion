// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { PlanSession } from './PlanSession';
import type { MovementCard } from '../domain/training/catalogue';

it('plans only over the supplied pool and clears a result when that pool changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // Use a fictional card which cannot be found in the starter or imported catalogue.
  const card: MovementCard = { id: 'fictional', name: 'Fictional chosen row', category: 'pull', equipment: [], requires: [], minutes: 5, cue: 'Fictional cue.' };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(PlanSession, { cards: [card] })));
    await act(async () => container.querySelector('button[type="submit"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('Fictional chosen row');
    expect(container.textContent).toContain('Best of 1 possible sessions');
    // Ignore the earlier result because a removed choice must not remain in the suggested plan.
    await act(async () => root.render(createElement(PlanSession, { cards: [] })));
    expect(container.textContent).not.toContain('Fictional chosen row');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
