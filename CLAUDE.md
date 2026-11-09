# Health Companion

A free, local-first diary for balancing food, exercise and sleep. It remembers what was logged, accepts corrections, and always shows what it knows versus what it estimated. Built in six days (8–13 Nov 2026) by Yash, with Claude Code (architecture, frontend) and Codex (Python backend, PyTorch). Yash reviews every diff and explains the code himself.

## Stack
- `apps/web`: Vite + React 19 + TypeScript PWA.
  - Diary in IndexedDB.
  - Hand-written service worker (`src/sw/service-worker.js`, filled in by the build).
  - No backend for the diary.
- `services/coach`: optional FastAPI nutrition estimates on 127.0.0.1:8000, proxied as `/api`. USDA/Open Food Facts first, Tavily public nutrition retrieval on a miss, then Groq with Hugging Face hosted inference as a final optional fallback. It also serves the AI Trainer (`trainer.py`, bounded agent in `agent.py`), the AI Nutritionist (`nutritionist.py`, ideas that only become drafts), the grounded Coach (`rag/`, `safety.py`: fused BM25 and MiniLM over reviewed cards, sealed result in `eval/results/retrieval_final.json`) a barcode lookup (`barcode.py`) and an MCP stdio server (`mcp_server.py`); the diary never depends on this service.
  - Model output is never trusted for arithmetic or certainty: a model estimate needs a real low-high range, its energy must agree with 4 × protein + 4 × carbohydrate + 9 × fat within 25%, and a count of servings is asked as one serving and multiplied in code (`model_client.py`). Sources are shown as plain text, not links.
- `experiments/router` (M4, FIT3181, finished 8 Nov): fictional family-split data, baselines, frozen MiniLM encoder, `Linear(384, 6)` head and runner. The sealed test ran once and the head did not beat the keyword rules, so it does **not** ship; `results/final.json` is the record and `run final` refuses a second run. Its own `.venv` reuses `fit3181` packages read-only. Explain-back: `docs/milestones/m4-walkthrough.md`.
- `experiments/vision` (M6, FIT3181, 9 Nov): dish-photo classifier. Two ViT-Small backbones with a frozen head, then hand-written LoRA (`lora.py`); the sealed test runs once, and the winner is merged into an ordinary ViT and exported to ONNX in `apps/web/public/models/dish/`. Its own `.venv` reuses `fit3181`; photos and checkpoints stay in `~/hc-vision`. LoRA shipped: 91.3% top-1 on the sealed photos against 88.3% for the frozen head. The rule and the data licences are in its `README.md`; the record is `results/final.json`. Explain-back: `docs/milestones/m6-walkthrough.md`.
- `experiments/vision`, global model (M7, 9 Nov, `run_global.py`): SigLIP2 ViT-B/16 with LoRA, whose head is fixed text vectors of food names (`global_model.py`), so a food is a name. 686 names on the phone, exported with 16-bit weights (187 MB, `halve_weights`, because 8-bit weights changed the first guess on 18% of photos). It shipped by its rule: 94.0% top-1 on the first sealed photos against their 109 names (a second look). Among the phone's 686 names, fine-tuning buys the dishes it saw 79.7% against 62.7% on validation, and costs the dishes it never saw: 35.5% against 49.8% for SigLIP2 alone. On 67 dishes kept out of training (`run_holdout.py`, validation only), LoRA at half strength holds unseen dishes at 63.6% against 51.2% at full strength, for 5 points on trained dishes; it is not on the phone. Records: `results/global_*.json`. Explain-back: `docs/milestones/m7-walkthrough.md`.

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
  - `profile/profile`: validated local adaptations; `training/seated` supplies reviewed local fallback movements. `loads`/`positions` are explicit annotations in `data/exercises/adaptations.json`; unknown facts fail closed for relevant active restrictions. Explain-back: `docs/milestones/m5-profile-walkthrough.md`.
  - `training/customCards`: chosen exercises and the person's own (`own:` IDs; blank facts stay unknown).
  - `profile/body`: height, weight, BMI and energy estimates (unknown when a fact is missing). `profile/weightTrend`: recorded weights from saved versions. `nutrition/balance`: food against estimated need. `training/cardio`: ACSM walk and run energy, always a range.
  - `dish/dishModel`: everything around the photo model that must match training (crop placement, normalisation, top guesses).
  - `training/workouts`, `sleep/sleep`: build and describe workout and sleep entries.
  - `week/weekOverview`: one line per day of food, training and sleep; a day with nothing logged stays a gap.
  - `parsing/`: the composer grammar. `parseEntry` tries an ordered list of small parsers (`question`, `correction`, `sleepEntry`, `workoutEntry`, `meal`); a new kind of entry is a new parser in that list.
- `data/exercises/`, `scripts/import-exercises.mjs`, `apps/web/src/data/`: pinned Unlicense exercise source and reproducible offline search index; see `docs/data/exercise-dataset.md`.
- `apps/web/src/storage/`: `connection` (open, schema upgrades, `runTransaction`), `foodsRepo`, `mealsRepo`, `logsRepo`, `customCardsRepo` (immutable exercise-choice snapshots, schema v4), `profileRepo` (immutable device-only adaptations, schema v5), `persistence`, and `backup/` (`format`, `validate` with one checker per store, `transfer` for export/restore/erase).
- `apps/web/src/api/`: HTTP boundary to the optional coach service, with response validation.
- `apps/web/src/vision/`: the Web Worker that runs the dish model on the device with `onnxruntime-web`. The model is too large to precache, so the service worker keeps it after its first download.
- `apps/web/src/ui/`: responsive React screens, local Geist/Phosphor assets, compact draft/result presentation. They call domain and storage and never compute totals themselves. `App.tsx` is the shell, `format.ts` holds display text and rounding, and `app.css` loads before `gym.css`.
  - `pages/`: one file per screen (`TodayView`, `GymView`, `FoodsView`, `MeView`, `FirstRunSetup`). A page connects its parts.
  - `components/`: the parts of a screen, one folder per feature (`today`, `meals`, `training`, `sleep`, `summary`, `me`). `shared/` holds pieces more than one feature uses (`Sheet`, `NoticeLine`, `Choices`).
  - `hooks/`: screen state with a job of its own (`useSave`, `useToday`, `useDiaryDay`, `useEntryPanel`).
- `apps/web/src/test/`: test-only helpers (`goldenFixture`, `testFoods`). Never imported by app code.
- `eval/fixtures/`: fictional golden cases. `ledger_golden.json` is the source of truth for totals.
- `docs/`: ADRs, milestone walkthroughs, the device test log and the AI contribution log.

## Design rules
- **SOLID where it pays:** single-purpose modules, extension by adding to a list (parsers, backup checkers, `MealEdit` cases), and dependencies pointing inward (UI → storage → domain).
- **YAGNI:** no interface with one implementation, no wrapper or export without a caller in app code, no speculative options. Delete code the app stopped using.
- **One job per file, at most 300 lines.** Split a file by job before it grows past that. A test file may run longer, because one module's cases belong together.
- **Responsive UI:** `ui/app.css` owns the spacing/type/surface tokens. The app uses a sidebar and two columns on laptops, and an edge-to-edge single column with a bottom dock on phones. Do not restore a narrow fixed-width wrapper around the whole app. Sources and secondary explanations stay expandable; confirmation remains explicit.

## Invariants (never break these)
1. **Unknown is not zero.** A blank label value is `null` and shows as "+ N unknown"; a nutrient no item has a value for shows "Unknown". A nutrient missing from an older record or response is unknown. An empty day is "nothing logged".
2. **Snapshots are immutable.** Corrections, undo and deletes add a revision; nothing is edited in place.
3. **One write = one IndexedDB transaction.** Every write carries an operation key (replay on retry) and an expected revision (conflict on a stale screen).
4. **Nothing saves without the user confirming.** The parser, and any future AI, only fill drafts.
5. **No diary history leaves the device.** Optional services may send only what the person typed or picked for that request: food name and portion text for a lookup; the digits of a barcode; goal, minutes, kit, areas and level for the Trainer; the goal for the Nutritionist; the question for the Coach. A plate photo never leaves the device. No accounts, telemetry or other personal-data uploads. Fixtures are fictional only.
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

Current work: test the global food model and the features still untested on the phone (`docs/test-log.md`). Earlier rules and later ideas: `docs/handoff/codex-m5.md`.
