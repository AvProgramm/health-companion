import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BodyFacts } from '../domain/profile/body';
import { EMPTY_PROFILE } from '../domain/profile/profile';
import { exportDiary, restoreDiary, wipeDiary } from './backup/transfer';
import { validateBackup } from './backup/validate';
import { openDiary } from './connection';
import { listProfileVersions, readProfile, saveProfile } from './profileRepo';

// A fictional person's facts
const BODY: BodyFacts = { heightCm: 175, weightKg: 70, birthYear: null, sex: null, activity: null };

let db: IDBDatabase;
beforeEach(async () => { db = await openDiary(new IDBFactory()); });

/** Save one fictional profile version. */
async function save(version: number, weightKg: number | null) {
  await saveProfile(db, { id: 'local', version, operationKey: `setup-${version}`, savedAt: `2026-11-0${version}T10:00:00Z`, value: weightKg === null ? EMPTY_PROFILE : { ...EMPTY_PROFILE, body: { ...BODY, weightKg } } }, version - 1);
}

/** Export, check, erase and restore the diary. */
async function roundTrip() {
  const checked = validateBackup(JSON.parse(JSON.stringify(await exportDiary(db))));
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  await wipeDiary(db);
  await restoreDiary(db, checked);
}

describe('body facts in a backup', () => {
  it('survive export, erase and restore', async () => {
    await save(1, 70);
    await roundTrip();
    expect((await readProfile(db))?.value.body).toEqual(BODY);
  });

  it('keep every recorded weight, so the trend survives a restore', async () => {
    await save(1, 71);
    await save(2, 70);
    await roundTrip();
    expect((await listProfileVersions(db)).map(version => version.value.body?.weightKg)).toEqual([71, 70]);
  });

  it('stay absent in a profile saved before setup existed, so the app asks for them', async () => {
    await save(1, null);
    await roundTrip();
    expect((await readProfile(db))?.value.body).toBeUndefined();
  });
});
