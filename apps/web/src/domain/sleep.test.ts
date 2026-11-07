import { describe, expect, it } from 'vitest';
import { goldenCase } from './goldenFixture';
import { buildSleep, formatDuration, resolveSleep } from './sleep';

const IDS = { id: 's1', operationKey: 'sleep1', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-10T07:30:00+08:00' };

describe('resolveSleep', () => {
  it('counts 23:30 → 07:00 under the waking date with 450 minutes in bed (golden G)', () => {
    const expected = goldenCase('G').expect;
    const interval = resolveSleep('2026-11-10', { hour: 23, minute: 30, meridiem: null }, { hour: 7, minute: 0, meridiem: null });
    const entry = buildSleep(interval, null, IDS);
    expect(entry.localDate).toBe(expected.diary_date);
    expect(entry.timeInBedMin).toBe(expected.time_in_bed_min);
    expect(entry.asleepMin).toBe(expected.measured_sleep_min);
    expect(entry.bedDate).toBe('2026-11-09');
  });

  it('reads "bed at 11, up at 7" as 23:00 to 07:00', () => {
    const interval = resolveSleep('2026-11-10', { hour: 11, minute: 0, meridiem: null }, { hour: 7, minute: 0, meridiem: null });
    expect(interval).toMatchObject({ bedDate: '2026-11-09', bedTime: '23:00', wakeTime: '07:00', timeInBedMin: 480 });
  });

  it('keeps a daytime sleep after a night shift on one day', () => {
    const interval = resolveSleep('2026-11-10', { hour: 8, minute: 30, meridiem: 'am' }, { hour: 3, minute: 0, meridiem: 'pm' });
    expect(interval).toMatchObject({ bedDate: '2026-11-10', bedTime: '08:30', wakeTime: '15:00', timeInBedMin: 390 });
  });

  it('reads 12 am as midnight and 12 pm as noon', () => {
    const interval = resolveSleep('2026-11-10', { hour: 12, minute: 0, meridiem: 'am' }, { hour: 12, minute: 0, meridiem: 'pm' });
    expect(interval).toMatchObject({ bedTime: '00:00', wakeTime: '12:00', timeInBedMin: 720 });
  });

  it('rejects impossible times', () => {
    expect(() => resolveSleep('2026-11-10', { hour: 25, minute: 0, meridiem: null }, { hour: 7, minute: 0, meridiem: null })).toThrow(RangeError);
    expect(() => resolveSleep('2026-11-10', { hour: 11, minute: 75, meridiem: null }, { hour: 7, minute: 0, meridiem: null })).toThrow(RangeError);
    expect(() => resolveSleep('2026-11-10', { hour: 13, minute: 0, meridiem: 'pm' }, { hour: 7, minute: 0, meridiem: null })).toThrow(RangeError);
  });
});

describe('buildSleep', () => {
  it('refuses reported sleep longer than time in bed', () => {
    const interval = resolveSleep('2026-11-10', { hour: 23, minute: 0, meridiem: null }, { hour: 6, minute: 0, meridiem: null });
    expect(() => buildSleep(interval, 8 * 60, IDS)).toThrow(/longer than time in bed/);
    expect(buildSleep(interval, 6 * 60, IDS).asleepMin).toBe(360);
  });
});

describe('formatDuration', () => {
  it('writes hours and minutes', () => {
    expect(formatDuration(450)).toBe('7 h 30 min');
    expect(formatDuration(480)).toBe('8 h');
    expect(formatDuration(45)).toBe('45 min');
  });
});
