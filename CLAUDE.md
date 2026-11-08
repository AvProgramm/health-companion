# Health Companion

A free, local-first diary for balancing food, exercise and sleep. It remembers what was logged, accepts corrections, and always shows what it knows versus what it estimated. Built in six days (8–13 Nov 2026) by Yash, with Claude Code (architecture, frontend) and Codex (Python backend, PyTorch). Yash reviews every diff and explains the code himself.

## Stack
- `apps/web`: Vite + React 19 + TypeScript PWA.
  - Diary in IndexedDB.
  - Hand-written service worker (`src/sw/service-worker.js`, filled in by the build).
  - No backend for the diary.
- `services/coach`: optional FastAPI nutrition estimates on 127.0.0.1:8000, proxied as `/api`. USDA/Open Food Facts first, Tavily public nutrition retrieval on a miss, then Groq with Hugging Face hosted inference as a final optional fallback. BM25 retrieval and MCP stdio tools remain planned; the diary never depends on this service.
  - Model output is never trusted for arithmetic or certainty: a model estimate needs a real low-high range, its energy must agree with 4 × protein + 4 × carbohydrate + 9 × fat within 25%, and a count of servings is asked as one serving and multiplied in code (`model_client.py`). Sources are shown as plain text, not links.
- `experiments/router` (M4, FIT3181, finished 8 Nov): fictional family-split data, baselines, frozen MiniLM encoder, `Linear(384, 6)` head and runner. The sealed test ran once and the head did not beat the keyword rules, so it does **not** ship; `results/final.json` is the record and `run final` refuses a second run. Its own `.venv` reuses `fit3181` packages read-only. Explain-back: `docs/milestones/m4-walkthrough.md`.

## Commands
```bash
npm run check                                     # typecheck + all tests (same as the hook and CI)
npm --prefix apps/web run build                   # production build, regenerates sw.js
npm --prefix apps/web run preview                 # serves the build at 127.0.0.1:4173 for the phone
```
Phone setup and the offline gate are in `docs/test-log.md`. Start the optional laptop service using `services/coach/README.md`; VS Code instructions are in `docs/run-locally.md`. Read `docs/handoff/integrations.md` before later retrieval/model work. Credentials stay in the ignored root `.env`; the tracked `.env.example` documents names only.

## Where things live
Organised by feature, one reason to change per module. Domain never imports storage or UI.
- `apps/web/src/domain/`: pure logic. This is where the numbers come from.
  - `shared/`: `units` (conversion, no mass↔volume), `validate` (finite-then-range checks), `dates`.
  - `nutrition/`: `estimates` (proposal validation and confirmed food construction), food `types` (with `NUTRIENT_KEYS`, the one list of tracked nutrients: energy, protein, carbohydrate, fibre, total and added sugar, fat, saturated and unsaturated fat, sodium in mg), `scale` (nutrient per portion), `aggregate` (per meal), `day` (per date), `foods` (label versions, name matching).
  - `meals/`: meal `types`, `revisions` (`startMeal`, `reviseMeal`: every change is a new revision), `corrections` (which item "actually 250 mL" means).
  - `training/planner`: bounded target-duration DP (up to twelve distinct cards); ranking updated with Yash's approval on 7 Nov. Explain-back: `docs/milestones/m4-target-duration-walkthrough.md`. `eligibility` hard rules (never suggest, ability, equipment, chosen area, time); `rounds` repeats a round, spreading extra blocks evenly.
  - `training/exerciseSearch`, `training/packs`: library facts are fixed (`whyNotAddable`, only the planning block is the person's); ready-made days are reviewed library lists cut by difficulty and setting. Explain-back: `docs/milestones/m4-gym-fixes-walkthrough.md`.
  - `training/workouts`, `sleep/sleep`: build and describe workout and sleep entries.
  - `parsing/`: the composer grammar. `parseEntry` tries an ordered list of small parsers (`question`, `correction`, `sleepEntry`, `workoutEntry`, `meal`); a new kind of entry is a new parser in that list.
- `data/exercises/`, `scripts/import-exercises.mjs`, `apps/web/src/data/`: pinned Unlicense exercise source and reproducible offline search index; see `docs/data/exercise-dataset.md`.
- `apps/web/src/storage/`: `connection` (open, schema upgrades, `runTransaction`), `foodsRepo`, `mealsRepo`, `logsRepo`, `customCardsRepo` (immutable exercise-choice snapshots, schema v4), `persistence`, and `backup/` (`format`, `validate` with one checker per store, `transfer` for export/restore/erase).
- `apps/web/src/api/`: food-only HTTP boundary and response validation.
- `apps/web/src/ui/`: responsive React screens, local Geist/Phosphor assets, compact draft/result presentation. They call domain and storage and never compute totals themselves.
- `apps/web/src/test/`: test-only helpers (`goldenFixture`, `testFoods`). Never imported by app code.
- `eval/fixtures/`: fictional golden cases. `ledger_golden.json` is the source of truth for totals.
- `docs/`: ADRs, milestone walkthroughs, the device test log and the AI contribution log.

## Design rules
- **SOLID where it pays:** single-purpose modules, extension by adding to a list (parsers, backup checkers, `MealEdit` cases), and dependencies pointing inward (UI → storage → domain).
- **YAGNI:** no interface with one implementation, no wrapper or export without a caller in app code, no speculative options. Delete code the app stopped using.
- **Responsive UI:** `ui/app.css` owns the spacing/type/surface tokens. The app uses a sidebar and two columns on laptops, and an edge-to-edge single column with a bottom dock on phones. Do not restore a narrow fixed-width wrapper around the whole app. Sources and secondary explanations stay expandable; confirmation remains explicit.

## Invariants (never break these)
1. **Unknown is not zero.** A blank label value is `null` and shows as "+ N unknown"; a nutrient no item has a value for shows "Unknown". A nutrient missing from an older record or response is unknown. An empty day is "nothing logged".
2. **Snapshots are immutable.** Corrections, undo and deletes add a revision; nothing is edited in place.
3. **One write = one IndexedDB transaction.** Every write carries an operation key (replay on retry) and an expected revision (conflict on a stale screen).
4. **Nothing saves without the user confirming.** The parser, and any future AI, only fill drafts.
5. **No diary history leaves the device.** Optional nutrition lookup may send only the selected food name and portion text. No accounts, telemetry or other personal-data uploads. Fixtures are fictional only.
6. **Round for display only** (`ui/format.ts`).

## Working rules
- Read the matching file in `.claude/rules/` before editing that area. Code style follows Yash's FIT3080 voice.
- Add a failing test from the exact input before fixing a bug. Phone-reported phrases go in `parse.test.ts` verbatim.
- Run `npm run check` before saying anything works, and say what was verified and where (unit test, browser pane, phone).
- Stage reviewed paths only (`git add <paths>`, never `-A` or `.`). End commit messages with the Co-Authored-By line. Never force-push.
- Each milestone ends with `docs/milestones/mN-walkthrough.md`, so Yash can explain it back in his own words.
- `compareCandidates` (planner objective) and the PyTorch training loop are Yash's to sign off: change them only with his approval. On 8 Nov he asked Claude to write the loop in his style, and he cross-checks it.
- Push to GitHub at every green checkpoint, roughly every 5–6 minutes of work.

Current repeated-round planner and wrap-up: read `docs/handoff/claude-code.md` and `docs/milestones/m4-repeated-rounds-walkthrough.md`. Repetition is explicitly selectable; the earlier distinct-only duration notes are historical.
