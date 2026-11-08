import { useState, type FormEvent } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { requestTrainerPlan } from '../api/trainer';
import type { Category } from '../domain/training/catalogue';
import type { ExerciseEntry } from '../domain/training/exerciseSearch';
import { DIFFICULTIES, SETTINGS, type Difficulty, type Setting } from '../domain/training/packs';
import type { PlanResult } from '../domain/training/planner';
import { planFromProposal, type TrainerReply } from '../domain/training/trainerPlan';
import { OptionGroup } from './OptionGroup';
import { PlanResultView } from './PlanResultView';
import { errorText } from './useSave';

// The Trainer balances the whole body unless the goal says otherwise
const ALL_AREAS: readonly Category[] = ['push', 'pull', 'legs', 'core'];
// The longest session the service accepts
const MAX_MINUTES = 600;

/** One answer from the Trainer, kept with the minutes it was asked for. */
interface TrainerSession {
  reply: TrainerReply;
  result: PlanResult;
  minutes: number;
}

/**
 * Display the AI Trainer: say what you want, get a checked session.
 *
 * Only what is typed or picked here is sent. The reply is a proposal, and the same
 * rules and planner as every other session decide what goes in it.
 */
export function TrainerCard({ entries }: { entries: readonly ExerciseEntry[] }) {
  const [goal, setGoal] = useState('');
  const [minutesText, setMinutesText] = useState('45');
  const [setting, setSetting] = useState<Setting>('bodyweight');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [session, setSession] = useState<TrainerSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Ask the Trainer, then run its proposal through the checks on this device. */
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const minutes = Number(minutesText);

    // Ignore an empty goal, because the Trainer would have nothing to choose for
    if (goal.trim() === '') {
      setError('Tell the Trainer what you want from today.');
      return;
    }

    // Ignore a time the service would refuse, so the person gets a clear message
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
      setError(`Enter the minutes you have, from 1 to ${MAX_MINUTES}.`);
      return;
    }

    setBusy(true);
    setSession(null);
    try {
      // Send only the card's fields, then check the proposal here
      const equipment = SETTINGS[setting].equipment;
      const reply = await requestTrainerPlan({ goal: goal.trim(), minutes, equipment, areas: ALL_AREAS, level: DIFFICULTIES[difficulty].levels[0]! });
      setSession({ reply, minutes, result: planFromProposal(reply, entries, { minutes, equipment, unableTo: [], neverSuggest: [], categories: ALL_AREAS }) });
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ai-card" aria-labelledby="trainer-heading">
      <div className="card-head"><div><p className="eyebrow">AI TRAINER</p><h2 id="trainer-heading" className="heading">Ask the Trainer</h2></div><span className="badge"><Sparkle size={14} />Chooses from the library</span></div>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">What do you want from today?</span>
          <textarea id="trainer-goal" className="input ai-input" maxLength={200} rows={2} value={goal} placeholder="I want to get healthier and build some muscle" onChange={event => setGoal(event.target.value)} />
        </label>
        <label className="field">
          <span className="label">Minutes you have</span>
          <input id="trainer-minutes" className="input input-short" inputMode="numeric" value={minutesText} onChange={event => setMinutesText(event.target.value)} />
        </label>
        <OptionGroup legend="Where" name="trainer-setting" options={Object.entries(SETTINGS).map(([value, place]) => [value as Setting, place.label])} value={setting} onChange={setSetting} />
        <OptionGroup legend="How hard" name="trainer-difficulty" options={Object.entries(DIFFICULTIES).map(([value, rule]) => [value as Difficulty, rule.label])} value={difficulty} onChange={setDifficulty} />
        <button type="submit" className="button" disabled={busy}>{busy ? 'Choosing exercises…' : 'Ask the Trainer'}</button>
        <p className="hint">Sends only what's on this card. Your diary stays on this device.</p>
      </form>

      {error !== null && <p className="notice notice-error" role="alert">{error}</p>}
      {busy && <div className="skeleton skeleton-card" role="status" aria-label="The Trainer is choosing exercises" />}

      {session !== null && <>
        <div className="ai-reply">
          {session.reply.source !== 'refused' && <span className={`badge ${session.reply.source === 'ai' ? 'badge-estimate' : 'badge-warn'}`}>{session.reply.source === 'ai' ? 'Picked by the AI' : 'Picked from the library'}</span>}
          <p className="body">{session.reply.reason}</p>
        </div>
        {session.reply.source !== 'refused' && <PlanResultView result={session.result} minutesText={String(session.minutes)} areaCount={ALL_AREAS.length} />}
      </>}
    </section>
  );
}
