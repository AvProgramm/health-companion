# Milestone 1 walkthrough: one food saved, corrected and kept offline

Read this, open each file beside it, and then answer the questions at the end in your own words. Put your answers in `docs/milestones/m1-my-words.md`.

Written for Milestone 1. The code has grown since: an amount is now changed by `saveChange` in [MealSheet.tsx](../../apps/web/src/ui/components/meals/MealSheet.tsx), as one `MealEdit`, and steps 2 to 4 below run the same way.

## The path of one correction (300 → 250 mL)
1. **The page** ([App.tsx](../../apps/web/src/ui/App.tsx), `handleSave`)
   - Checks the typed text is a finite, non-negative number.
   - Builds a `ChangeAmountRequest` that holds the **revision currently on screen** (`expectedRevision`) and a **pending operation key**.
2. **Storage** ([mealsRepo.ts](../../apps/web/src/storage/mealsRepo.ts), `commitEdit`) opens **one** readwrite transaction over `meals`, `revisions` and `operations`. Inside it:
   1. If the operation key is already in `operations`, it returns the revision that key produced. This is a replay, so a double tap or retry never saves twice (golden C).
   2. Otherwise it reads the meal header and then the latest revision.
   3. It hands both to the domain.
3. **Domain** ([revisions.ts](../../apps/web/src/domain/meals/revisions.ts), `reviseMeal`) is a pure function: no storage, no clock.
   - It returns a **conflict** if `expectedRevision` is not the latest (golden D).
   - It checks the new amount is finite and non-negative, and that the component exists.
   - It checks the unit fits, e.g. `L` works for `mL`, but `g` throws `UnitMismatchError`.
   - It returns a **new** revision: number + 1, `supersedes` the old one, and only the milk component replaced. The other components are shared, untouched.
4. **Back in storage:** a conflict writes nothing. Otherwise the new revision, the moved header pointer and the used key are all written in the same transaction. The promise only resolves on the transaction's `complete` event, with `durability: 'strict'`.
5. **The page reloads from the database.** Totals come from [aggregate.ts](../../apps/web/src/domain/nutrition/aggregate.ts) `totalNutrient`, which calls [scale.ts](../../apps/web/src/domain/nutrition/scale.ts) `scaleNutrient` per component:
   - `110.8 × (250 / 250) × 1 = 110.8 kcal`
   - an unknown label value stays unknown ("0 g known + 1 unknown")
   - rounding happens only in [format.ts](../../apps/web/src/ui/format.ts)

## Why it opens with no network
- The [service worker](../../apps/web/src/sw/service-worker.js) precaches the exact build files. The list is written by a small plugin in [vite.config.ts](../../apps/web/vite.config.ts), because the hashed file names change every build.
- Navigations get the cached `index.html`, and the scripts and styles come from the cache.
- **The bug we hit and fixed:**
  - The preview server sends `Vary: Origin`, and module scripts are requested with an `Origin` header.
  - So `caches.match` refused the cached copies and the offline page was blank.
  - `ignoreVary: true` fixed it.
- The diary data is in IndexedDB, not in the cache. Clearing the cache doesn't lose meals; clearing **site data** does.

## Storage durability
[persistence.ts](../../apps/web/src/storage/persistence.ts) asks `navigator.storage.persist()` after the first save. Chrome may answer `false`, and it did in the desktop test. Saving still works; the status line says Chrome may clear it, and backup comes in Milestone 2.

## What was verified (7 Nov, desktop Chrome in the Claude browser pane)
- `npm run check`: typecheck plus 46 tests (golden A–D, unit and finite-number cases, retry, conflict, rollback, reopen).
- Save 300 mL gave rev 1 · 133.0 kcal · 10.2 g. Correcting to 250 mL gave rev 2 · 110.8 kcal · 8.5 g.
- **Server stopped:** reload showed rev 2 from cache + IndexedDB. Correcting offline to 200 mL gave rev 3 · 88.6 kcal · 6.8 g.
- **Not yet verified:** your Android phone. See the steps in `docs/test-log.md`.

## Questions to answer in your own words
1. Why does a correction add a new revision instead of changing the old one?
2. What stops a double tap from saving two meals? Which store holds the proof?
3. A second tab still shows revision 1 and saves 150 mL. What happens, and which line decides it?
4. Why must `scaleNutrient` check `Number.isFinite` before `value < 0`?
5. Why does `totalNutrient` return `{ known, unknownItems }` instead of one number?
6. Why does the promise resolve on `oncomplete` and not on the last `onsuccess`?
7. What would break if the phone opened `127.0.0.1:4173` instead of `localhost:4173`?
