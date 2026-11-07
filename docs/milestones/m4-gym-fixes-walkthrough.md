# M4 fixes: fixed exercise facts, ready-made days, allocation sweep, milk calories

7 Nov 2026, Claude Code, on `codex/exercise-search` after Codex's handoff (`docs/handoff/claude-code.md`). Yash asked for four things before the next milestone. Each one starts with a failing test from the exact case.

## 1. Milk had no calories (coach service)

**What Yash saw:** USDA estimates were rough, and milk came back without calories.

**Why:** USDA's branded records for drinks are published per 100 mL. Their serving unit says so (`ml` or `MLT`), but [databases.py](../../services/coach/coach/databases.py) treated every USDA record as per 100 g. A portion like "250 ml" therefore found no compatible record, because the app never converts between mass and volume. The lookup fell through to the AI model, which is slower and sometimes rate-limited.

**Fix:**
- `parse_usda` reads `servingSizeUnit`, and a record served in millilitres is per 100 mL.
- USDA's lab-analysed (Foundation) records publish total sugar under ID 1063, so that ID is now read too. The first value listed wins, so a second ID can't overwrite it.

**Checked live:** "milk, 250 ml" now comes from USDA at 146 kcal, with every nutrient filled. "Milk, 200 g" still refuses per-100 mL records. Restart the coach service to load this fix.

## 2. Exercise facts can't be edited

**What Yash saw:** a dumbbell row could be re-ticked as needing a band.

**Why the source can't simply be locked as it is:** the library's "body only" means "no weights", not "no apparatus". Pull-ups, chin-ups and hanging leg raises are listed as "body only" but need a bar. Locking that field would let a no-equipment session include pull-ups.

**So the importer reads evidence from the source** ([import-exercises.mjs](../../scripts/import-exercises.mjs)):
- **Pull-up bar:** a "body only" exercise whose instructions name a pull-up or chin-up bar needs one.
- **A pull-up:** an exercise that pulls up to the bar, with "pull-up" or "chin" in its name, also needs the ability to do a pull-up.
- **Jumping:** a jump in the name, or a plyometric leg exercise, needs jumping.
- **Kit the planner can't check:** a decline bench, rack, Smith machine, V-bar or partner in the instructions keeps the equipment unknown, with that kit named as the reason.
- **Gym kit:** barbell, kettlebells, EZ bar, cable, machine, medicine ball, exercise ball and foam roller are now planner equipment. 592 of the 876 exercises can now be added; only about 250 could before.

**In the app:**
- `whyNotAddable` says in one sentence why an exercise can't be added.
- `reviewExercise(entry, minutes)` takes only the planning block from the person.
- The review sheet shows Area, Equipment, Needs and Level as facts, with no checkboxes. "Add to my exercises" is still the explicit confirmation.

## 3. Ready-made days

[packs.ts](../../apps/web/src/domain/training/packs.ts) has Leg day, Push day, Pull day, Core and Full body. Each is a reviewed list of real library exercises, main lifts first. Dumbbell presses that need a bench are left out, because the source doesn't say so.

- **Difficulty:**
  - Easy is 4 exercises × 2 sets, beginner only.
  - Medium is 5 × 3, intermediate first.
  - Hard is 6 × 4, expert first.
  - An exercise that needs a pull-up or jumping is never Easy, even though the source calls pull-ups "beginner".
- **Where:** No equipment, Home kit (dumbbells, band, kettlebells, pull-up bar) or Gym (everything).
- **Spread:** rounds of one exercise per muscle, or per area on a full-body day, so nothing doubles before everything has one.
- **Honest gaps:** a pull day with no equipment says nothing fits, rather than inventing an exercise.

| Day | Easy, no equipment | Easy, gym |
|---|---|---|
| Leg day | Bodyweight Squat, Butt Lift (Bridge), Single Leg Glute Bridge, Glute Kickback | Barbell Squat, Stiff-Legged Dumbbell Deadlift, Standing Calf Raises, Butt Lift (Bridge) |
| Full body | Bodyweight Squat, Butt Lift (Bridge), Pushups, Plank | Barbell Squat, Barbell Bench Press, Bent Over Barbell Row, Plank |

## 4. Allocation across every time

A sweep of every target from 0 to 150 minutes, in four real setups, found two bugs in the target-duration change.

1. **Areas you didn't choose.** Ranking on duration padded sessions with any exercise. Push and pull for 15 minutes returned jump squats and a plank, and 4 minutes returned a plank alone. "What to train" is now a hard rule in `ineligibleReason`, checked after equipment and before time: "it trains core, which you did not choose today". The form also asks for at least one area.
2. **Repeats piled onto one exercise.** At 90 minutes with all kit, the remainder search (your pigeonhole idea) found the right total of 90. But it built the leftover from the fewest, longest blocks, so it gave the floor press five times. `rounds.ts` keeps that search for the total. Then a bounded subset-sum allows at most 1 extra of each block, then 2, and so on. The first limit that makes the leftover exactly is the most even spread.

| Setup | 15 min | 60 min | 90 min |
|---|---|---|---|
| No kit, push and pull (default) | Push-up ×2 (12 min, only push-ups fit) | Push-up ×10 | Push-up ×15 |
| Dumbbells, push and pull | Row + push-up (14) | Floor press ×3, row ×3, push-up ×2 | Floor press ×4, row ×5, push-up ×3 |
| All kit, every area | Band pull-apart, plank, push-up | 60/60 | Six cards ×2, pull-up and push-up ×1 (was floor press ×5) |

**Tests:**
- Every whole-minute target from 0 to 150, in each setup, is checked against the brute-force subset oracle (now with the area rule) and a direct reachability oracle for repeats.
- The planned time never shrinks as the target grows.
- A brute-force search confirms no block repeats more than it must.

## Verified

- `npm run check` is green: typecheck, all app tests, hook tests, 28 coach tests and 7 importer tests. The production build passes.
- **Browser pane** at laptop width and 375 px:
  - The review sheet shows fixed facts. Pullups show "Pull-up bar" and "A pull-up". Decline crunches are blocked with a reason.
  - Ready-made days update on every choice.
  - The plan form gave exactly the hand-worked sessions above.
  - No horizontal overflow at 375 px.
- **Not verified:** the phone, and the restarted coach service through the app. The USDA fix was checked by calling the service code directly.

## Explain-back questions

- Why can't "body only" be trusted to mean no equipment, and what evidence does the importer use instead?
- Why is "What to train" a hard rule and not a ranking term? What went wrong when it was a ranking term?
- The remainder search proves the total. Why is a second, bounded search needed to choose which blocks repeat?
