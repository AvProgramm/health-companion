import { useState, type FormEvent } from 'react';
import { askNutritionist } from '../../../api/nutritionist';
import type { NutritionistReply } from '../../../domain/nutrition/nutritionistReply';
import { SourceLine } from '../shared/SourceLine';
import { errorText } from '../../hooks/useSave';

/**
 * Display food ideas for a typed goal, each grounded in reviewed guidance.
 *
 * Only the typed goal is sent. A suggestion fills a draft on Today, where the person
 * still reviews it, gets an estimate and confirms before anything is saved.
 */
export function NutritionistCard({ onDraft }: { onDraft: (entry: string) => void }) {
  const [goal, setGoal] = useState('');
  const [reply, setReply] = useState<NutritionistReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Send the goal and show whatever came back. */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Ignore an empty goal, because there is nothing to suggest for
    if (goal.trim() === '') {
      setError('Tell the Nutritionist what you are looking for.');
      return;
    }

    setBusy(true);
    setReply(null);
    try {
      setReply(await askNutritionist(goal.trim()));
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ai-card" aria-labelledby="nutritionist-heading">
      <div><p className="eyebrow">AI NUTRITIONIST</p><h2 id="nutritionist-heading" className="heading">Ideas for what to eat</h2></div>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">What are you looking for?</span>
          <textarea id="nutritionist-goal" className="input ai-input" maxLength={200} rows={2} value={goal} placeholder="A breakfast with more fibre and less sugar" onChange={event => setGoal(event.target.value)} />
        </label>
        <button type="submit" className="button" disabled={busy}>{busy ? 'Checking the guidance…' : 'Suggest ideas'}</button>
        <p className="hint">Sends only what you type here. Leave out names and personal details. Your diary stays on this device.</p>
      </form>

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      {reply !== null && <div className="ai-reply" aria-live="polite">
        <p className="body">{reply.message}</p>
        {reply.suggestions.length > 0 && <ul className="items">{reply.suggestions.map(suggestion => <li key={suggestion.entry} className="suggestion">
          <div><strong>{suggestion.title}</strong><p className="hint">{suggestion.entry}</p><p className="hint">{suggestion.why.text} <span className="numbers">{suggestion.why.cites.map(cite => `[${cite}]`).join(' ')}</span></p></div>
          <button type="button" className="button button-secondary" onClick={() => onDraft(suggestion.entry)}>Use as draft</button>
        </li>)}</ul>}
        {reply.mode === 'excerpts' && <ul className="items">{reply.sources.map(source => <SourceLine key={source.number} source={source} />)}</ul>}
        {reply.mode === 'suggestions' && <details><summary className="hint">Sources</summary><ul className="items">{reply.sources.map(source => <SourceLine key={source.number} source={source} />)}</ul></details>}
      </div>}
    </section>
  );
}
