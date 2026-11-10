import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { EMPTY_PROFILE, type ProfileSnapshot } from '../../domain/profile/profile';
import { openDiary } from './connection';
import { readProfile, saveProfile } from './profileRepo';
import { exportDiary, restoreDiary, wipeDiary } from './backup/transfer';
import { validateBackup } from './backup/validate';

// Keep the profile fictional and use a different operation key for every confirmed version.
const first: ProfileSnapshot = { id: 'local', version: 1, operationKey: 'profile-1', savedAt: '2026-11-08T10:00:00Z',
  value: { ...EMPTY_PROFILE, avoidAreas: ['knees'], diabetes: true } };

it('commits immutable versions, replays a retry and refuses a stale or colliding write', async () => {
  const db = await openDiary(new IDBFactory());
  expect(await readProfile(db)).toBeNull();
  expect(await saveProfile(db, first, 0)).toMatchObject({ status: 'saved', replayed: false });
  expect(await saveProfile(db, first, 0)).toMatchObject({ status: 'saved', replayed: true });
  await expect(saveProfile(db, { ...first, value: EMPTY_PROFILE }, 0)).rejects.toThrow();
  expect(await saveProfile(db, { ...first, version: 2, operationKey: 'stale' }, 0)).toMatchObject({ status: 'conflict' });
  const second = { ...first, version: 2, operationKey: 'profile-2', value: EMPTY_PROFILE };
  await saveProfile(db, second, 1);
  expect(await readProfile(db)).toEqual(second);
  expect((await exportDiary(db)).profile).toEqual([first, second]);
  db.close();
});

it('round-trips profile history and accepts older backups without it', async () => {
  const db = await openDiary(new IDBFactory());
  await saveProfile(db, first, 0);
  const backup = await exportDiary(db);
  const checked = validateBackup(JSON.parse(JSON.stringify(backup)));
  if (!checked.ok) throw new Error(checked.errors.join('; '));
  await wipeDiary(db);
  expect(await readProfile(db)).toBeNull();
  await restoreDiary(db, checked);
  expect(await readProfile(db)).toEqual(first);
  const old = { ...backup, schemaVersion: 4 } as Record<string, unknown>;
  delete old.profile;
  const valid = validateBackup(old);
  expect(valid.ok && valid.backup.profile).toEqual([]);
  for (const profile of [[first, first], [{ ...first, version: 2 }], [{ ...first, value: { ...first.value, avoidAreas: ['unknown'] } }]]) {
    expect(validateBackup({ ...backup, profile }).ok).toBe(false);
  }
  db.close();
});


it('refuses corrupt stored adaptations instead of treating them as unrestricted', async () => {
  const db = await openDiary(new IDBFactory());
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('profile', 'readwrite');
    tx.objectStore('profile').add({ ...first, value: { ...EMPTY_PROFILE, seatedOnly: 'unknown' } });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await expect(readProfile(db)).rejects.toThrow();
  db.close();
});

it('serialises competing confirmations so only one expected version commits', async () => {
  const db = await openDiary(new IDBFactory());
  const results = await Promise.all([saveProfile(db, first, 0), saveProfile(db, { ...first, operationKey: 'competing' }, 0)]);
  expect(results.filter(result => result.status === 'saved')).toHaveLength(1);
  expect(results.filter(result => result.status === 'conflict')).toHaveLength(1);
  expect((await exportDiary(db)).profile).toHaveLength(1);
  db.close();
});
