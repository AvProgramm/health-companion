// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { deleteAccountBackup, loadAccountBackup, readAccountBackupStatus, saveAccountBackup } from '../../../data/api/accountBackup';
import { ServiceError } from '../../../data/api/post';
import { exportDiary } from '../../../data/storage/backup/transfer';
import { DIARY_NAME, openDiary } from '../../../data/storage/connection';
import { saveFoodVersion } from '../../../data/storage/foodsRepo';
import { MILK, RICE, WEETABIX } from '../../../test/testFoods';
import { AccountBackupCard } from './AccountBackupCard';

// Replace the service boundary, so no test sends a request
vi.mock('../../../data/api/accountBackup');

// When and how large the fictional account copy is
const STATUS = { savedAt: '2026-11-09T10:00:00.000000+00:00', sizeBytes: 4096 };

let db: IDBDatabase;
let container: HTMLDivElement;
let root: Root;
let onDiaryReplaced: ReturnType<typeof vi.fn<() => Promise<void>>>;

// A device diary holding one fictional food, shown on a fresh card
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  db = await openDiary(DIARY_NAME, new IDBFactory());
  await saveFoodVersion(db, MILK);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  onDiaryReplaced = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  vi.mocked(readAccountBackupStatus).mockResolvedValue(STATUS);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  db.close();
  vi.resetAllMocks();
});

/** Render the card and wait for its opening status check. */
async function renderCard() {
  await act(async () => root.render(createElement(AccountBackupCard, { db, onDiaryReplaced })));
}

/** Click the button with exactly this label, and wait for what it starts. */
async function press(label: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  if (button === undefined) {
    throw new Error(`No button reads "${label}". The card says: ${container.textContent}`);
  }
  // Let the storage transaction and the mocked service finish before the test reads the screen
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

/** Return a backup as the service would send it: another device's diary holding two fictional foods. */
async function backupFromAnotherDevice(): Promise<unknown> {
  const other = await openDiary(DIARY_NAME, new IDBFactory());
  await saveFoodVersion(other, RICE);
  await saveFoodVersion(other, WEETABIX);
  const backup = await exportDiary(other);
  other.close();
  return JSON.parse(JSON.stringify(backup));
}

/** Return the ids of the foods on this device, sorted. */
async function foodIdsOnDevice(): Promise<string[]> {
  return (await exportDiary(db)).foods.map((food) => food.id).sort();
}

it('shows when the account copy was last saved, and says what the copy is', async () => {
  await renderCard();
  expect(container.textContent).toContain(`Last saved to your account: ${new Date(STATUS.savedAt).toLocaleString('en-AU')}`);
  expect(container.textContent).toContain('4.0 KB');
  expect(container.textContent).toContain('a copy of this device\'s diary');
  expect(container.textContent).toContain('It is not live sync');
  expect(container.textContent).toContain('Saving again replaces the earlier copy');
});

it('says that no backup exists, and offers no restore or delete for it', async () => {
  vi.mocked(readAccountBackupStatus).mockResolvedValue(null);
  await renderCard();
  expect(container.textContent).toContain('No backup is saved for this account yet.');
  expect(container.textContent).not.toContain('Restore from my account');
  expect(container.textContent).not.toContain('Delete the account copy');
});

it('saves the same export the file backup uses, only after the button is pressed', async () => {
  vi.mocked(readAccountBackupStatus).mockResolvedValue(null);
  const newer = { savedAt: '2026-11-10T08:30:00.000000+00:00', sizeBytes: 2048 };
  vi.mocked(saveAccountBackup).mockResolvedValue(newer);
  await renderCard();
  expect(saveAccountBackup).not.toHaveBeenCalled();

  await press('Save backup to my account');
  expect(saveAccountBackup).toHaveBeenCalledTimes(1);
  const sent = vi.mocked(saveAccountBackup).mock.calls[0]![0];
  expect(sent).toEqual({ ...(await exportDiary(db)), exportedAt: (sent as { exportedAt: string }).exportedAt });
  expect(sent).toMatchObject({ format: 'health-companion-backup', foods: [{ id: MILK.id }] });
  expect(container.textContent).toContain('Backup saved to your account');
  expect(container.textContent).toContain(`Last saved to your account: ${new Date(newer.savedAt).toLocaleString('en-AU')}`);
});

it('asks before a save replaces an existing account copy', async () => {
  // A new, empty device must not overwrite a good copy with one tap
  vi.mocked(saveAccountBackup).mockResolvedValue(STATUS);
  await renderCard();

  await press('Save backup to my account');
  expect(saveAccountBackup).not.toHaveBeenCalled();
  expect(container.textContent).toContain('replaces the copy already saved');

  await press('Cancel');
  expect(saveAccountBackup).not.toHaveBeenCalled();

  await press('Save backup to my account');
  await press('Replace the account copy');
  expect(saveAccountBackup).toHaveBeenCalledTimes(1);
});

it('asks before a restore replaces the diary, then restores and reloads the screens', async () => {
  vi.mocked(loadAccountBackup).mockResolvedValue({ ...STATUS, backup: await backupFromAnotherDevice() });
  await renderCard();
  await press('Restore from my account');

  // Check nothing was written while the confirmation is showing
  expect(container.textContent).toContain('2 food versions');
  expect(await foodIdsOnDevice()).toEqual([MILK.id]);
  expect(onDiaryReplaced).not.toHaveBeenCalled();

  await press('Replace my diary with this backup');
  expect(await foodIdsOnDevice()).toEqual([RICE.id, WEETABIX.id].sort());
  expect(onDiaryReplaced).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Restored');
});

it('leaves the diary alone when the restore is cancelled', async () => {
  vi.mocked(loadAccountBackup).mockResolvedValue({ ...STATUS, backup: await backupFromAnotherDevice() });
  await renderCard();
  await press('Restore from my account');
  await press('Cancel');
  expect(container.textContent).not.toContain('Replace my diary with this backup');
  expect(await foodIdsOnDevice()).toEqual([MILK.id]);
  expect(onDiaryReplaced).not.toHaveBeenCalled();
});

it('refuses an invalid backup from the service with nothing written', async () => {
  const damaged = { ...(await backupFromAnotherDevice() as Record<string, unknown>), meals: 'fictional damage' };
  vi.mocked(loadAccountBackup).mockResolvedValue({ ...STATUS, backup: damaged });
  await renderCard();
  await press('Restore from my account');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Nothing was restored.');
  expect(container.textContent).not.toContain('Replace my diary with this backup');
  expect(await foodIdsOnDevice()).toEqual([MILK.id]);
  expect(onDiaryReplaced).not.toHaveBeenCalled();
});

it('asks the person to sign in again when the session has ended', async () => {
  const signedOut = new ServiceError('Sign in again to use your account backup.', 401);
  vi.mocked(readAccountBackupStatus).mockRejectedValue(signedOut);
  vi.mocked(saveAccountBackup).mockRejectedValue(signedOut);
  await renderCard();
  expect(container.textContent).toContain('Sign in again to use your account backup.');
  expect(container.textContent).not.toContain('No backup is saved');

  await press('Save backup to my account');
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Sign in again to use your account backup.');
});

it('deletes the account copy only after a second tap, leaving the device diary', async () => {
  vi.mocked(deleteAccountBackup).mockResolvedValue(undefined);
  await renderCard();
  await press('Delete the account copy');
  expect(deleteAccountBackup).not.toHaveBeenCalled();

  await press('Tap again to delete the account copy');
  expect(deleteAccountBackup).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('No backup is saved for this account yet.');
  expect(await foodIdsOnDevice()).toEqual([MILK.id]);
});
