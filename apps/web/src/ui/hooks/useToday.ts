import { useEffect, useState } from 'react';
import { deviceZone, localDateIn } from '../../domain/shared/dates';

// How often to re-read the clock while the app stays open; a minute late past midnight is fine
const CHECK_EVERY_MS = 60_000;

/**
 * Return today's diary date on the device's clock, updated when the date changes.
 *
 * A phone can keep the page alive in the background for hours or days, so the
 * date is re-read once a minute and straight away when the app comes back to
 * the foreground. The zone is re-read too, so travelling moves "today" with you.
 */
export function useToday(): string {
  const [today, setToday] = useState(currentDate);

  useEffect(() => {
    // React skips the re-render when the date string has not changed
    const refresh = () => setToday(currentDate());

    const timer = window.setInterval(refresh, CHECK_EVERY_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return today;
}

/**
 * Return the date on the device's clock and time zone right now.
 */
function currentDate(): string {
  return localDateIn(deviceZone(), new Date());
}
