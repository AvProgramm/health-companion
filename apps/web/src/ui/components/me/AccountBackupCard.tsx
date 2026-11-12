import { useEffect, useState } from 'react';
import { deleteAccountBackup, loadAccountBackup, readAccountBackupStatus, saveAccountBackup, type AccountBackupStatus } from '../../../data/api/accountBackup';
import type { BackupCheck } from '../../../data/storage/backup/format';
import { exportDiary, restoreDiary } from '../../../data/storage/backup/transfer';
import { validateBackup } from '../../../data/storage/backup/validate';
import type { Notice } from '../../hooks/useSave';
import { errorText } from '../../format';
import { NoticeLine } from '../shared/NoticeLine';

interface AccountBackupCardProps {
  db: IDBDatabase;
  // Called after a restore replaced the diary, so every screen reloads what it shows
  onDiaryReplaced: () => Promise<void>;
}

// What the card knows about the account's copy: still asking, could not ask (with why), none saved, or its details
type CopyState = { kind: 'checking' } | { kind: 'unavailable'; reason: string } | { kind: 'none' } | { kind: 'saved'; status: AccountBackupStatus };

// The slow action in progress, so only its own button changes its label
type Action = 'save' | 'load' | 'restore' | 'delete';

/**
 * Display the copy of the diary kept with the account, with the ways to save, restore and delete it.
 *
 * Saving sends the same export the file backup downloads. Restoring goes through
 * validateBackup and the same one-transaction restore as a file, and only after the
 * person confirms, so a copy from the service can never replace the diary on its own.
 */
export function AccountBackupCard({ db, onDiaryReplaced }: AccountBackupCardProps) {
  const [copy, setCopy] = useState<CopyState>({ kind: 'checking' });
  const [pending, setPending] = useState<Extract<BackupCheck, { ok: true }> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Set when a save would replace a copy the account already holds, until the person confirms
  const [confirmSave, setConfirmSave] = useState(false);
  const [running, setRunning] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Ask once when the card opens; only the session cookie is sent, never the diary
  useEffect(() => {
    let current = true;
    readAccountBackupStatus().then(
      (status) => current && setCopy(status === null ? { kind: 'none' } : { kind: 'saved', status }),
      (problem) => current && setCopy({ kind: 'unavailable', reason: errorText(problem) }),
    );
    // Ignore an answer that arrives after the card closed because there is nothing left to update
    return () => { current = false; };
  }, []);

  /**
   * Run one slow action, showing what went wrong if it throws.
   */
  async function run(action: Action, work: () => Promise<void>, failurePrefix = '') {
    setNotice(null);
    setRunning(action);
    try {
      await work();
    } catch (problem) {
      setNotice({ kind: 'error', text: `${failurePrefix}${errorText(problem)}` });
    } finally {
      setRunning(null);
    }
  }

  /**
   * Send this device's diary to the account, replacing the earlier copy.
   */
  async function handleSave() {
    const backup = await exportDiary(db);
    const status = await saveAccountBackup(backup);
    setConfirmSave(false);
    setCopy({ kind: 'saved', status });
    setNotice({ kind: 'saved', text: `Backup saved to your account: ${backup.meals.length} meals, ${backup.foods.length} food versions. It replaced any earlier copy.` });
  }

  /**
   * Fetch the account's copy and check it, without writing anything yet.
   */
  async function handleLoad() {
    setPending(null);
    const loaded = await loadAccountBackup();
    const check = validateBackup(loaded.backup);
    if (!check.ok) {
      throw new Error(check.errors.join(' '));
    }
    setPending(check);
  }

  /**
   * Replace this device's diary with the checked copy, then reload the screens.
   */
  async function handleRestore() {
    // Ignore a tap with no checked copy because only a confirmed, validated backup may be written
    if (pending === null) {
      return;
    }
    const counts = await restoreDiary(db, pending);
    setPending(null);
    await onDiaryReplaced();
    setNotice({ kind: 'saved', text: `Restored ${counts.meals} meals, ${counts.foods} food versions, ${counts.customCards} exercise-choice snapshots and ${counts.profile} profile versions from your account.` });
  }

  /**
   * Remove the copy from the account; the diary on this device is not touched.
   */
  async function handleDelete() {
    await deleteAccountBackup();
    setConfirmDelete(false);
    setPending(null);
    setCopy({ kind: 'none' });
    setNotice({ kind: 'saved', text: 'The copy stored with your account was deleted. The diary on this device is unchanged.' });
  }

  const busy = running !== null;

  return (
    <section className="card" aria-labelledby="account-backup-heading">
      <h2 id="account-backup-heading" className="heading">Account backup</h2>
      <p className="hint">
        This stores a copy of this device's diary with your account on the service, so you can restore it on another device.
        It is not live sync: later changes stay on this device until you save again. Saving again replaces the earlier copy.
      </p>
      <p className="body numbers">{copyText(copy)}</p>
      <NoticeLine notice={notice} />

      <div className="row">
        <button type="button" className="button" disabled={busy} onClick={() => (copy.kind === 'saved' ? setConfirmSave(true) : run('save', handleSave))}>{running === 'save' ? 'Saving…' : 'Save backup to my account'}</button>
        {copy.kind !== 'none' && (
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => run('load', handleLoad, 'Nothing was restored. ')}>{running === 'load' ? 'Checking…' : 'Restore from my account'}</button>
        )}
      </div>

      {confirmSave && (
        <div className="confirm">
          <p className="body">Saving replaces the copy already saved with your account by this device's diary. If this device is new or empty, restore first.</p>
          <div className="row">
            <button type="button" className="button button-danger" disabled={busy} onClick={() => run('save', handleSave)}>{running === 'save' ? 'Saving…' : 'Replace the account copy'}</button>
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => setConfirmSave(false)}>Cancel</button>
          </div>
        </div>
      )}

      {pending !== null && (
        <div className="confirm">
          <p className="body">
            This backup from {new Date(pending.backup.exportedAt).toLocaleString('en-AU')} has {pending.counts.meals} meals ({pending.counts.revisions} revisions) and {pending.counts.foods} food versions, plus {pending.counts.customCards} exercise-choice snapshots and {pending.counts.profile} profile versions.
            Restoring replaces the diary on this device.
          </p>
          <div className="row">
            <button type="button" className="button button-danger" disabled={busy} onClick={() => run('restore', handleRestore, 'Nothing was restored. ')}>{running === 'restore' ? 'Restoring…' : 'Replace my diary with this backup'}</button>
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}

      {copy.kind === 'saved' && (confirmDelete ? (
        <div className="row">
          <button type="button" className="button button-danger" disabled={busy} onClick={() => run('delete', handleDelete)}>{running === 'delete' ? 'Deleting…' : 'Tap again to delete the account copy'}</button>
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button>
        </div>
      ) : (
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete the account copy</button>
      ))}
    </section>
  );
}

/**
 * Return the line that says what the account holds, rounding the size for display only.
 */
function copyText(copy: CopyState): string {
  if (copy.kind === 'checking') {
    return 'Checking your account backup…';
  }
  if (copy.kind === 'unavailable') {
    return copy.reason;
  }
  if (copy.kind === 'none') {
    return 'No backup is saved for this account yet.';
  }
  const { savedAt, sizeBytes } = copy.status;
  return `Last saved to your account: ${new Date(savedAt).toLocaleString('en-AU')} · ${(sizeBytes / 1024).toFixed(1)} KB`;
}
