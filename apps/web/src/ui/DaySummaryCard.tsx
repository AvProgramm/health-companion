import type { DaySummary } from '../domain/nutrition/day';
import type { NutrientKey } from '../domain/nutrition/types';
import { NUTRIENT_LABELS } from './format';

// The totals shown on Today; saturated fat stays in the meal sheet to keep this short
const SHOWN: readonly NutrientKey[] = ['kcal', 'protein_g', 'fat_g', 'total_sugar_g', 'added_sugar_g'];

interface DaySummaryCardProps {
  summary: DaySummary;
  dateLabel: string;
  hideNumbers: boolean;
}

/**
 * The day's totals, keeping "nothing logged" apart from zero and unknowns apart from known values.
 */
export function DaySummaryCard({ summary, dateLabel, hideNumbers }: DaySummaryCardProps) {
  // An empty day is "nothing logged", never "0 kcal"
  if (summary.coverage === 'no_entries') {
    return (
      <section className="card summary-card summary-empty" aria-label={`Summary for ${dateLabel}`}>
        <p className="eyebrow">DAILY OVERVIEW</p><h2 className="heading">A fresh page.</h2><p className="body">Nothing logged for {dateLabel}.</p>
        <p className="hint">Missing meals are not counted as zero.</p>
      </section>
    );
  }

  const meals = `${summary.mealCount} ${summary.mealCount === 1 ? 'meal' : 'meals'} logged`;

  return (
    <section className="card summary-card" aria-labelledby="summary-heading">
      <div className="card-head">
        <h2 id="summary-heading" className="heading">{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)} so far</h2>
        <span className="hint">{meals}</span>
      </div>

      {hideNumbers ? (
        <p className="hint">Numbers are hidden. You can show them again in Me.</p>
      ) : (
        <dl className="readout numbers">
          {SHOWN.map((key) => (
            <div key={key} className={key === 'kcal' ? 'energy-readout' : 'nutrient-readout'}>
              <dt>{NUTRIENT_LABELS[key].label}</dt>
              <dd>
                <span className="summary-value">{summary.totals[key].range === undefined ? '' : '≈ '}{summary.totals[key].known.toFixed(1)} {NUTRIENT_LABELS[key].unit}</span>
                {summary.totals[key].range !== undefined && <span className="summary-range">{summary.totals[key].range!.low.toFixed(1)}–{summary.totals[key].range!.high.toFixed(1)} {NUTRIENT_LABELS[key].unit}</span>}
                {summary.totals[key].unknownItems > 0 && <span className="summary-unknown">Known + {summary.totals[key].unknownItems} unknown</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="hint">Only what you logged is counted. "Unknown" means a label did not give that value.</p>
    </section>
  );
}
