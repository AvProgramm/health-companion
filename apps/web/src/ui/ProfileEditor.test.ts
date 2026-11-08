// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ProfileEditor } from './ProfileEditor';

it('keeps local adaptations as a draft until explicit confirmation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onSave = vi.fn().mockResolvedValue(undefined);
  try {
    await act(async () => root.render(createElement(ProfileEditor, { snapshot: null, onSave })));
    await act(async () => (container.querySelector('input[name="seatedOnly"]') as HTMLInputElement).click());
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => (container.querySelector('button[type="submit"]') as HTMLButtonElement).click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ seatedOnly: true, diabetes: false });
    expect(onSave.mock.calls[0]![2]).toBe(0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
