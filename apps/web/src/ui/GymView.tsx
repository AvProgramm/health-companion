import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barbell, ShieldCheck } from '@phosphor-icons/react';
import { EMPTY_PROFILE, type Profile } from '../domain/profile/profile';
import { SEATED_CARDS } from '../domain/training/seated';
import { MOVEMENT_CARDS, type MovementCard } from '../domain/training/catalogue';
import type { CustomCardSelection } from '../domain/training/customCards';
import { listCustomCards, saveCustomCard } from '../storage/customCardsRepo';
import { ExerciseSearch } from './ExerciseSearch';
import { PackPicker } from './PackPicker';
import { describeSets, lastPerformed, type WorkoutEntry } from '../domain/training/workouts';
import { listWorkouts } from '../storage/logsRepo';
import { formatDiaryDate } from './format';
import { PlanSession } from './PlanSession';
import { TrainerCard } from './TrainerCard';
import { errorText } from './useSave';

// Enough history to see a trend on a phone screen without scrolling forever
const HISTORY_LENGTH = 20;

/**
 * Display offline exercise choices, a checked plan and recent training history.
 */
export function GymView({ db, profile = EMPTY_PROFILE }: { db: IDBDatabase; profile?: Profile }) {
  // Keep library loading, saved choices and diary history separate.
  const [entries, setEntries] = useState<WorkoutEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<typeof import('../data/exerciseLibrary') | null>(null);
  const [choices, setChoices] = useState<CustomCardSelection[]>([]);
  const [choicesReady, setChoicesReady] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false);
  const pendingKeys = useRef(new Map<string, string>());
  const cards = useMemo(() => [...MOVEMENT_CARDS, ...(profile.seatedOnly ? SEATED_CARDS : []), ...choices.filter(choice => !choice.deleted).map(choice => choice.card)], [choices, profile.seatedOnly]);

  // Load a separate bundled chunk; its URL contains no search text and the worker precaches it.
  useEffect(() => {
    let cancelled = false;
    import('../data/exerciseLibrary').then(value => { if (!cancelled) setLibrary(value); }, () => { if (!cancelled) setError('The bundled exercise library could not load. Reload this tab.'); });
    return () => { cancelled = true; };
  }, []);

  /** Reload the current exercise choices without sending a query off this device. */
  const reloadChoices = useCallback(async () => {
    setChoices(await listCustomCards(db));
    setChoicesReady(true);
  }, [db]);

  useEffect(() => { reloadChoices().catch(problem => setError(errorText(problem))); }, [reloadChoices]);

  /** Confirm one choice change through the versioned repository path. */
  async function persistChoice(card: MovementCard, removed: boolean) {
    // Ignore a confirmation before loading because its source revision is not available yet.
    if (library === null) throw new Error('Wait for the bundled exercise library to load.');
    // Retain the operation key until a confirmed transaction has been read back.
    const previous = choices.find(choice => choice.id === card.id);
    const expectedVersion = previous?.version ?? 0;
    const action = `${card.id}:${expectedVersion}:${removed}`;
    const operationKey = pendingKeys.current.get(action) ?? crypto.randomUUID();
    pendingKeys.current.set(action, operationKey);
    setSavingChoice(true);
    setError(null);
    try {
      // Append a version and refresh the pool, including conflicts from another tab.
      const result = await saveCustomCard(db, { id: card.id, card, source: library.EXERCISE_SOURCE,
        version: expectedVersion + 1, deleted: removed, operationKey, savedAt: new Date().toISOString() }, expectedVersion);
      await reloadChoices();
      if (result.status === 'conflict') throw new Error('This exercise choice changed in another screen. Review the updated list and try again.');
      pendingKeys.current.delete(action);
    } finally { setSavingChoice(false); }
  }

  useEffect(() => {
    listWorkouts(db).then(setEntries, (problem: unknown) => setError(errorText(problem)));
  }, [db]);

  // Newest first, leaving out deleted entries
  const live = (entries ?? [])
    .filter((entry) => entry.deleted !== true)
    .sort((a, b) => (a.localDate === b.localDate ? b.savedAt.localeCompare(a.savedAt) : b.localDate.localeCompare(a.localDate)));

  // The latest performed session of each movement
  const movementKeys = [...new Set(live.filter((entry) => entry.status === 'done').map((entry) => entry.movementKey))];
  const lastSessions = movementKeys.map((key) => lastPerformed(live, key)).filter((entry): entry is WorkoutEntry => entry !== undefined);

  return (
    <>
      <header className="masthead gym-masthead"><div className="gym-title"><span className="gym-emblem"><Barbell size={32} /></span><div><p className="eyebrow">MOVE ON YOUR TERMS</p>
        <h1 className="page-title">Your movement space.</h1></div></div>
        <p className="status">Choose your exercises. Make room for a session that fits today.</p>
      </header>

      {library !== null && <TrainerCard entries={library.EXERCISE_ENTRIES} profile={profile} />}

      {library !== null && <PackPicker profile={profile} entries={library.EXERCISE_ENTRIES} chosen={choices} busy={!choicesReady || savingChoice} onAdd={card => persistChoice(card, false)} />}

      {(profile.seatedOnly || profile.avoidAreas.length > 0 || profile.unableTo.length > 0) && <p className="notice">Your saved adaptations apply on this device. Unreviewed movement facts are excluded when a restriction needs them. Change adaptations in Me.</p>}
      {profile.diabetes && <p className="notice">Check your glucose before and after exercise as your care team advised.</p>}
      <div className="gym-layout">
        {library === null ? <section className="card" aria-label="Loading offline exercise library"><div className="skeleton skeleton-card" /></section> : <ExerciseSearch entries={library.EXERCISE_ENTRIES} chosen={choices} busy={!choicesReady || savingChoice}
          onAdd={card => persistChoice(card, false)} onRemove={async choice => {
            try { await persistChoice(choice.card, true); } catch (problem) { setError(errorText(problem)); }
          }} />}
        <div className="gym-planner-column">{choicesReady ? <PlanSession cards={cards} profile={profile} /> : <div className="skeleton skeleton-card" role="status" aria-label="Loading exercise choices" />}<p className="device-note"><ShieldCheck size={20} />Exercise searches and choices stay on this device. Log completed training on Today.</p></div>
      </div>

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      {entries !== null && live.length === 0 && (
        <section className="card card-muted">
          <p className="body">No training logged yet.</p>
          <p className="hint">Your last sets for each exercise will show here, so you know where to start next time.</p>
        </section>
      )}

      {lastSessions.length > 0 && (
        <section className="card" aria-labelledby="last-heading">
          <h2 id="last-heading" className="heading">Last time</h2>
          <ul className="items">
            {lastSessions.map((entry) => (
              <li key={entry.movementKey} className="item">
                <div className="item-main">
                  <span>{entry.movement}</span>
                  <span className="hint">{formatDiaryDate(entry.localDate)}</span>
                </div>
                <span className="numbers">{describeSets(entry)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.length > 0 && (
        <section className="card" aria-labelledby="history-heading">
          <h2 id="history-heading" className="heading">History</h2>
          <ol className="history">
            {live.slice(0, HISTORY_LENGTH).map((entry) => (
              <li key={entry.id}>
                <span className="history-main">{entry.status === 'skipped' ? 'Rest day' : `${entry.movement}: ${describeSets(entry)}`}</span>
                <span className="history-meta">{formatDiaryDate(entry.localDate)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
