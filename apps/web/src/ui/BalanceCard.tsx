import { energyBalance } from '../domain/nutrition/balance';
import type { DaySummary } from '../domain/nutrition/day';
import { dailyEnergy, type BodyFacts } from '../domain/profile/body';
import { burnOfDay } from '../domain/training/cardio';
import type { WorkoutEntry } from '../domain/training/workouts';
import { burnText } from './format';

interface BalanceCardProps {
  summary: DaySummary;
  workouts: readonly WorkoutEntry[];
  body: BodyFacts | null;
  currentYear: number;
}

/** Return energy rounded to the nearest ten, for display only, because more digits would be false precision. */
function kcal(value: number): string {
  return `${(Math.round(value / 10) * 10).toLocaleString('en-GB')} kcal`;
}

/**
 * Show how today's food compares with the estimated daily need.
 *
 * Cardio is shown beside it and never added, because the activity level behind the
 * daily need already counts usual exercise. Adding it would count the same run twice.
 */
export function BalanceCard({ summary, workouts, body, currentYear }: BalanceCardProps) {
  const need = body === null ? null : dailyEnergy(body, currentYear);
  const balance = energyBalance(summary.totals.kcal, need);
  const burn = burnOfDay(workouts, body?.weightKg ?? null);
  const filled = need === null ? 0 : Math.min(100, (balance.eaten / need) * 100);

  return (
    <section className="card balance-card" aria-labelledby="balance-heading">
      <div><p className="eyebrow">FOOD AND ACTIVITY</p><h2 id="balance-heading" className="heading">Today's balance</h2></div>
      <div className="balance-numbers">
        <div><span className="hint">Eaten</span><strong className="numbers">{kcal(balance.eaten)}</strong>{balance.unknownItems > 0 && <span className="hint">+ {balance.unknownItems} unknown</span>}</div>
        <div><span className="hint">Daily need</span><strong className="numbers">{need === null ? 'Unknown' : kcal(need)}</strong><span className="hint">{need === null ? 'Add age, sex and activity in Me' : 'estimated'}</span></div>
        <div><span className="hint">{balance.left !== null && balance.left < 0 ? 'Over by' : 'Left'}</span><strong className="numbers">{balance.left === null ? 'Unknown' : `${balance.leftIsAtMost ? 'At most ' : ''}${kcal(Math.abs(balance.left))}`}</strong></div>
      </div>
      {need !== null && <div className="balance-track" role="img" aria-label={`Eaten ${Math.round(filled)}% of the estimated daily need`}><i style={{ width: `${filled}%` }} /></div>}
      {burn !== null && <p className="hint numbers">{burnText(burn)}{burn.unknownSessions > 0 && ` · ${burn.unknownSessions} more with no estimate`}. Shown separately, because your activity level already counts usual exercise.</p>}
    </section>
  );
}
