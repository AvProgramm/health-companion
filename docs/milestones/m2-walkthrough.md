# Milestone 2 walkthrough: a diary you can use from Monday

Open each file beside this page. The order follows one real use, from typing a meal to restoring a backup.

## 1. Typing a meal: grammar, not AI
[parse.ts](../../apps/web/src/domain/parse.ts) `parseEntry` reads the composer text in a fixed order:
1. **Question:** a question mark or "how much / what's…" plus a nutrient word gives `{ kind: 'question' }`.
2. **Correction:** "actually / no / sorry… + number", or "change the milk to 250 ml", gives `{ kind: 'correction', amount, foodHint }`.
3. **Meal:** anything else is split on `, + and with` into items. Each item gets a leading number and unit (`readLeadingAmount`), then its name is looked up in saved foods ([foods.ts](../../apps/web/src/domain/foods.ts) `findFoods`).

It never guesses. An unknown food, a missing amount, or a unit that doesn't fit the label (300 g of a mL milk) becomes a `problem` the draft shows. The typed number is kept in `typedAmount`, so adding the missing food doesn't lose it. That was a bug found while testing.

## 2. Draft → one save
[DraftCard.tsx](../../apps/web/src/ui/components/meals/DraftCard.tsx) previews each row with the same `scaleNutrient` the totals use. "Save meal" stays disabled until every row has a food and a valid amount.

[TodayView.tsx](../../apps/web/src/ui/pages/TodayView.tsx) `saveDraft` → `startMeal` → [db.ts](../../apps/web/src/storage/db.ts) `confirmMeal`. That path is unchanged from Milestone 1, plus `assertTotalable`: the meal must total cleanly before it is written.

## 3. "Actually 250 mL"
[corrections.ts](../../apps/web/src/domain/corrections.ts) `findCorrectionTargets` keeps the day's items that the new amount can describe:
- mL fits a mL item
- a bare count fits a counted item
- a named food fits only that food

[CorrectionCard.tsx](../../apps/web/src/ui/components/meals/CorrectionCard.tsx) then:
- **0 matches:** explains why and points at the meal.
- **1 match:** previews, by running the real `reviseMeal` on a copy.
- **2+ matches:** asks "Which one is 250 mL?"

## 4. Every other change is one `reviseMeal` edit
[revisions.ts](../../apps/web/src/domain/revisions.ts) `reviseMeal` checks the meal ID, then the expected revision (a stale screen gets a **conflict**), then applies one `MealEdit`:

| Edit | Used for |
|---|---|
| `change_amount` | "actually 250 mL" (`reviseAmount` is now a thin wrapper around this) |
| `update_component` | change amount and/or **leave some** (eaten fraction) |
| `replace_food` | quinoa instead of rice: the old item becomes `active: false`, the new one is appended |
| `remove_component` | didn't eat it at all |
| `delete_meal` | wrong entry; the meal keeps its history and can be restored |
| `restore` | **Undo**: a *new* revision with the previous revision's contents. Nothing is rewound. |

The [meal sheet](../../apps/web/src/ui/components/meals/MealSheet.tsx) shows the history in words ("Milk 300 mL → 250 mL") using [describe.ts](../../apps/web/src/ui/describe.ts).

## 5. The day total
[day.ts](../../apps/web/src/domain/day.ts) `summariseDay` adds the latest revision of each live meal on that date. An empty day is `coverage: 'no_entries'`, which the screen shows as "Nothing logged", never "0 kcal" (golden E). Unknown label values stay as "+ N unknown".

## 6. Storage version 2
[db.ts](../../apps/web/src/storage/db.ts) `upgradeSchema` runs only the steps a device is missing. Your phone is at version 1, so only the `byDate` index gets added and your Milestone 1 meal is kept. A unit test recreates a version 1 database and checks this.

## 7. Backup and restore
[backup.ts](../../apps/web/src/storage/backup.ts):
- `exportDiary` reads all four stores in one snapshot.
- `validateBackup` checks the file marker and version, every unit and number (`NaN` becomes `null` in JSON and is refused), and that every reference resolves.
- `restoreDiary` accepts only a validated file, and clears and refills all stores in one transaction.

The Vitest round trip runs export → wipe → restore and confirms:
- identical day totals
- the stale correction is still rejected
- a used operation key still replays

## 8. The development hook
`.claude/settings.json` runs `scripts/check-changed.mjs` after every Claude edit under `domain/`, `storage/` or `eval/fixtures/`. The script typechecks and runs the tests, and exits 2 with the failure so Claude has to fix it. The same script runs independently in two other places:
```bash
npm run check
```
- `.github/workflows/check.yml` on every push

**Demo done on 7 Nov:** changing the milk fixture from 110.8 to 111 made the hook exit 2 and `npm run check` exit 2. Restoring the fixture made both pass. During the build the hook also fired for real three times, on intermediate edits that used a function before its import.

## Verified (7 Nov, desktop Chrome in the Claude browser pane)
- `npm run check`: typecheck plus all tests pass.
- Typed "2 weetabix and 300 ml milk" with no foods saved, created both foods from the draft, and saved: **266.0 kcal · 14.3 g · added sugar 0 g known + 1 unknown** (golden A).
- "actually, 250 mL" previewed Milk 300 → 250 mL, kcal 133.0 → 110.8 (−22.2), and day 266.0 → 243.8. After saving: **243.8 kcal · 12.6 g**, still one meal, Weetabix unchanged (golden B).
- "how much added sugar today?" answered from the diary with "No AI was used".
- Leaving half the Weetabix gave 177.3 kcal. Undo restored it as revision 4.
- Hide numbers hid every total and kept amounts.
- 375 px wide: no sideways scroll.
- Server stopped: the reload still showed the meal.

**Not verified:**
- **The phone.** See `docs/test-log.md`.
- **The v1 → v2 upgrade on real data.** The browser pane's storage was empty, so only the unit test covers it until your phone opens the new build.
- **A real file download and restore.** The logic is covered by tests.
