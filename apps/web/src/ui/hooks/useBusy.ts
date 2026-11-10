import { useState } from 'react';
import { errorText } from '../format';

/**
 * Return what a card needs to run one slow action: whether it is running, and what went wrong.
 *
 * The button is disabled while `busy`, and a thrown error becomes a sentence to show.
 * `setError` is returned too, because a form checks its own fields before it runs anything.
 * A save that needs an operation key and a conflict notice uses `useSave` instead.
 */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Run one action, clearing the last error first and showing a new one if it throws.
   */
  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}
