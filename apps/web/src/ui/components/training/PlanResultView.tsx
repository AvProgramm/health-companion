import type { Category } from '../../../domain/training/catalogue';
import { MAX_CARDS, type PlanResult } from '../../../domain/training/planner';
import { MinutesRing } from './MinutesRing';
import { MuscleMap } from './MuscleMap';

// The four training areas, as they read on a chip or a checkbox
export const CATEGORY_CHOICES: readonly [Category, string][] = [['push', 'Push'], ['pull', 'Pull'], ['legs', 'Legs'], ['core', 'Core']];

interface PlanResultViewProps {
  result: PlanResult | null;
  minutesText: string;
  areaCount: number;
}

/**
 * Display a checked session, or the honest reason there isn't one.
 *
 * Shared by the planner and the Trainer, so a session looks and reads the same
 * however it was chosen. Nothing here saves anything.
 */
export function PlanResultView({ result, minutesText, areaCount }: PlanResultViewProps) {
  // Display compact repetition counts without expanding hundreds of repeated rows.
  const session = result?.status === 'plan' ? result : null;
  const plannedMinutes = session?.schedule?.minutes ?? session?.plan.minutes ?? 0;
  const plannedBlocks = session?.schedule?.blocks ?? session?.plan.cards.map(card => ({ card, repeatCount: 1, minutes: card.minutes })) ?? [];

  return (
    <>
      {result?.status === 'plan' && (
        <div className="stack gym-plan-result" aria-live="polite">
          <div className="plan-overview"><MinutesRing used={plannedMinutes} available={Number(minutesText)} /><div><p className="eyebrow">YOUR SESSION</p><h3 className="heading">{result.unfilledMinutes === 0 ? 'Your target is covered.' : 'A partial session.'}</h3><div className="coverage-chips">{CATEGORY_CHOICES.map(([value, label]) => <span className={`category-chip ${result.plan.cards.some(card => card.category === value) ? `category-${value}` : 'category-uncovered'}`} key={value}>{label}</span>)}</div></div></div>
          <ol className="items">
            {plannedBlocks.map(({ card, repeatCount, minutes }) => (
              <li key={card.id} className="item planned-exercise">
                <MuscleMap category={card.category} muscles={card.primaryMuscles} /><div>
                <div className="item-main">
                  <span>{card.name}</span>
                  <span className="numbers">{minutes} min · {card.category}{repeatCount > 1 && ` · ${repeatCount} × ${card.minutes}-min blocks`}</span>
                </div>
                <details className="exercise-instructions"><summary>Instructions</summary><p className="hint">{card.cue}</p></details>
                </div>
              </li>
            ))}
          </ol>
          <p className="body numbers">
            {plannedMinutes} of {minutesText} min · covers {result.plan.covered} of {areaCount} chosen areas
          </p>
          {result.plan.cards.length === 1 && <p className="hint">Only {result.plan.cards[0]!.name} fits these choices. Add exercises from the library, or try a ready-made day, for more variety.</p>}
          {result.unfilledMinutes > 0 && <p className="notice">{result.unfilledMinutes} min unfilled. These reviewed blocks do not fill the last part of this target. Adjust the target or choose additional blocks.</p>}
          {result.schedule && <p className="body">{result.schedule.fullRounds} full {result.schedule.fullRounds === 1 ? 'round' : 'rounds'}{result.schedule.extraBlocks > 0 && ` + ${result.schedule.extraBlocks} extra blocks`}. Review these repeated blocks before training.</p>}
          <p className="hint">Up to {MAX_CARDS} distinct exercises; planning blocks keep their reviewed durations.{!result.schedule && ' Each exercise is used once.'}</p>
          <details><summary className="hint">How this plan was chosen</summary><p className="hint">Coverage first, then closest to your target without going over, then preference. Compared {result.considered} planning options.{result.schedule && ' The selected round is repeated, with extra blocks where their lengths fit.'}</p></details>
          <p className="hint">A suggestion only: log what you actually did on Today.</p>
        </div>
      )}

      {result?.status === 'none' && <p className="body" aria-live="polite">{result.reason}</p>}

      {result !== null && result.excluded.length > 0 && (
        <details>
          <summary className="hint">Why some exercises were left out</summary>
          <ul className="items">
            {result.excluded.map(({ card, reason }) => (
              <li key={card.id} className="hint">{card.name}: {reason}.</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
