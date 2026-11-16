import { Fire } from '@phosphor-icons/react';
import type { NutrientTotal } from '../../../domain/nutrition/aggregate';
import { addDays } from '../../../domain/shared/dates';
import { formatDiaryDate, formatEnergySoFar } from '../../format';

interface TodayMastheadProps {
  date: string;
  today: string;
  // The day's energy total, or null when nothing was logged
  energy: NutrientTotal | null;
  hideNumbers: boolean;
  onDateChange: (date: string) => void;
}

/**
 * Show the page title, the energy eaten so far and the buttons that move between days, which stop at today.
 */
export function TodayMasthead({ date, today, energy, hideNumbers, onDateChange }: TodayMastheadProps) {
  /**
   * Bring the day's full totals into view, where unknowns and ranges are explained.
   */
  function showTotals() {
    document.getElementById('day-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <header className="masthead">
      <div><p className="eyebrow">YOUR DAILY SPACE</p><h1 className="page-title">A day in balance<span>.</span></h1></div>
      <div className="date-block">
        <button type="button" className="energy-so-far" onClick={showTotals} aria-label="Show the day's totals">
          <Fire size={16} weight="fill" aria-hidden="true" />
          <span>{hideNumbers ? 'Day totals' : formatEnergySoFar(energy)}</span>
        </button>
        <nav className="date-nav" aria-label="Choose day">
          <button type="button" className="button button-quiet" aria-label="Previous day" onClick={() => onDateChange(addDays(date, -1))}>‹</button>
          <h2 className="date-title">{formatDiaryDate(date)}</h2>
          <button type="button" className="button button-quiet" aria-label="Next day" disabled={date >= today} onClick={() => onDateChange(addDays(date, 1))}>›</button>
          {date !== today && (
            <button type="button" className="button button-quiet" onClick={() => onDateChange(today)}>Today</button>
          )}
        </nav>
      </div>
    </header>
  );
}
