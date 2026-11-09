# Milestone 3 walkthrough: training, sleep, and a SOLID restructure

## 1. One message, five possible meanings
[parseEntry.ts](../../apps/web/src/domain/parsing/parseEntry.ts) tries an ordered list of small parsers. The first one that recognises the text wins:

| Order | Parser | Why it comes here |
|---|---|---|
| 1 | [question](../../apps/web/src/domain/parsing/question.ts) | "what was my protein" is not a food |
| 2 | [correction](../../apps/web/src/domain/parsing/correction.ts) | "actually 250 ml" also looks like an item |
| 3 | [sleepEntry](../../apps/web/src/domain/parsing/sleepEntry.ts) | "bed at 11" is not food |
| 4 | [workoutEntry](../../apps/web/src/domain/parsing/workoutEntry.ts) | "row 3x8" is not food; a saved food name always stays food ("2 x 2 weetabix") |
| 5 | [meal](../../apps/web/src/domain/parsing/meal.ts) | always answers, last |

A new kind of entry means adding a parser to the list (open/closed), not editing a big function. The number and unit reading they share lives in [amounts.ts](../../apps/web/src/domain/parsing/amounts.ts).

## 2. Training
[workouts.ts](../../apps/web/src/domain/training/workouts.ts):
- `buildWorkout` checks every set: a set needs reps or a time, reps must be whole numbers, and a load needs kg or lb.
- **"Each hand" is a flag.** `describeSets` writes "3 × 8 @ 5 kg each hand" and never adds hands together (kit Tuesday test 2).
- `lastPerformed` ignores skipped and deleted entries, so "last time" always means a session that happened.

On screen, [WorkoutDraftCard](../../apps/web/src/ui/components/training/WorkoutDraftCard.tsx) checks the draft with the same `buildWorkout` it saves with, and shows last time. The [Gym tab](../../apps/web/src/ui/pages/GymView.tsx) lists the last session of each movement, then history.

## 3. Sleep
[sleep.ts](../../apps/web/src/domain/sleep/sleep.ts) `resolveSleep(wakeDate, bed, wake)`:
- **No am/pm typed:** bed between 7 and 11 means evening ("bed at 11" is 23:00). A wake time is morning.
- **Bed later than wake:** bed was the day before. 23:30 → 07:00 is 450 min, counted under the waking date (golden G).
- **A time picker's value (`'24h'`) is exact,** so a 09:00 bedtime after a night shift stays morning.
- **Time asleep is only what the user reports.** Time in bed is never counted as sleep.

## 4. Storage version 3
- [connection.ts](../../apps/web/src/storage/connection.ts) `upgradeSchema` adds the `workouts` store (indexes `byDate` and `byMovement`) and the `sleep` store (index `byDate`). Earlier steps are untouched.
- [logsRepo.ts](../../apps/web/src/storage/logsRepo.ts) saves a log entry once (replay on the same key). Delete and restore are a versioned flag, so a stale screen gets a conflict.
- Backup [validate.ts](../../apps/web/src/storage/backup/validate.ts) has one checker per store, run in dependency order. A Milestone 2 backup without these lists still restores.

## 5. Restructure (your SOLID / YAGNI request)
- **Feature folders:** `domain/{shared,nutrition,meals,training,sleep,parsing}`, and `storage/{connection,foodsRepo,mealsRepo,logsRepo,backup/*}`. Test helpers live only in `src/test/`.
- **Removed because nothing in the app used them:** `reviseAmount`, the `change_amount` edit (a correction is `update_component`), `commitRevision`, `latestMeal`, `ensureFood`, and the separate demo foods.
- **UI cards save through one `useSave` hook,** which reuses the operation key on retry and replaces it only after success.

## Verified (7 Nov, Claude browser pane, attached to your running preview server)
- `npm run check`: typecheck, all app tests and the hook tests pass.
- **Real v2 → v3 upgrade:** this browser's Milestone 2 lunch survived. The database is now version 3.
- "add gym: row 3 x 8 at 5 kg each hand" previewed "3 × 8 @ 5 kg each hand" with the per-hand note, then saved.
- "slept 23:30 to 7" previewed "In bed Fri 6 Nov 23:30 → 07:00: 7 h 30 min, counted under today", then saved.
- The day showed sleep → lunch → Row. Delete on Row switched it to Restore.

**Not verified:**
- **Your phone.** See `docs/test-log.md`.
- **The Gym tab screen.** It wasn't opened in the browser.
- **An offline reload of this build.** The offline mechanism is unchanged since M2.
