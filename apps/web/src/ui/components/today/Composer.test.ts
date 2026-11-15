// @vitest-environment jsdom
import { act, createElement, type FormEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

let container: HTMLDivElement;
let root: Root;
let onSubmit: ReturnType<typeof vi.fn<(event: FormEvent) => void>>;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  // Stop the form's default submit, as the page's own handler does
  onSubmit = vi.fn<(event: FormEvent) => void>((event) => event.preventDefault());
  await act(async () => root.render(createElement(Composer, { text: 'nasi lemak', onTextChange: () => {}, reviewing: false, onSubmit, onAddManually: () => {} })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** Press a key in the entry box, as a keyboard or an input method would. */
async function pressKey(options: KeyboardEventInit) {
  const box = container.querySelector<HTMLTextAreaElement>('#composer')!;
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options }));
  });
}

it('sends the entry on Enter, and keeps Shift+Enter for a new line', async () => {
  await pressKey({ key: 'Enter', shiftKey: true });
  expect(onSubmit).not.toHaveBeenCalled();

  await pressKey({ key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

it('does not send while an input method is still composing a word', async () => {
  // Found by the Modern Web Guidance scan on 15 Nov: Enter that confirms a Chinese,
  // Japanese or Korean candidate must not submit the half-typed entry
  await pressKey({ key: 'Enter', isComposing: true });
  expect(onSubmit).not.toHaveBeenCalled();
});
