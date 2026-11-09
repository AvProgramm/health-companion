// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstRunSetup } from './FirstRunSetup';

let root: Root;
let container: HTMLDivElement;
const onSave = vi.fn(async () => {});
const onRestoreInstead = vi.fn();

/** Display the setup screen. */
async function show(hideNumbers = false) {
  await act(async () => root.render(createElement(FirstRunSetup, { hideNumbers, currentYear: 2026, onSave, onRestoreInstead })));
}

/** Type into a field using the native setter so React receives a real change. */
async function type(selector: string, text: string) {
  const field = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Press the save button. */
async function submit() {
  await act(async () => container.querySelector<HTMLFormElement>('form')!.requestSubmit());
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('first-run setup', () => {
  it('refuses to continue without height and weight', async () => {
    await show();
    await submit();
    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/[Hh]eight/);
  });

  it('refuses a weight typed in the wrong unit', async () => {
    await show();
    await type('#body-height', '175');
    await type('#body-weight', '5');
    await submit();
    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/kilograms/);
  });

  it('shows BMI as you type and leaves other estimates unknown', async () => {
    await show();
    await type('#body-height', '175');
    await type('#body-weight', '70');
    expect(container.textContent).toContain('22.9');
    expect(container.textContent).toContain('within the usual range');
    expect(container.textContent).toContain('Unknown');
  });

  it('saves height and weight alone, with the optional facts unknown', async () => {
    await show();
    await type('#body-height', '175');
    await type('#body-weight', '70');
    await submit();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0] as unknown[])[0]).toEqual({ heightCm: 175, weightKg: 70, birthYear: null, sex: null, activity: null });
  });

  it('hides the numbers when the person has asked for that', async () => {
    await show(true);
    await type('#body-height', '175');
    await type('#body-weight', '70');
    expect(container.textContent).not.toContain('22.9');
  });

  it('offers a way to restore a backup instead', async () => {
    await show();
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Restore a backup')!.click());
    expect(onRestoreInstead).toHaveBeenCalledTimes(1);
  });
});
