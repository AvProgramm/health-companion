// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { EMPTY_PROFILE } from '../domain/profile/profile';
import { requestTrainerPlan } from '../api/trainer';
import { TrainerCard } from './TrainerCard';
import type { TrainerReply } from '../domain/training/trainerPlan';

vi.mock('../api/trainer', () => ({ requestTrainerPlan: vi.fn() }));

/** Type a fictional goal through the same event boundary as the browser. */
async function submit(container: HTMLElement) {
  await act(async () => {
    const input = container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Fictional session for a UI test.');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => (container.querySelector('button[type="submit"]') as HTMLButtonElement).click());
}

it('never sends the saved profile and filters the model proposal on the device', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(requestTrainerPlan).mockResolvedValue({ exerciseIds: [], source: 'library', reason: 'Fictional proposal.' });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(TrainerCard, { entries: [], profile: { ...EMPTY_PROFILE, seatedOnly: true, avoidAreas: ['knees'], diabetes: true } })));
    await submit(container);
    expect(requestTrainerPlan).toHaveBeenCalledWith({ goal: 'Fictional session for a UI test.', minutes: 45, equipment: [], areas: ['push', 'pull', 'legs', 'core'], level: 'intermediate' });
    expect(container.querySelector('.gym-plan-result')?.textContent).toContain('Seated arm raise');
    expect(container.querySelector('.gym-plan-result')?.textContent).not.toContain('Seated marching');
  } finally { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); }
});

it('ignores an answer that arrives after the saved profile changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let resolveReply!: (reply: TrainerReply) => void;
  vi.mocked(requestTrainerPlan).mockImplementation(() => new Promise(resolve => { resolveReply = resolve; }));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(TrainerCard, { entries: [], profile: EMPTY_PROFILE })));
    await submit(container);
    await act(async () => root.render(createElement(TrainerCard, { entries: [], profile: { ...EMPTY_PROFILE, seatedOnly: true } })));
    await act(async () => resolveReply({ exerciseIds: [], source: 'library', reason: 'Stale fictional answer.' }));
    expect(container.textContent).not.toContain('Stale fictional answer.');
    expect(container.querySelector('.gym-plan-result')).toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); }
});
