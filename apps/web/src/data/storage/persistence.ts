/**
 * Ask the browser to keep the diary, and report honestly whether it agreed.
 *
 * Chrome can clear "best effort" site data when the phone runs low on storage.
 * persist() may return false (or be missing), and saving must still work then;
 * the page simply tells the user that a backup matters.
 */

export type Durability = 'persistent' | 'best-effort' | 'unknown';

/**
 * Return whether the browser has already granted persistent storage.
 */
export async function readDurability(storage: StorageManager | undefined = navigator.storage): Promise<Durability> {
  // Ignore a browser without the Storage API rather than guessing
  if (storage?.persisted === undefined) {
    return 'unknown';
  }
  try {
    return (await storage.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}

/**
 * Ask for persistent storage and return the result.
 *
 * Chrome decides without a prompt, based on how the site is used, so "false"
 * is a normal answer, not an error.
 */
export async function requestDurability(storage: StorageManager | undefined = navigator.storage): Promise<Durability> {
  if (storage?.persist === undefined) {
    return 'unknown';
  }
  try {
    return (await storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}
