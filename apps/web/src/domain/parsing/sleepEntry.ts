/**
 * Sleep entries ("slept 23:30 to 07:00", "bed at 11, up at 7").
 */
import type { ClockTime } from '../sleep/sleep';
import type { ParseResult } from './types';

// Sleep words: any of these makes the text a sleep entry
const SLEEP_WORDS = /\b(?:slept|sleep|went\s+to\s+bed|to\s+bed|bed(?:time)?|woke(?:\s+up)?|got\s+up|nap(?:ped)?)\b/;

// A sleep duration the user reports ("slept 6 hours", "6h30")
const SLEEP_DURATION = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes?)?\b)?/;

// A clock time: "23:30", "7", "11pm", "7.15am"
const CLOCK_TIME = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/g;

/**
 * Return a sleep entry, or null if the text is not about sleep.
 *
 * The first clock time is bed and the second is waking. A reported duration
 * ("slept 6 hours") is kept as time asleep, never used to invent the times.
 */
export function parseSleep(clean: string): ParseResult | null {
  if (!SLEEP_WORDS.test(clean)) {
    return null;
  }

  // Take out a reported duration first, so "6 hours" is not read as 6 o'clock
  const duration = SLEEP_DURATION.exec(clean);
  const asleepMin = duration === null ? null : Math.round(Number(duration[1]) * 60 + Number(duration[2] ?? 0));
  const rest = duration === null ? clean : clean.replace(duration[0], ' ');

  // Read the clock times in the order they were written
  const times: ClockTime[] = [...rest.matchAll(CLOCK_TIME)].map((match) => ({
    hour: Number(match[1]),
    minute: Number(match[2] ?? 0),
    meridiem: (match[3] as 'am' | 'pm' | undefined) ?? null,
  }));
  const bed = times.length >= 2 ? times[0]! : null;
  const wake = times.length >= 2 ? times[1]! : times.length === 1 && /\b(?:woke|got\s+up|up)\b/.test(rest) ? times[0]! : null;

  // Say what is still missing; time in bed needs both ends
  let problem: string | null = null;
  if (bed === null || wake === null) {
    problem = bed === null && wake === null ? 'Add when you went to bed and when you woke up.' : 'Add when you went to bed.';
  }
  return { kind: 'sleep', bed, wake, asleepMin, problem };
}
