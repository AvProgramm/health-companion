import { useEffect, useRef, useState } from 'react';
import type { BodyFacts } from '../../../domain/profile/body';
import type { Profile, ProfileSnapshot } from '../../../domain/profile/profile';
import { weightTrend, type WeightPoint } from '../../../domain/profile/weightTrend';
import { listProfileVersions } from '../../../storage/profileRepo';
import { BodyFactsForm, BodyNumbers } from './BodyFactsForm';
import { formatDiaryDate, errorText } from '../../format';

interface BodyCardProps {
  db: IDBDatabase;
  snapshot: ProfileSnapshot | null;
  hideNumbers: boolean;
  currentYear: number;
  onSave: (profile: Profile, operationKey: string, expectedVersion: number) => Promise<void>;
}

/**
 * Display height, weight and what they work out to, and let them be updated.
 *
 * Saving adds a new version of the profile, so earlier weights stay in its history.
 */
export function BodyCard({ db, snapshot, hideNumbers, currentYear, onSave }: BodyCardProps) {
  const body = snapshot?.value.body ?? null;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [trend, setTrend] = useState<WeightPoint[]>([]);
  // Reload the history whenever a new version is saved
  useEffect(() => { listProfileVersions(db).then(versions => setTrend(weightTrend(versions)), () => setTrend([])); }, [db, snapshot]);
  // Kept until a save succeeds, so a retry is recognised as the same change
  const operationKey = useRef(crypto.randomUUID());

  /** Save the new facts as the next profile version, keeping every other setting. */
  async function save(next: BodyFacts) {
    // Ignore a save with no profile loaded, because there is nothing to add a version to
    if (snapshot === null) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSave({ ...snapshot.value, body: next }, operationKey.current, snapshot.version);
      operationKey.current = crypto.randomUUID();
      setEditing(false);
      setMessage('Saved on this device.');
    } catch (problem) {
      setMessage(errorText(problem));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="body-heading">
      <div className="card-head">
        <div><p className="eyebrow">ONLY ON THIS DEVICE</p><h2 className="heading" id="body-heading">Your body</h2></div>
        {!editing && <button type="button" className="button button-secondary" onClick={() => { setEditing(true); setMessage(null); }}>Update</button>}
      </div>
      {editing ? <BodyFactsForm initial={body} hideNumbers={hideNumbers} currentYear={currentYear} saving={saving} submitLabel="Save" onSubmit={save}>
        <button type="button" className="signup-pill signup-pill-secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
      </BodyFactsForm> : body === null ? <p className="hint">Add your height and weight.</p> : <>
        <p className="body numbers">{body.heightCm} cm · {hideNumbers ? 'weight hidden' : `${body.weightKg} kg`}</p>
        {!hideNumbers && <BodyNumbers body={body} currentYear={currentYear} />}
        {!hideNumbers && trend.length > 1 && <WeightLine points={trend} />}
      </>}
      {message !== null && <p className="notice" role="status">{message}</p>}
    </section>
  );
}

// The size of the small weight chart's drawing area
const CHART_WIDTH = 300;
const CHART_HEIGHT = 64;

/**
 * Draw the recorded weights as a small line, with the change since the first one.
 */
function WeightLine({ points }: { points: readonly WeightPoint[] }) {
  // Scale to the recorded range, keeping a flat line in the middle when nothing has moved
  const weights = points.map(point => point.weightKg);
  const low = Math.min(...weights);
  const span = Math.max(...weights) - low;
  const x = (index: number) => 6 + (index / (points.length - 1)) * (CHART_WIDTH - 12);
  const y = (weight: number) => (span === 0 ? CHART_HEIGHT / 2 : CHART_HEIGHT - 6 - ((weight - low) / span) * (CHART_HEIGHT - 12));
  const change = weights.at(-1)! - weights[0]!;

  return (
    <figure className="weight-line">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Your recorded weights over time"><polyline points={points.map((point, index) => `${x(index)},${y(point.weightKg)}`).join(' ')} />{points.map((point, index) => <circle key={point.savedAt} cx={x(index)} cy={y(point.weightKg)} r="3" />)}</svg>
      <figcaption className="hint numbers">{change > 0 ? '+' : ''}{change.toFixed(1)} kg since {formatDiaryDate(points[0]!.savedAt.slice(0, 10))}, across {points.length} weigh-ins</figcaption>
    </figure>
  );
}
