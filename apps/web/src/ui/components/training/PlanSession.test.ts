// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PlanSession } from './PlanSession';
import type { MovementCard } from '../../../domain/training/catalogue';

// Keep every movement fictional and make the added band choice distinct from starter equipment.
const body: MovementCard = { id: 'fictional-body', name: 'Fictional body movement', category: 'push', equipment: [], requires: [], minutes: 5, cue: 'Fictional cue.' };
const band: MovementCard = { ...body, id: 'free-exercise-db:fictional-band', name: 'Fictional band row', category: 'pull', equipment: ['band'] };
const bar: MovementCard = { ...body, id: 'fictional-bar', name: 'Fictional bar movement', category: 'pull', equipment: ['pull_up_bar'] };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

/** Render a supplied pool without using the real exercise catalogue. */
async function render(cards: readonly MovementCard[]) {
  await act(async () => root.render(createElement(PlanSession, { db: {} as IDBDatabase, cards, onSaved: () => {} })));
}

/** Click a real form control so React handles its change normally. */
async function click(selector: string) {
  const control = container.querySelector<HTMLInputElement | HTMLButtonElement>(selector);
  expect(control).not.toBeNull();
  await act(async () => control!.click());
}

it('plans only over the supplied pool and clears a result when that pool changes', async () => {
  await render([body]);
  await click('button[type="submit"]');
  expect(container.querySelector('.gym-plan-result')?.textContent).toContain(body.name);
  expect(container.textContent).toContain('Compared 1 planning options');
  await render([]);
  expect(container.querySelector('.gym-plan-result')).toBeNull();
});

it('replaces the phone-reported equipment and capability checklists with two session modes', async () => {
  // Requested from the phone screenshot on 7 Nov: retain What to train, remove You cannot do.
  await render([body, band, bar]);
  expect(container.textContent).not.toContain('Equipment you have');
  expect(container.textContent).not.toContain('You cannot do');
  expect(container.textContent).toContain('What to train');
  expect(container.textContent).toContain('Without equipment');
  expect(container.textContent).toContain('With equipment');
  expect(container.querySelector<HTMLInputElement>('input[value="without"]')?.checked).toBe(true);
});

it('excludes equipment movements in without-equipment mode', async () => {
  await render([body, band, bar]);
  await click('button[type="submit"]');
  const plan = container.querySelector('.gym-plan-result')?.textContent;
  expect(plan).toContain(body.name);
  expect(plan).not.toContain(band.name);
  expect(plan).not.toContain(bar.name);
});

it('suggests gear from added exercises and keeps other equipment unavailable until selected', async () => {
  await render([body, band, bar]);
  await click('input[value="with"]');
  expect(container.querySelector<HTMLInputElement>('input[value="band"]')?.checked).toBe(true);
  expect(container.querySelector<HTMLInputElement>('input[value="pull_up_bar"]')?.checked).toBe(false);
  await click('button[type="submit"]');
  const plan = container.querySelector('.gym-plan-result')?.textContent;
  expect(plan).toContain(band.name);
  expect(plan).not.toContain(bar.name);
  // Ignore a stale equipment plan because switching mode changes what is available today.
  await click('input[value="without"]');
  expect(container.querySelector('.gym-plan-result')).toBeNull();
  await click('button[type="submit"]');
  expect(container.querySelector('.gym-plan-result')?.textContent).not.toContain(band.name);
});

it('asks for actual gear when the pool has no added equipment choices', async () => {
  await render([body, bar]);
  await click('input[value="with"]');
  await click('button[type="submit"]');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Choose the equipment available today');
  expect(container.querySelector('.gym-plan-result')).toBeNull();
});


it('labels an underfilled sixty-minute request as a partial session', async () => {
  await render([body]);
  await click('input[name="repeatRounds"]');
  const input = container.querySelector('input[inputmode="numeric"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '60');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('button[type="submit"]');
  expect(container.querySelector('.gym-plan-result')?.textContent).toContain('55 min unfilled');
  expect(container.querySelector('.gym-plan-result')?.textContent).toContain('A partial session');
});


it('repeats reviewed blocks by default and clears the plan when repetition is turned off', async () => {
  await render([body]);
  await click('button[type="submit"]');
  expect(container.querySelector('.gym-plan-result')?.textContent).toContain('20 of 20 min');
  expect(container.querySelector('.gym-plan-result')?.textContent).toContain('4 full rounds');
  await click('input[name="repeatRounds"]');
  expect(container.querySelector('.gym-plan-result')).toBeNull();
});
