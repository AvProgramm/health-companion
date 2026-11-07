import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDiary } from './connection';
import { listCustomCards, saveCustomCard } from './customCardsRepo';
import type { CustomCardSelection } from '../domain/training/customCards';
import { exportDiary, restoreDiary, wipeDiary } from './backup/transfer';
import { validateBackup } from './backup/validate';

// A fictional choice has a stable ID, while each explicit change has a new operation key.
const choice: CustomCardSelection = { id: 'free-exercise-db:fictional', version: 1, operationKey: 'choose-1',
  savedAt: '2026-11-07T10:00:00Z', deleted: false, source: { dataset: 'free-exercise-db', revision: 'a'.repeat(40) },
  card: { id: 'free-exercise-db:fictional', name: 'Fictional row', category: 'pull', equipment: ['dumbbells'], requires: [], minutes: 5, cue: 'Fictional cue.' } };
let db: IDBDatabase;
beforeEach(async () => { db = await openDiary(new IDBFactory()); });

describe('chosen exercise snapshots', () => {
  it('replays a confirmation and refuses a stale change', async () => {
    expect(await saveCustomCard(db, choice, 0)).toMatchObject({ status: 'saved', replayed: false });
    expect(await saveCustomCard(db, choice, 0)).toMatchObject({ status: 'saved', replayed: true });
    expect(await saveCustomCard(db, { ...choice, version: 2, operationKey: 'late', deleted: true }, 0)).toMatchObject({ status: 'conflict' });
    expect(await listCustomCards(db)).toEqual([choice]);
  });

  it('keeps earlier snapshots and restores the selection history through backup', async () => {
    await saveCustomCard(db, choice, 0);
    const removed = { ...choice, version: 2, operationKey: 'remove-1', deleted: true };
    await saveCustomCard(db, removed, 1);
    const backup = await exportDiary(db);
    expect(backup.customCards).toEqual([choice, removed]);
    const checked = validateBackup(JSON.parse(JSON.stringify(backup)));
    if (!checked.ok) throw new Error(checked.errors.join('; '));
    await wipeDiary(db);
    await restoreDiary(db, checked);
    expect(await listCustomCards(db)).toEqual([removed]);
    expect(await saveCustomCard(db, choice, 0)).toMatchObject({ status: 'saved', replayed: true });
  });

  it('restores old backups without choices and rejects malformed or duplicated snapshots', async () => {
    const old = JSON.parse(JSON.stringify(await exportDiary(db)));
    delete old.customCards;
    old.schemaVersion = 3;
    const checked = validateBackup(old);
    expect(checked.ok && checked.backup.customCards).toEqual([]);
    for (const invalid of [ { ...choice, card: { ...choice.card, requires: ['unknown'] } }, { ...choice, card: { ...choice.card, minutes: Number.NaN } } ]) {
      expect(validateBackup({ ...old, customCards: [invalid] }).ok).toBe(false);
    }
    expect(validateBackup({ ...old, customCards: [choice, choice] }).ok).toBe(false);
  });

  it('caps the chosen pool and rolls back a rejected write', async () => {
    for (let index = 0; index < 24; index += 1) {
      const id = `free-exercise-db:fictional-${index}`;
      await saveCustomCard(db, { ...choice, id, card: { ...choice.card, id }, operationKey: `choose-${index}` }, 0);
    }
    await expect(saveCustomCard(db, { ...choice, operationKey: 'over-limit' }, 0)).rejects.toThrow('24');
    expect(await listCustomCards(db)).toHaveLength(24);
  });
});
