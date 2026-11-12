# Health Companion

## Current handover to Claude Code — 11 Nov 2026, after phone barcode failures

Read this section before older milestone/handover notes. Yash has stopped Codex application changes because repeated barcode fixes have not delivered a dependable flow. He asks Claude to audit and simplify the affected code, finish the tests below, and explain the result plainly. Do not add another provider or patch before reproducing the failure and reviewing the existing path.

### Checkout, save point and scope

- Actual checkout: `C:\Users\User\OneDrive - Monash University\Desktop\HealthCompanion`. Do not assume the similarly named Documents/ChatGPT folder is the working repository.
- Branch: `feat/ai-trainer`. Application save point: `9754eab`, pushed; working tree was clean when this documentation handover began. Run `git status` and `git log` on takeover to detect later changes.
- Codex ran `npm run check` successfully before this documentation update. The application checkpoint had also passed check/build. Passing automated tests has NOT established barcode reliability or nutrition accuracy.
- Keep one interview guide: `docs/milestones/interview-walkthrough.md`; detailed observations: `docs/test-log.md`. Older handovers contain superseded instructions about cloud sync, sign-in and diary sharing.
- Target hosts remain Vercel frontend and Render backend. `deploy/README.md` and templates are preparation only; no hosted acceptance is recorded. Interview: Fri 13 Nov, 1:35 pm MYT.
- MIT covers original code; third-party datasets/models/dependencies retain their own terms. Gemini is Free Tier: diary sharing stays blocked in UI, client and service. Do not enable it for the demo.
- No Firestore/vector/PostgreSQL migration, new authentication, model ensemble, downloads, training or sealed-evaluation rerun in this repair. Keep the local diary intact.

### What has been built

- M1–M3: IndexedDB diary, food labels, parser, review/confirm, immutable correction/undo history, workout/sleep logs, backup/restore, offline shell. Schema v5 now includes chosen exercises and local profile.
- M4: offline exercise search, custom/chosen cards, deterministic eligibility, target-duration planner and optional repeated rounds. The trained intent router lost to keyword rules and does not ship.
- M5: Trainer, Nutritionist and Coach chat, bounded tools, reviewed-card retrieval, safety gates, local profile/adaptations; MCP stdio tested, actual client connection not established by this handover.
- M6/M7: local photo-model experiments and exported single-dish fallback; the main multi-food photo flow uses Gemini. Evaluation limitations remain in the existing walkthroughs; benchmark scores are not real-plate accuracy.
- UI organised into pages/components/hooks with I/O in data/api, data/storage and data/diary. Me has local profile/storage/backup, no separate Google account card.
- Recent meal fixes: inline amount corrections, published biscuit serving counts, preservation of cup/bowl text, automatic typical-serving estimates for open portions. Sources/ranges/Not saved remain visible; Use estimate and Save meal are separate confirmations.
- Recent photo fixes: do not invent uncertain quantities, warn on omitted/unidentified foods, check the full plate, retain user editing before nutrition lookup. Yash confirmed beef recognition and the salmon/radish/egg example after retests; exact quantities and nutrient accuracy were not established.
- Capture is on Today; Foods is the saved-food list. Hosted uploads require the relevant explicit action or remembered plate-photo opt-in. Barcode scanning itself remains on-device.

### Current barcode pipeline and what actually failed

1. `ui/components/meals/BarcodeScan.tsx` uses the browser BarcodeDetector and `vision/confirmBarcode.ts` (ZXing, tighter/padded crops/full frame). Agreement fills digits; one reading or disagreement shows choices. The person must tap Look up. No barcode photo is sent by that scan.
2. `data/api/barcode.ts` posts only digits to /api/barcode. `coach/barcode.py` requires an exact USDA Branded GTIN with a usable basis. It then tries `coach/barcode_verify.py` and Tavily retailer excerpts. This route no longer uses Open Food Facts; the separate named-food estimator still can.
3. Retailer checks require a listed retailer domain, explicit matching barcode, one per-100 g/mL basis and compatible values. Code picks the most complete agreeing label; no AI agent ranks sources and no public database is edited.
4. `PacketLabelCapture.tsx` plus /api/barcode/label and `coach/packet_label.py` allow a separate explicitly submitted nutrition-panel photo. Gemini transcribes; code validates barcode/basis, converts kJ, and keeps unreadable or bounded values unknown. This is an editable draft, not guaranteed fact-checking.
5. Latest phone screenshot at 21:08 shows correct digits `9310947004582` and “No matching label was found”. The lookup is still unsuccessful for Yash's packet. A screenshot of correct digits does not establish whether they were auto-filled, selected or typed.
6. Earlier the same photo yielded `9310947048982`. Both numbers pass EAN checksum; checksum alone cannot settle this. The strict two-reader fix then rejected a clear photo, prompting the current choice/crop fix.
7. Earlier OFF imports showed 52.2 kcal on a 100 g basis alongside 2410 kJ, contradictory fat fields, qualified values treated as exact and sodium differing from the packet. Subsequent patches alternated rejection, partial drafts and source replacement. These are real reported failures, not a completed barcode acceptance.
8. One prior product-specific exception was removed. Do not reintroduce hardcoded product codes/nutrients or silently substitute a nearby product. The packet image is diagnostic evidence; do not commit personal photos or diary data as fixtures.
9. Last recorded live lookup: exact USDA example `009800830022` returned a draft; Yash's spread returned no verified label. This is limited coverage evidence, not proof that all barcodes work.
10. A local crop of Yash's clear photo decoded the correct digits using ZXing. Choice UI unit tests passed. Repeated physical-phone scan reliability, packet-label transcription and save/reload remain unverified.

### The code mess Claude must review and resolve

- Audit the chain of small fixes from `090695c` through `9754eab` before changing behaviour. Key commits: `9c1ac96` packet reader, `3f34ea0` source replacement, `cd8782e` strict agreement, `9754eab` confirmation choices. Do not blindly revert the chain or discard fixes to privacy/unknown values.
- Separate scan failure, ambiguous digits, unavailable service, verified no-match and conflicting label in the flow. The current repeated error/fallback experience leaves Yash stuck; the fallback has not completed phone acceptance.
- Review duplicated or obsolete validation, fallback messages, imports and tests after OFF was removed from this route. Shared OFF parsing still serves named-food estimates; establish callers before deleting anything.
- Review the retailer extractor's narrow coverage: fixed domains, mandatory explicit GTIN in an excerpt, rejection of mixed columns, and almost exact cross-source numeric agreement can reject legitimate labels. Do not weaken identity/unit checks merely to make this product pass. First measure which stage rejects evidence; distinguish extraction failure from no coverage.
- Review browser support and error paths: capture currently depends on native BarcodeDetector even though ZXing exists; native exceptions and invalid candidate readings deserve targeted tests. These are audit targets, not reproduced additional phone failures.
- Review unit and provenance handling end to end: per-serving versus per-100, g versus mL, kJ/kcal, sodium units, bounds such as <1 g, missing versus true zero, AI-transcribed versus database facts. Do not combine nutrients from different recipes/revisions or round stored values.
- Improve a missing-label path only after agreeing its acceptance test: make packet transcription reachable and understandable, with a reviewable source/basis and no automatic upload or save. Do not promise an AI verifier can create missing database coverage.
- Keep changes small: suggest a Git save point, reproduce with failing tests, simplify one responsibility/folder at a time, remove proven dead code, check/build, show the diff. Preserve FIT3080 comments, SOLID where useful, YAGNI, files <=300 lines, explicit staging and green pushes. Reserved planner/training functions still require Yash's sign-off.
- This handover is not a full architecture audit. The evidenced problem is repeated barcode rework with incomplete end-to-end acceptance. Claude must inspect and identify actual dead/duplicated code before claiming it cleaned everything.

### Physical-phone acceptance remaining before hosting

Use the same localhost origin, reload the rebuilt app twice and export a backup first. Guide Yash one test at a time; record PASS/FAIL/NOT TESTED and the build/commit. Do not clear his storage to fix stale results.

| Area | Existing evidence | Still required |
|---|---|---|
| Meal estimates | Initial serving bug FAIL; Yash reported fresh cereal lookup working after deselecting the old saved food | Retest fresh cereal against its own packet, source/basis/range, no save before confirmation; saved old versions must remain unchanged |
| Inline correction | Automated regression passed | Phone `200ml milk no wait 300ml`: review the intended correction, never send `no wait` as food name |
| Correction/undo | Phone PASS: milk 300→250→300 mL | Open revision history, reload and verify persistence and no unintended duplicate |
| Plate photo | Phone workflow PASS on selected examples; model mistakes observed | Check edit/remove/missing ingredient, opt-in off/on, changing photo during a pending request, quota/unreachable fallback and no unintended save |
| Barcode scan | Latest screenshot has correct digits; previous wrong reads and rejection FAIL | Repeat the same image; test a different packet, rotation, one-reader disagreement, manual entry and no request before Look up |
| Barcode nutrition | Current spread lookup unresolved/no match | Complete packet-label fallback with source/basis, compare every visible value, keep <1/missing unknown, confirm food then reload; test a verified lookup from another product |
| AI tab | Earlier laptop greeting/Trainer checks only | Greeting, general nutrition question, no-kit timed session, refusal case, diary-sharing disabled; confirm no diary/profile request fields |
| Gym | Earlier laptop 60-minute/search checks | Offline search/add/remove, arbitrary duration, repeated rounds on/off, truthful shortfall, profile restrictions applied to local and AI plans |
| Workout/sleep | Earlier isolated laptop save/reload passed | Phone workout and overnight sleep review/save/reload; distinguish time in bed from reported sleep |
| Offline | Earlier laptop cached-shell reload passed | Disconnect USB and disable Wi-Fi/mobile data, close/reopen app, view and edit a saved-food meal, undo; service errors must leave diary usable |
| Me/backup | Earlier laptop checks only | Profile/adaptations, hide numbers, export/download; restore a fictional backup on a separate test origin/device, never erase the real diary |
| Layout/date | Screenshots show usable main flow with long cards | Keyboard and bottom-dock access to actions, scroll/close sheets, date change on device clock; no destructive clock/data manipulation needed |

### Laptop acceptance remaining before hosting

- Fresh `npm run check` and `npm --prefix apps/web run build` after repairs; distinguish unit/mock tests from live API/browser/phone tests. Existing large-bundle warning is not resolved by a passing build.
- Verify port 8000 belongs to this checkout's current service and preview 4173 serves the new assets. GET /api/health directly and via preview. A 200 proves reachability, not provider availability or label correctness. Never print config/key values.
- Reproduce barcode cases through the production preview: repeated supplied-photo decode locally, other products, disagreement, incorrect digits, no-match, timeout/quota, packet mismatch, missing name and multi-column labels. Keep remote uploads explicit.
- Add/retain generic fictional boundary regressions for exact GTIN, units/basis, conflicting recipes, <1 values, nulls, source selection and draft-only persistence. Inspect actual network payloads using fictional records.
- Exercise packet-reader UI through review/confirm/reload on an isolated fictional diary. Its automated validation tests alone are insufficient acceptance.
- Recheck privacy gates (context blocked before model), local storage transaction/revision/backup paths, offline unavailable-provider behaviour and the unaffected meal/photo/Gym paths after simplification.
- Audit deployment readiness in `deploy/README.md`: Linux dependencies, Render startup/memory/cold start, exact origins, Vercel /api rewrite, missing model files/cache, model endpoint abuse/quota controls and secrets only on backend. Resolve or explicitly document limits before public exposure.
- Hosting itself is separate acceptance: actual URLs, HTTPS health through Vercel, phone on mobile data without USB, optional AI outage and offline reopen. A hosted origin has separate IndexedDB; no diary transfers automatically.
- Update this section, the test log, the single interview walkthrough and AI contribution log with honest final outcomes. Teach Yash the folder map and one save-button story, then quiz him; do not claim he understands until he explains it.

A free, local-first diary for balancing food, exercise and sleep. It remembers what was logged, accepts corrections, and always shows what it knows versus what it estimated. Built in six days (8–13 Nov 2026) by Yash, with Claude Code (architecture, frontend) and Codex (Python backend, PyTorch). Yash reviews every diff and explains the code himself.

## Beginner-readable architecture and refactoring (Yash, 10 Nov)

Read this file first in every new chat. When explaining the app, start with a 10-year-old-friendly folder map before technical details.

- Screens belong in `ui/pages/`: one screen per file.
- Reusable UI belongs in `ui/components/`: check existing components first and reuse them.
- Saving, loading and API logic belong in `data/`: check existing data modules before writing new code. API requests now live in `data/api/`. `data/storage/` owns persistence and `data/diary/` owns reusable diary loading; hooks coordinate screen state around these services. Do not duplicate these modules.
- Keep pure calculations and rules in `domain/`; UI state belongs in hooks, not data services.
- Give each file one job and keep authored code files at or under 300 lines. Do not grow a file past the limit; split it by responsibility.
- Before changes, suggest a Git save point. Refactor one folder at a time without changing behaviour, then confirm checks/build and relevant UI behaviour before the next folder. Keep explicit-path staging and green commits.
- This authorises small, behaviour-preserving organisation work despite the earlier pre-interview refactor freeze. Do not mix feature changes, database migration or reserved algorithm edits into it.

## Stack
- `apps/web`: Vite + React 19 + TypeScript PWA.
  - Diary in IndexedDB.
  - Hand-written service worker (`src/sw/service-worker.js`, filled in by the build).
  - No backend for the diary.
- `services/coach`: optional FastAPI nutrition estimates on 127.0.0.1:8000, proxied as `/api`. USDA/Open Food Facts first, Tavily public nutrition retrieval on a miss, then whichever hosted model is available: Groq, Gemini or Hugging Face, listed once in `hosted_models.py` (a new provider is one more entry) and asked through one queue (`availability.py`) where a model that fails moves to the back. Every caller falls back on the same `PROVIDER_FAILURES` (`failures.py`). It also serves the AI Trainer (`trainer.py`, bounded agent in `agent.py`), the AI Nutritionist (`nutritionist.py`, ideas that only become drafts), the grounded Coach (`rag/`, `safety.py`: fused BM25 and MiniLM over reviewed cards, sealed result in `eval/results/retrieval_final.json`; with no card on a topic it gives the model's own answer, labelled as unchecked, and the refusals still come first), a photo reader (`photo.py`: Gemini lists the foods in one photo as checked entry text, never nutrients), a barcode lookup (`barcode.py`) and an MCP stdio server (`mcp_server.py`); the three coaches ask Groq or Gemini through that queue (`llm.py`); each reply carries the model that wrote it, but the app shows the role (Coach or Nutritionist) instead, as Yash asked on 10 Nov; the diary never depends on this service.
  - Model output is never trusted for arithmetic or certainty: a model estimate needs a real low-high range, its energy must agree with 4 × protein + 4 × carbohydrate + 9 × fat within 25%, and a count of servings is asked as one serving and multiplied in code (`model_client.py`). Sources are shown as plain text, not links.
- `experiments/router` (M4, FIT3181, finished 8 Nov): fictional family-split data, baselines, frozen MiniLM encoder, `Linear(384, 6)` head and runner. The sealed test ran once and the head did not beat the keyword rules, so it does **not** ship; `results/final.json` is the record and `run final` refuses a second run. Its own `.venv` reuses `fit3181` packages read-only. Explain-back: `docs/milestones/m4-walkthrough.md`.
- `experiments/vision` (M6, FIT3181, 9 Nov): dish-photo classifier. Two ViT-Small backbones with a frozen head, then hand-written LoRA (`lora.py`); the sealed test runs once, and the winner is merged into an ordinary ViT and exported to ONNX in `apps/web/public/models/dish/`. Its own `.venv` reuses `fit3181`; photos and checkpoints stay in `~/hc-vision`. LoRA shipped: 91.3% top-1 on the sealed photos against 88.3% for the frozen head. The rule and the data licences are in its `README.md`; the record is `results/final.json`. Explain-back: `docs/milestones/m6-walkthrough.md`.
- `experiments/vision`, global model (M7, 9 Nov, `run_global.py`): SigLIP2 ViT-B/16 with LoRA, whose head is fixed text vectors of food names (`global_model.py`), so a food is a name. 686 names on the phone, exported with 16-bit weights (187 MB, `halve_weights`, because 8-bit weights changed the first guess on 18% of photos). It shipped by its rule: 94.0% top-1 on the first sealed photos against their 109 names (a second look). Among the phone's 686 names, fine-tuning buys the dishes it saw 79.7% against 62.7% on validation, and costs the dishes it never saw: 35.5% against 49.8% for SigLIP2 alone. On 67 dishes kept out of training (`run_holdout.py`, validation only), LoRA at half strength holds unseen dishes at 63.6% against 51.2% at full strength, for 5 points on trained dishes; it is not on the phone. A retrain on every ISIA photo at half strength (`run_full.py`) did not ship: on fresh sealed photos it averaged 56.4% against the phone model's 46.4%, but fell to 64.2% against 83.2% on Malaysian validation photos, more than the 5 points its rule allowed, so the phone keeps the first fine-tune. Records: `results/global_*.json`. Explain-back: `docs/milestones/m7-walkthrough.md`.

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
  - `dish/dishModel`: everything around the photo model that must match training (crop placement, normalisation, top guesses). `dish/photoReply`: the hosted photo reader's reply, joined into one entry.
  - `chat/chatIntent`: keyword rules that decide whether a chat message is a question, a food idea or a session, and read the session's length, place and difficulty.
  - `training/workouts`, `sleep/sleep`: build and describe workout and sleep entries.
  - `week/weekOverview`: one line per day of food, training and sleep; a day with nothing logged stays a gap.
  - `parsing/`: the composer grammar. `parseEntry` tries an ordered list of small parsers (`question`, `correction`, `sleepEntry`, `workoutEntry`, `meal`); a new kind of entry is a new parser in that list.
- `data/exercises/`, `scripts/import-exercises.mjs`, `apps/web/src/data/`: pinned Unlicense exercise source and reproducible offline search index; see `docs/data/exercise-dataset.md`.
- `apps/web/src/data/storage/`: `connection` (open, schema upgrades, `runTransaction`), `foodsRepo`, `mealsRepo`, `logsRepo`, `customCardsRepo` (immutable exercise-choice snapshots, schema v4), `profileRepo` (immutable device-only adaptations, schema v5), `persistence`, and `backup/` (`format`, `validate` with one checker per store, `transfer` for export/restore/erase).
- `apps/web/src/data/api/`: HTTP boundary to the optional coach service, with response validation.
- `apps/web/src/data/diary/`: reusable diary loading, including the gated seven-day summary loader.
- `apps/web/src/vision/`: the Web Worker that runs the dish model on the device with `onnxruntime-web`. The model is too large to precache, so the service worker keeps it after its first download.
- `apps/web/src/ui/`: responsive React screens, local Geist/Phosphor assets, compact draft/result presentation. They call domain and storage and never compute totals themselves. `App.tsx` is the shell, `format.ts` holds display text and rounding, and `app.css` loads before `gym.css`.
  - `pages/`: one file per screen (`TodayView`, `GymView`, `FoodsView`, `AiView`, `MeView`, `FirstRunSetup`). A page connects its parts.
  - `components/`: the parts of a screen, one folder per feature (`today`, `meals`, `training`, `sleep`, `summary`, `me`, `ai`). `ai/` is the one chat on the AI tab: `askAi` routes a message to the Coach, Nutritionist or Trainer service, and `ChatReply` shows the answer under its role. `shared/` holds pieces more than one feature uses (`Sheet`, `NoticeLine`, `Choices`, and `Field` for every labelled input).
  - `hooks/`: screen state with a job of its own (`useBusy` for a slow action and its error, `useSave` when a save needs an operation key and a conflict notice, `useToday`, `useDiaryDay`, `useEntryPanel`).
- `apps/web/src/test/`: test-only helpers (`goldenFixture`, `testFoods`). Never imported by app code.
- `eval/fixtures/`: fictional golden cases. `ledger_golden.json` is the source of truth for totals.
- `docs/`: ADRs, milestone walkthroughs, the device test log and the AI contribution log.

## Design rules
- **SOLID where it pays:** single-purpose modules, extension by adding to a list (parsers, backup checkers, `MealEdit` cases), and dependencies pointing inward (UI → storage → domain).
- **YAGNI:** no interface with one implementation, no wrapper or export without a caller in app code, no speculative options. Delete code the app stopped using.
- **One job per file, at most 300 lines.** Split a file by job before it grows past that. Check existing oversized files separately; do not expand them while reorganising another folder.
- **Responsive UI:** `ui/app.css` owns the spacing/type/surface tokens. The app uses a sidebar and two columns on laptops, and an edge-to-edge single column with a bottom dock on phones. Do not restore a narrow fixed-width wrapper around the whole app. Sources and secondary explanations stay expandable; confirmation remains explicit.

## Invariants (never break these)
1. **Unknown is not zero.** A blank label value is `null` and shows as "+ N unknown"; a nutrient no item has a value for shows "Unknown". A nutrient missing from an older record or response is unknown. An empty day is "nothing logged".
2. **Snapshots are immutable.** Corrections, undo and deletes add a revision; nothing is edited in place.
3. **One write = one IndexedDB transaction.** Every write carries an operation key (replay on retry) and an expected revision (conflict on a stale screen).
4. **Nothing saves without the user confirming.** The parser, and any future AI, only fill drafts.
5. **Diary sharing is explicit.** The current MVP keeps its diary/profile in IndexedDB. Optional services receive only the typed request fields, barcode digits, or a small metadata-free photo after a tap or the remembered photo opt-in. The separate seven-day switch sends bounded dated summary lines only when enabled and resets on reopening the AI screen; diary sharing is currently paused at the UI, client and server boundaries because Yash confirmed Gemini Free Tier (10 Nov). The Me-page account card is removed (Yash, 10 Nov); a developer-owned Firebase project is not user authentication or cloud sync. General multi-user sign-in and a possible Render PostgreSQL migration are later work. No telemetry; fictional fixtures only. Nothing saves without confirmation.
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

Current work is the 11 Nov repair handover at the top of this file. The photo path and automatic estimates already exist; do not rebuild them from the historical codex-11-nov.md checklist.


## New cloud direction (Yash, 10 Nov)

Yash now requests Firebase cloud storage and AI access to his own saved diary/profile for analysis. This authorises a change from the earlier local-only direction; read `docs/handoff/firebase-diary.md` (from the repo root) before implementing it. The configuration template is prepared, but auth, migration, cloud repositories and diary-aware AI are not implemented yet. Existing local data and current request boundaries remain in place until that tested path ships. No existing records may be erased as an implicit part of setup.


## MVP and interview decision (Yash, 10 Nov)

Use `docs/milestones/interview-walkthrough.md` as the single interview walkthrough. Vercel frontend and Render backend are selected for hosting tomorrow. Remove the separate sign-in card from Me; general multi-user sign-in is later work. PostgreSQL on Render may replace the earlier Firestore/vector plan later; do not start a database migration for this MVP. This supersedes older account/cloud-plan notes. Existing diary data stays intact.


Current privacy decision, 10 Nov: Yash confirmed the Gemini project is Free Tier and chose to keep diary sharing off. The sharing switch is disabled, the browser request helper rejects context without fetching, and the server returns 403 for context before calling a model. Generic typed messages still use the existing route. Google terms and account-tier review must precede any later Gemini-only private-context route; no billing was enabled. Update, 12 Nov: Yash re-enabled sharing under three conditions. The switch stays off by default and resets when the AI screen is reopened; the seven-day summary is sent only for a signed-in account (the service answers 401 without a valid session cookie, and the browser sends that cookie only with a request that carries diary lines); and it goes only to Groq, which does not keep inference data by default, never to Gemini or Hugging Face, even when Groq fails (the person is then told it is busy). The rule is the constant DIARY_MODELS in services/coach/coach/llm.py. The profile and photos are never sent, and a Coach question also carries at most six earlier messages of the open chat, labelled as data and never saved.


## Hosting preparation checkpoint (10 Nov)

Original code is MIT; read LICENSE and THIRD_PARTY_NOTICES.md for scope. deploy/ contains reviewed examples, not a live deployment. Exact host/origin configuration and a credential-free /api/health endpoint preserve local defaults. See docs/testing/2026-11-10-hosting-preparation.md for checks and pending hosted/phone gates.


## Photo recognition follow-up after the interview (Yash, 11 Nov)

- Compare Gemini with the already installed Ollama vision model `qwen3.5:4b` on the same labelled plates. Include coated proteins, mixed sides and countable items. Record dish accuracy, duplicate portions, useful abstentions, latency and quota failures.
- Add a bounded laptop fallback for a Gemini quota error, timeout or unusable reply if local Qwen meets the latency budget. Keep one photo response validator and the existing draft confirmation. Render needs a reachable backup of its own. Evaluate a separate Groq vision setting (`qwen/qwen3.8-27b`) or a served Hugging Face vision model if access and cost fit. The current text model settings do not configure vision.
- If model voting improves the benchmark, align candidates by plate region, normalise equivalent names and weight each model using measured reliability. Let uncertain regions ask for a confirmation. Raw token log probabilities across providers are incomparable. For likelihood-based ranking, use one local verifier to score the same fixed candidates per region. Score a small shortlist directly and consider beam search only when joint plate combinations make enumeration expensive.
- Route the selected photo through the existing consent boundary and keep diary and profile data on the device. Use fictional test fixtures. Keep the manual entry path and make no write until confirmation.
