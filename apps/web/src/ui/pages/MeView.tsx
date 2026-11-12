import { useEffect, useState, type ChangeEvent } from 'react';
import type { BackupCheck } from '../../data/storage/backup/format';
import { exportDiary, restoreDiary, wipeDiary } from '../../data/storage/backup/transfer';
import { validateBackup } from '../../data/storage/backup/validate';
import { countMeals } from '../../data/storage/mealsRepo';
import type { Durability } from '../../data/storage/persistence';
import type { Profile, ProfileSnapshot } from '../../domain/profile/profile';
import { ProfileEditor } from '../components/me/ProfileEditor';
import { AccountCard } from '../components/me/AccountCard';
import { BodyCard } from '../components/me/BodyCard';
import { DURABILITY_TEXT, errorText } from '../format';
import { NoticeLine } from '../components/shared/NoticeLine';

interface MeViewProps {
  db: IDBDatabase;
  profileSnapshot: ProfileSnapshot | null;
  onSaveProfile: (value: Profile, operationKey: string, expectedVersion: number) => Promise<void>;
  durability: Durability;
  foodCount: number;
  hideNumbers: boolean;
  onHideNumbersChange: (hide: boolean) => void;
  onDiaryReplaced: () => Promise<void>;
  accountEmail: string;
  accountOffline: boolean;
  onSignOut: () => Promise<void>;
}

type Message = { kind: 'saved' | 'error'; text: string };

/**
 * Me: the account, storage status, backup and restore, display settings and erase.
 */
export function MeView({ db, profileSnapshot, onSaveProfile, durability, foodCount, hideNumbers, onHideNumbersChange, onDiaryReplaced, accountEmail, accountOffline, onSignOut }: MeViewProps) {
  const [mealCount, setMealCount] = useState<number | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [pending, setPending] = useState<Extract<BackupCheck, { ok: true }> | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Read the counts and the browser's storage estimate
  useEffect(() => {
    countMeals(db).then(setMealCount, () => setMealCount(null));
    navigator.storage?.estimate?.().then(
      (estimate) => setUsage(estimate.usage === undefined ? null : `${(estimate.usage / 1024 / 1024).toFixed(1)} MB`),
      () => setUsage(null),
    );
  }, [db, busy]);

  /**
   * Download the whole diary as a JSON file.
   */
  async function handleExport() {
    setMessage(null);
    try {
      const backup = await exportDiary(db);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `health-companion-backup-${backup.exportedAt.slice(0, 10)}.json`;
      link.click();
      // Give the download a moment to start before releasing the file
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ kind: 'saved', text: `Backup downloaded: ${backup.meals.length} meals, ${backup.foods.length} food versions. Keep it somewhere other than this phone's browser.` });
    } catch (problem) {
      setMessage({ kind: 'error', text: errorText(problem) });
    }
  }

  /**
   * Read a chosen file and check it, without writing anything yet.
   */
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setMessage(null);
    setPending(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setMessage({ kind: 'error', text: 'That file is not readable JSON, so it cannot be a backup.' });
      return;
    }

    const check = validateBackup(data);
    if (!check.ok) {
      setMessage({ kind: 'error', text: `Nothing was restored. ${check.errors.join(' ')}` });
      return;
    }
    setPending(check);
  }

  /**
   * Replace this device's diary with the checked backup.
   */
  async function handleRestore() {
    if (pending === null) {
      return;
    }
    setBusy(true);
    try {
      const counts = await restoreDiary(db, pending);
      setPending(null);
      await onDiaryReplaced();
      setMessage({ kind: 'saved', text: `Restored ${counts.meals} meals, ${counts.foods} food versions and ${counts.customCards} exercise-choice snapshots and ${counts.profile} profile versions.` });
    } catch (problem) {
      setMessage({ kind: 'error', text: `Nothing was restored. ${errorText(problem)}` });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Permanently remove everything from this device.
   */
  async function handleErase() {
    setBusy(true);
    try {
      await wipeDiary(db);
      setConfirmErase(false);
      await onDiaryReplaced();
      setMessage({ kind: 'saved', text: 'Everything on this device was erased.' });
    } catch (problem) {
      setMessage({ kind: 'error', text: errorText(problem) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="masthead">
        <h1 className="title">Me</h1>
        <p className="status">Your saved profile and diary stay on this device. Optional services receive only the text and choices you submit.</p>
      </header>

      <NoticeLine notice={message} />

      <AccountCard email={accountEmail} offline={accountOffline} onSignOut={onSignOut} />
      <ProfileEditor snapshot={profileSnapshot} onSave={onSaveProfile} />
      <BodyCard db={db} snapshot={profileSnapshot} hideNumbers={hideNumbers} currentYear={new Date().getFullYear()} onSave={onSaveProfile} />

      <section className="card" aria-labelledby="storage-heading">
        <h2 id="storage-heading" className="heading">Storage</h2>
        <p className="body">{DURABILITY_TEXT[durability]}</p>
        <p className="hint numbers">
          {mealCount === null ? 'Counting…' : `${mealCount} ${mealCount === 1 ? 'meal' : 'meals'}`} · {foodCount} {foodCount === 1 ? 'food' : 'foods'}
          {usage !== null && ` · ${usage} used`}
        </p>
      </section>

      <section className="card" aria-labelledby="backup-heading">
        <h2 id="backup-heading" className="heading">Backup</h2>
        <p className="hint">A backup includes your diary, exercise choices and saved profile history. Keep the file private. Restoring replaces what is on this device.</p>
        <div className="row">
          <button type="button" className="button" onClick={handleExport}>Download backup</button>
          <label className="button button-secondary file-button">
            Restore from file
            <input type="file" accept="application/json,.json" onChange={handleFile} className="visually-hidden" />
          </label>
        </div>

        {pending !== null && (
          <div className="confirm">
            <p className="body">
              This backup from {new Date(pending.backup.exportedAt).toLocaleString('en-AU')} has {pending.counts.meals} meals ({pending.counts.revisions} revisions) and {pending.counts.foods} food versions, plus {pending.counts.customCards} exercise-choice snapshots and {pending.counts.profile} profile versions.
              Restoring replaces the {mealCount ?? 'current'} meals on this device.
            </p>
            <div className="row">
              <button type="button" className="button button-danger" disabled={busy} onClick={handleRestore}>{busy ? 'Restoring…' : 'Replace my diary with this backup'}</button>
              <button type="button" className="button button-quiet" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="display-heading">
        <h2 id="display-heading" className="heading">Display</h2>
        <label className="choice">
          <input type="checkbox" checked={hideNumbers} onChange={(event) => onHideNumbersChange(event.target.checked)} />
          Hide calorie and nutrient numbers
        </label>
        <p className="hint">Amounts and foods stay visible. Totals and answers say that numbers are hidden.</p>
      </section>

      <section className="card" aria-labelledby="erase-heading">
        <h2 id="erase-heading" className="heading">Erase</h2>
        <p className="hint">Removes the diary, exercise choices and saved profile history from this device. It cannot be undone; download a backup first if you might want them.</p>
        {confirmErase ? (
          <div className="row">
            <button type="button" className="button button-danger" disabled={busy} onClick={handleErase}>Tap again to erase everything</button>
            <button type="button" className="button button-quiet" onClick={() => setConfirmErase(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="button button-quiet" onClick={() => setConfirmErase(true)}>Erase everything on this device</button>
        )}
      </section>
    </>
  );
}
