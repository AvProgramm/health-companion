import type { DayOverview } from './weekOverview';

// The longest line the service accepts
const MAX_LINE = 200;
// Enough foods to describe a day without the line being cut mid-word
const MAX_FOODS = 8;

/** Return a day's energy in words, keeping a gap, an unknown and a partial total apart. */
function energyText(energy: DayOverview['energy']): string {
  if (energy === null) return 'food nothing logged';
  if (energy.knownItems === 0) return 'food logged, energy unknown';
  const partial = energy.unknownItems > 0 ? `at least ${Math.round(energy.known)} kcal, ${energy.unknownItems} item(s) unknown` : `${Math.round(energy.known)} kcal`;
  return `food ${partial}`;
}

/**
 * Return one plain line per day for the AI to read, such as
 * "2026-01-05: food 1800 kcal (oats, dal); training 1 session; sleep 7 h 30 min".
 *
 * Every number is computed here, so the model only reads totals and never adds them up.
 * Nothing logged stays "nothing logged", because a gap in the diary is not zero.
 */
export function weekLines(days: readonly DayOverview[], foodNames: ReadonlyMap<string, readonly string[]>): string[] {
  return days.map((day) => {
    const names = [...new Set(foodNames.get(day.date) ?? [])].slice(0, MAX_FOODS);
    const foods = names.length > 0 ? ` (${names.join(', ')})` : '';
    const training = day.sessions === 0 ? 'training nothing logged' : `training ${day.sessions} session${day.sessions === 1 ? '' : 's'}`;
    const sleep = day.sleepMinutes === null ? 'sleep nothing logged' : `sleep ${Math.floor(day.sleepMinutes / 60)} h ${Math.round(day.sleepMinutes % 60)} min`;
    return `${day.date}: ${energyText(day.energy)}${foods}; ${training}; ${sleep}`.slice(0, MAX_LINE);
  });
}
