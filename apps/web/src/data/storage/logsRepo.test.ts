import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSleep, resolveSleep, type SleepEntry } from '../../domain/sleep/sleep';
import { buildWorkout, type WorkoutEntry } from '../../domain/training/workouts';
import { openDiary } from './connection';
import { logsOn, saveLogEntry, setLogDeleted } from './logsRepo';

let db: IDBDatabase;
beforeEach(async () => {
  db = await openDiary(new IDBFactory());
});

// A row session saved on 10 Nov
function rowSession(operationKey = 'w1'): WorkoutEntry {
  return buildWorkout(
    { movement: 'Row', status: 'done', sets: [{ reps: 8, load: 5, loadUnit: 'kg', perHand: true, minutes: null, distanceKm: null }] },
    { id: 'row-1', operationKey, localDate: '2026-11-10', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-10T18:00:00+08:00' },
  );
}

describe('saveLogEntry', () => {
  it('saves once even when the same save is sent twice', async () => {
    expect(await saveLogEntry(db, 'workouts', rowSession())).toMatchObject({ status: 'saved', replayed: false });
    expect(await saveLogEntry(db, 'workouts', rowSession())).toMatchObject({ status: 'saved', replayed: true });
    expect(await logsOn(db, 'workouts', '2026-11-10')).toHaveLength(1);
    await expect(saveLogEntry(db, 'workouts', rowSession('other-key'))).rejects.toThrow(/already exists/);
  });

  it('finds sleep by the waking date', async () => {
    const interval = resolveSleep('2026-11-10', { hour: 23, minute: 30, meridiem: null }, { hour: 7, minute: 0, meridiem: null });
    await saveLogEntry(db, 'sleep', buildSleep(interval, null, { id: 's1', operationKey: 's1', zone: 'Asia/Kuala_Lumpur', savedAt: '2026-11-10T07:30:00+08:00' }));
    expect((await logsOn<SleepEntry>(db, 'sleep', '2026-11-10')).map((entry) => entry.timeInBedMin)).toEqual([450]);
    expect(await logsOn(db, 'sleep', '2026-11-09')).toEqual([]);
  });
});

describe('setLogDeleted', () => {
  it('deletes and restores by version, refusing a stale screen', async () => {
    await saveLogEntry(db, 'workouts', rowSession());
    const deleted = await setLogDeleted<WorkoutEntry>(db, 'workouts', { id: 'row-1', expectedVersion: 1, deleted: true, operationKey: 'd1', savedAt: 'later' });
    expect(deleted.status === 'saved' && deleted.entry).toMatchObject({ deleted: true, version: 2 });

    // A second screen still showing version 1 gets a conflict, and nothing changes
    const stale = await setLogDeleted<WorkoutEntry>(db, 'workouts', { id: 'row-1', expectedVersion: 1, deleted: false, operationKey: 'd2', savedAt: 'later' });
    expect(stale.status).toBe('conflict');

    // Retrying the delete replays it instead of failing
    const retry = await setLogDeleted<WorkoutEntry>(db, 'workouts', { id: 'row-1', expectedVersion: 1, deleted: true, operationKey: 'd1', savedAt: 'later' });
    expect(retry).toMatchObject({ status: 'saved', replayed: true });
  });
});
