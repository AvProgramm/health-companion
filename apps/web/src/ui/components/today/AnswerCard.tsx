import type { DaySummary } from '../../../domain/nutrition/day';
import type { NutrientKey } from '../../../domain/nutrition/types';
import { NUTRIENT_LABELS, formatTotal } from '../../format';

interface AnswerCardProps {
  nutrient: NutrientKey;
  summary: DaySummary;
  dateLabel: string;
  hideNumbers: boolean;
  onDone: () => void;
}

/**
 * Show the answer to a question about the day, worked out from the diary alone.
 */
export function AnswerCard({ nutrient, summary, dateLabel, hideNumbers, onDone }: AnswerCardProps) {
  return (
    <section className="card" aria-live="polite">
      <p className="body">{answerText(nutrient, summary, dateLabel, hideNumbers)}</p>
      <p className="hint">Answered from your diary on this device. No AI was used.</p>
      <button type="button" className="button button-quiet" onClick={onDone}>OK</button>
    </section>
  );
}

/**
 * Return the answer to "how much protein today?" from the day summary.
 */
function answerText(nutrient: NutrientKey, summary: DaySummary, dateLabel: string, hideNumbers: boolean): string {
  const { label, unit } = NUTRIENT_LABELS[nutrient];
  if (summary.coverage === 'no_entries') {
    return `Nothing is logged for ${dateLabel}, so ${label.toLowerCase()} is unknown, not zero.`;
  }
  if (hideNumbers) {
    return 'Numbers are hidden. Turn them back on in Me to see this total.';
  }
  const meals = `${summary.mealCount} ${summary.mealCount === 1 ? 'meal' : 'meals'}`;
  return `${label} for ${dateLabel}: ${formatTotal(summary.totals[nutrient], unit)}, from ${meals} logged.`;
}
