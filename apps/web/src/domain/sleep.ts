/**
 * Sleep intervals.
 *
 * A sleep is counted once, under the date you woke up (the convention is shown on
 * screen). Time in bed comes from the two clock times; time actually asleep is only
 * known if the user says so, and is never estimated.
 */
import { addDays } from './dates';
import { assertPositive } from './validate';

// Minutes in a day, used to step across midnight
const MINUTES_PER_DAY = 24 * 60;

/**
 * A clock time as typed. meridiem is null when no am/pm was given.
 */
export interface ClockTime {
  hour: number;
  minute: number;
  meridiem: 'am' | 'pm' | null;
}

export interface SleepEntry {
  id: string;
  localDate: string;
  zone: string;
  bedDate: string;
  bedTime: string;
  wakeTime: string;
  timeInBedMin: number;
  asleepMin: number | null;
  savedAt: string;
  operationKey: string;
  version: number;
  deleted?: boolean;
}

/**
 * A resolved interval: both dates and times, and how long that was.
 */
export interface SleepInterval {
  bedDate: string;
  bedTime: string;
  wakeDate: string;
  wakeTime: string;
  timeInBedMin: number;
}

/**
 * Return the bed-to-wake interval for a sleep that ended on the given diary date.
 *
 * Without am/pm, a bedtime from 7 to 11 is read as evening and a wake time up to
 * 11 as morning, which covers "bed at 11, up at 7". A bedtime later than the wake
 * time means bed was the day before (23:30 → 07:00); otherwise both are on the
 * same day, which covers naps and daytime sleep after a night shift.
 */
export function resolveSleep(wakeDate: string, bed: ClockTime, wake: ClockTime): SleepInterval {
  // Turn both clock times into minutes after midnight
  const bedMinutes = toMinutes(bed, 'bed');
  const wakeMinutes = toMinutes(wake, 'wake');

  // Put bed on the previous day when it comes after the wake time
  const crossesMidnight = bedMinutes >= wakeMinutes;
  const bedDate = crossesMidnight ? addDays(wakeDate, -1) : wakeDate;
  const timeInBedMin = crossesMidnight ? MINUTES_PER_DAY - bedMinutes + wakeMinutes : wakeMinutes - bedMinutes;

  // Return the interval with times written as HH:MM
  return { bedDate, bedTime: clockText(bedMinutes), wakeDate, wakeTime: clockText(wakeMinutes), timeInBedMin };
}

/**
 * Return a checked sleep entry ready to save.
 */
export function buildSleep(
  interval: SleepInterval,
  asleepMin: number | null,
  ids: { id: string; operationKey: string; zone: string; savedAt: string },
): SleepEntry {
  assertPositive(interval.timeInBedMin, 'Time in bed');

  // Reported sleep can be shorter than time in bed, never longer
  if (asleepMin !== null) {
    assertPositive(asleepMin, 'Time asleep');
    if (asleepMin > interval.timeInBedMin) {
      throw new RangeError('Time asleep cannot be longer than time in bed');
    }
  }

  return {
    ...ids,
    localDate: interval.wakeDate,
    bedDate: interval.bedDate,
    bedTime: interval.bedTime,
    wakeTime: interval.wakeTime,
    timeInBedMin: interval.timeInBedMin,
    asleepMin,
    version: 1,
  };
}

/**
 * Return a duration as "7 h 30 min".
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Return minutes after midnight for a typed clock time, applying the am/pm reading rules.
 */
function toMinutes(time: ClockTime, role: 'bed' | 'wake'): number {
  // Check the numbers before reading them
  if (!Number.isInteger(time.hour) || !Number.isInteger(time.minute) || time.minute < 0 || time.minute > 59) {
    throw new RangeError(`That ${role} time is not a real time`);
  }
  if (time.hour < 0 || time.hour > 23 || (time.meridiem !== null && (time.hour < 1 || time.hour > 12))) {
    throw new RangeError(`That ${role} time is not a real time`);
  }

  // am/pm given: 12 am is midnight and 12 pm is noon
  let hour = time.hour;
  if (time.meridiem !== null) {
    hour = (time.hour % 12) + (time.meridiem === 'pm' ? 12 : 0);
  } else if (role === 'bed' && hour >= 7 && hour <= 11) {
    // "bed at 11" means 23:00
    hour += 12;
  } else if (role === 'bed' && hour === 12) {
    // "bed at 12" means midnight
    hour = 0;
  }
  return hour * 60 + time.minute;
}

/**
 * Return minutes after midnight as "HH:MM".
 */
function clockText(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
