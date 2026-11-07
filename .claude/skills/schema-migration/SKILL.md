---
name: schema-migration
description: Use when adding a new kind of record (workouts, sleep, diet rules, photos) or an index to the IndexedDB diary, which means bumping DB_VERSION in apps/web/src/storage/db.ts. Keeps phones that already hold data on older versions safe, and keeps backup and restore complete.
---

# Changing the diary schema

Yash's phone already holds real data. A migration that loses it is the worst bug this app can have.

1. **Bump `DB_VERSION`** in `apps/web/src/storage/db.ts` by one.
2. **Append one step** to `upgradeSchema`: `if (oldVersion < N) { ... }`. Never edit an earlier step. Create stores and indexes only; data transforms need a separate cursor pass inside the same upgrade transaction.
3. **Add the store** to `STORE_NAMES`, so `wipeDiary`, `exportDiary` and `restoreDiary` include it.
4. **Validate it** in `backup.ts`: add a check for every field restore depends on, rejecting non-finite numbers and unknown units, and checking every reference points at something in the same file.
5. **Bump `BACKUP_FORMAT_VERSION`** only if old backups would no longer restore cleanly. If you bump it, let `validateBackup` accept the old version and fill in empty lists.
6. **Write the tests**:
   - Upgrade: open version N−1 with a saved meal through a fresh `IDBFactory`, close it, open with `openDiary`, and assert the meal is still there and the new store exists. Copy the existing "keeps meals saved under schema version 1" test.
   - Round trip: add the new record to `backup.test.ts`'s `beforeEach` and assert it survives export → wipe → restore.
7. Run `npm run check`. Then, on the phone, reload twice and confirm the old meals are still there before logging anything new.
