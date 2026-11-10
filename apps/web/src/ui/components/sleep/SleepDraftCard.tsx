import { useRef, useState } from 'react';
import { Field } from '../shared/Field';
import { buildSleep, formatDuration, resolveSleep, type ClockTime, type SleepInterval } from '../../../domain/sleep/sleep';
import { saveLogEntry } from '../../../storage/logsRepo';
import { formatDiaryDate, readAmount } from '../../format';
import { NoticeLine } from '../shared/NoticeLine';
import { useSave } from '../../hooks/useSave';

interface SleepDraftCardProps {
  db: IDBDatabase;
  date: string;
  dateLabel: string;
  zone: string;
  bed: ClockTime | null;
  wake: ClockTime | null;
  asleepMin: number | null;
  onSaved: (text: string) => void;
  onCancel: () => void;
}

/**
 * The "Review sleep, not saved yet" card: confirm the two times, see the interval, save once.
 *
 * Typed times are first read with the am/pm rules, then shown as exact 24-hour
 * times the user can correct before saving.
 */
export function SleepDraftCard({ db, date, dateLabel, zone, bed, wake, asleepMin, onSaved, onCancel }: SleepDraftCardProps) {
  const typed = bed !== null && wake !== null ? safeResolve(date, bed, wake) : null;
  const [bedText, setBedText] = useState(typed?.bedTime ?? '');
  const [wakeText, setWakeText] = useState(typed?.wakeTime ?? '');
  const [asleepText, setAsleepText] = useState(asleepMin === null ? '' : String(Number((asleepMin / 60).toFixed(2))));
  const { busy, notice, run } = useSave();

  // One ID per draft, so a retried save is recognised as the same entry
  const entryId = useRef(crypto.randomUUID());

  // The interval the two pickers describe right now
  const interval = bedText !== '' && wakeText !== '' ? safeResolve(date, pickedTime(bedText), pickedTime(wakeText)) : null;
  const asleepHours = readAmount(asleepText);

  /**
   * Save the sleep under the date it ended.
   */
  async function save() {
    if (interval === null) {
      return;
    }
    const saved = await run(async (operationKey) => {
      const entry = buildSleep(interval, asleepHours === null ? null : Math.round(asleepHours * 60), {
        id: entryId.current,
        operationKey,
        zone,
        savedAt: new Date().toISOString(),
      });
      await saveLogEntry(db, 'sleep', entry);
      return { kind: 'saved', text: `Saved sleep to ${dateLabel}.` };
    });
    if (saved) {
      onSaved(`Saved sleep to ${dateLabel}.`);
    }
  }

  return (
    <section className="card card-draft" aria-labelledby="sleep-heading">
      <div className="card-head">
        <h2 id="sleep-heading" className="heading">Review sleep</h2>
        <span className="badge badge-warn">Not saved yet</span>
      </div>

      <div className="grid-2">
        <Field label="Went to bed">
          <input className="input" type="time" value={bedText} onChange={(event) => setBedText(event.target.value)} />
        </Field>
        <Field label="Woke up">
          <input className="input" type="time" value={wakeText} onChange={(event) => setWakeText(event.target.value)} />
        </Field>
      </div>

      {interval === null ? (
        <p className="field-error">Add when you went to bed and when you woke up.</p>
      ) : (
        <p className="body numbers">
          In bed {formatDiaryDate(interval.bedDate)} {interval.bedTime} → {interval.wakeTime}: <strong>{formatDuration(interval.timeInBedMin)}</strong>.
          Counted under {dateLabel}, the day you woke.
        </p>
      )}

      <Field label="Hours actually asleep (optional)" hint="Leave blank if you are not sure. Time in bed is not counted as sleep.">
        <input className="input input-short" inputMode="decimal" value={asleepText} onChange={(event) => setAsleepText(event.target.value)} />
      </Field>

      <NoticeLine notice={notice} />

      <div className="actions">
        <button type="button" className="button" disabled={busy || interval === null} onClick={save}>
          {busy ? 'Saving…' : `Save sleep to ${dateLabel}`}
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Discard</button>
      </div>
    </section>
  );
}

/**
 * Return a time picker's "HH:MM" as an exact 24-hour clock time.
 */
function pickedTime(text: string): ClockTime {
  const [hour, minute] = text.split(':').map(Number);
  return { hour: hour ?? Number.NaN, minute: minute ?? Number.NaN, meridiem: '24h' };
}

/**
 * Return the interval, or null when the times cannot be read.
 */
function safeResolve(date: string, bed: ClockTime, wake: ClockTime): SleepInterval | null {
  try {
    return resolveSleep(date, bed, wake);
  } catch {
    return null;
  }
}
