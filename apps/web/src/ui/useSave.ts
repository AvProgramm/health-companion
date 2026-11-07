import { useRef, useState } from 'react';

export type Notice = { kind: 'saved' | 'conflict' | 'error'; text: string };

/**
 * Return what a card needs to save safely.
 *
 * One operation key covers one intended save: a double tap or a retry after an
 * error reuses it (so storage replays instead of saving twice), and only a
 * successful save replaces it.
 */
export function useSave() {
  const operationKey = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  /**
   * Run one save and show its outcome; a thrown error becomes an error notice.
   */
  async function run(save: (operationKey: string) => Promise<Notice>): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await save(operationKey.current);
      setNotice(outcome);
      // Only a success uses up the key; a conflict or error keeps it for the retry
      if (outcome.kind === 'saved') {
        operationKey.current = crypto.randomUUID();
      }
      return outcome.kind === 'saved';
    } catch (problem) {
      setNotice({ kind: 'error', text: errorText(problem) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, notice, run };
}

/**
 * Return an error as a sentence the page can show.
 */
export function errorText(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem);
}
