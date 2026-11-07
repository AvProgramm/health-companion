import { useMemo, useState } from 'react';
import { MagnifyingGlass, CheckCircle, WifiSlash, Books } from '@phosphor-icons/react';
import type { MovementCard } from '../domain/training/catalogue';
import { MAX_CUSTOM_CARDS, type CustomCardSelection } from '../domain/training/customCards';
import { searchExercises, type ExerciseEntry } from '../domain/training/exerciseSearch';
import { ExerciseReview } from './ExerciseReview';
import { MuscleMap } from './MuscleMap';

interface ExerciseSearchProps {
  entries: readonly ExerciseEntry[];
  chosen: readonly CustomCardSelection[];
  busy: boolean;
  onAdd: (card: MovementCard) => Promise<void>;
  onRemove: (choice: CustomCardSelection) => Promise<void>;
}

/** Search bundled exercises locally and require review before adding them to the pool. */
export function ExerciseSearch({ entries, chosen, busy, onAdd, onRemove }: ExerciseSearchProps) {
  // Search the bundled entries without an HTTP boundary.
  const [query, setQuery] = useState('');
  const [reviewing, setReviewing] = useState<ExerciseEntry | null>(null);
  const matches = useMemo(() => searchExercises(entries, query), [entries, query]);
  // Exclude removed snapshots from the current pool and its display count.
  const active = chosen.filter(choice => !choice.deleted);
  const selected = new Set(active.map(choice => choice.id));

  return <section className="card exercise-library" aria-labelledby="exercise-search-heading">
    <div className="card-head"><div><p className="eyebrow">BUILD YOUR OWN POOL</p><h2 className="heading" id="exercise-search-heading">Find your next movement</h2></div><span className="badge"><WifiSlash size={14} />Offline</span></div>
    <p className="hint">{entries.length} bundled exercises. Search stays on this device; only exercises you explicitly add enter the planner.</p>
    <label className="exercise-search-box"><MagnifyingGlass size={20} /><input className="input" aria-label="Search exercises" value={query} placeholder="Search exercise, muscle or equipment" onChange={event => setQuery(event.target.value)} autoComplete="off" /></label>
    {query.trim() === '' ? <div className="exercise-search-empty"><Books size={32} /><p className="body">Make this library yours.</p><p className="hint">Try a movement or a muscle group.</p><div className="row">{['row', 'squat', 'abdominals'].map(term => <button type="button" className="button button-secondary" key={term} onClick={() => setQuery(term)}>{term}</button>)}</div></div> : <>
      <p className="hint" role="status">{matches.length === 0 ? 'No local matches. Try a shorter name or muscle group.' : `Showing up to 12 local matches · ${active.length}/${MAX_CUSTOM_CARDS} added`}</p>
      <ul className="exercise-results">{matches.map(entry => <li className="exercise-result" key={entry.id}>
        <MuscleMap category={entry.category} muscles={entry.primaryMuscles} />
        <div className="exercise-result-content"><div className="row"><span className={`category-chip category-${entry.category ?? 'unknown'}`}>{entry.category ?? 'Review category'}</span>{selected.has(entry.id) && <span className="hint selected-label"><CheckCircle size={16} weight="fill" />Added</span>}</div>
          <h3 className="heading-small">{entry.name}</h3><p className="hint">{entry.primaryMuscles.join(', ') || 'Muscles unknown'}</p><p className="hint">{entry.sourceEquipment ?? 'Equipment unknown'}</p>
          <button className="button button-secondary" type="button" disabled={busy || selected.has(entry.id) || active.length >= MAX_CUSTOM_CARDS || entry.equipment === null} onClick={() => setReviewing(entry)}>Review and add</button>
          {entry.equipment === null && <p className="hint">This equipment is not mapped to the planner yet.</p>}</div>
      </li>)}</ul>
    </>}
    <details className="my-exercises" open={active.length > 0 && active.length <= 4}><summary><span>My added exercises</span><span className="badge">{active.length}/{MAX_CUSTOM_CARDS}</span></summary>
      {active.length === 0 ? <p className="hint">Nothing added yet. The eight reviewed starter cards remain available.</p> : <ul className="items">{active.map(choice => <li className="chosen-exercise" key={choice.id}><div><strong>{choice.card.name}</strong><p className="hint">{choice.card.minutes} min · {choice.card.category}</p></div><button type="button" className="button button-quiet" disabled={busy} aria-label={`Remove ${choice.card.name}`} onClick={() => onRemove(choice)}>Remove</button></li>)}</ul>}
    </details>
    <p className="source-caption">Exercise text: free-exercise-db · Unlicense. Illustrations are bundled SVGs. Capability requirements always need review.</p>
    {reviewing && <ExerciseReview key={reviewing.id} entry={reviewing} onClose={() => setReviewing(null)} onConfirm={onAdd} />}
  </section>;
}
