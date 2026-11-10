import { useState, type FormEvent, type ReactNode } from 'react';
import type { CoachSource } from '../../../domain/coach/coachReply';
import { useBusy } from '../../hooks/useBusy';
import { AnsweredBy } from './AnsweredBy';
import { Field } from './Field';
import { ErrorLine } from './NoticeLine';
import { SourceLine } from './SourceLine';

/** The parts every grounded reply has, whichever coach sent it. */
interface GroundedReply {
  mode: string;
  message: string;
  sources: CoachSource[];
  answeredBy?: string | null;
}

interface AskCardProps<Reply extends GroundedReply> {
  // Names the heading and the text box, so two cards on one page stay apart
  headingId: string;
  inputId: string;
  eyebrow: string;
  heading: string;
  label: string;
  placeholder: string;
  maxLength: number;
  buttonText: string;
  hint: string;
  // What to say when the box is empty
  emptyError: string;
  ask: (text: string) => Promise<Reply>;
  // The modes in which the words on screen are a model's
  modelModes: readonly Reply['mode'][];
  // The part of a reply only this coach has: its claims or its suggestions
  children: (reply: Reply) => ReactNode;
}

/** Display the reviewed cards behind a reply as plain text. */
function SourceList({ sources }: { sources: CoachSource[] }) {
  return <ul className="items">{sources.map(source => <SourceLine key={source.number} source={source} />)}</ul>;
}

/**
 * Display one box that asks a coach, and the grounded reply under it.
 *
 * Only the typed text is sent. A model's reply names the model and keeps its sources
 * one tap away; when there is no model reply, the reviewed cards are shown themselves.
 */
export function AskCard<Reply extends GroundedReply>({ headingId, inputId, eyebrow, heading, label, placeholder, maxLength, buttonText, hint, emptyError, ask, modelModes, children }: AskCardProps<Reply>) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const { busy, error, setError, run } = useBusy();

  /** Send the text and show whatever came back. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Ignore an empty box, because there is nothing to send
    if (text.trim() === '') {
      setError(emptyError);
      return;
    }

    void run(async () => {
      setReply(null);
      setReply(await ask(text.trim()));
    });
  }

  return (
    <section className="card ai-card" aria-labelledby={headingId}>
      <div><p className="eyebrow">{eyebrow}</p><h2 id={headingId} className="heading">{heading}</h2></div>
      <form className="form" onSubmit={handleSubmit}>
        <Field label={label}>
          <textarea id={inputId} className="input ai-input" maxLength={maxLength} rows={2} value={text} placeholder={placeholder} onChange={event => setText(event.target.value)} />
        </Field>
        <button type="submit" className="button" disabled={busy}>{busy ? 'Thinking…' : buttonText}</button>
        <p className="hint">{hint}</p>
      </form>

      <ErrorLine error={error} />

      {reply !== null && <div className="ai-reply" aria-live="polite">
        {modelModes.includes(reply.mode) && <AnsweredBy name={reply.answeredBy} />}
        <p className="body">{reply.message}</p>
        {children(reply)}
        {reply.mode === 'excerpts' && <SourceList sources={reply.sources} />}
        {modelModes.includes(reply.mode) && reply.sources.length > 0 && <details><summary className="hint">Sources</summary><SourceList sources={reply.sources} /></details>}
      </div>}
    </section>
  );
}
