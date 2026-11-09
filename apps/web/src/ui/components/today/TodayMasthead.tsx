import { addDays } from '../../../domain/shared/dates';
import { formatDiaryDate } from '../../format';

interface TodayMastheadProps {
  date: string;
  today: string;
  onDateChange: (date: string) => void;
}

/**
 * Show the page title and the buttons that move between days, which stop at today.
 */
export function TodayMasthead({ date, today, onDateChange }: TodayMastheadProps) {
  return (
    <header className="masthead">
      <div><p className="eyebrow">YOUR DAILY SPACE</p><h1 className="page-title">A day in balance<span>.</span></h1></div>
      <nav className="date-nav" aria-label="Choose day">
        <button type="button" className="button button-quiet" aria-label="Previous day" onClick={() => onDateChange(addDays(date, -1))}>‹</button>
        <h2 className="date-title">{formatDiaryDate(date)}</h2>
        <button type="button" className="button button-quiet" aria-label="Next day" disabled={date >= today} onClick={() => onDateChange(addDays(date, 1))}>›</button>
        {date !== today && (
          <button type="button" className="button button-quiet" onClick={() => onDateChange(today)}>Today</button>
        )}
      </nav>
    </header>
  );
}
