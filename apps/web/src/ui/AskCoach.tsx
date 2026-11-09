import { useState, type FormEvent } from 'react';
import { askCoach } from '../api/coach';
import type { CoachReply } from '../domain/coach/coachReply';
import { SourceLine } from './SourceLine';
import { errorText } from './useSave';

/**
 * Display a question box answered only from reviewed health guidance.
 *
 * Only the typed question is sent. Every claim is checked against the cards it cites,
 * and the diary is never involved.
 */
export function AskCoach() {
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Send the question and show whatever came back. */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Ignore an empty question, because there is nothing to look up
    if (question.trim() === '') {
      setError('Type a question first.');
      return;
    }

    setBusy(true);
    setReply(null);
    try {
      setReply(await askCoach(question.trim()));
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ai-card" aria-labelledby="coach-heading">
      <div><p className="eyebrow">AI COACH</p><h2 id="coach-heading" className="heading">Ask about food, sleep or activity</h2></div>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">Your question</span>
          <textarea id="coach-question" className="input ai-input" maxLength={300} rows={2} value={question} placeholder="How much sodium is too much in a day?" onChange={event => setQuestion(event.target.value)} />
        </label>
        <button type="submit" className="button" disabled={busy}>{busy ? 'Checking the guidance…' : 'Ask'}</button>
        <p className="hint">Sends only this question. Leave out names and personal details. Your diary stays on this device.</p>
      </form>

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}

      {reply !== null && <div className="ai-reply" aria-live="polite">
        <p className="body">{reply.message}</p>
        {reply.claims.length > 0 && <ul className="items">{reply.claims.map(claim => <li key={claim.text} className="body">{claim.text} <span className="hint numbers">{claim.cites.map(cite => `[${cite}]`).join(' ')}</span></li>)}</ul>}
        {reply.mode === 'excerpts' && <ul className="items">{reply.sources.map(source => <SourceLine key={source.number} source={source} />)}</ul>}
        {reply.mode === 'answer' && <details><summary className="hint">Sources</summary><ul className="items">{reply.sources.map(source => <SourceLine key={source.number} source={source} />)}</ul></details>}
      </div>}
    </section>
  );
}
