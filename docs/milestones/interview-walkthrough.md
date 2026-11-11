# Health Companion: the interview walkthrough

This is the single interview script and feature/code tour for the MVP. Older milestone documents are development history, not additional interview scripts. Yash should explain each section back and mark his actual review in `docs/ai-log.md`.

## Folder map, like explaining it to a 10-year-old

- `ui/pages`: the rooms you visit, such as Today and Gym.
- `ui/components`: reusable building blocks, such as buttons, cards and editors.
- `data/diary`: helpers that fetch diary facts for a screen.
- `data/api`: the messengers that ask the laptop service for information.
- `data`: the home for loading/saving work and bundled facts. `data/storage` holds the local diary filing cabinet.
- `domain`: the rulebook and calculator, with no screen or database calls.
- `ui/hooks`: the screen's short-term memory and action state.
- `services/coach`: the optional laptop helpers for food and coaching.

## Start here: explain it like I am 10

**One sentence:** This app is a notebook that remembers your food, exercise and sleep, with optional helpers that suggest things for you to check.

Think of a house. `ui/pages` are its rooms; `ui/components` are reusable furniture; `data` is the filing cabinet and the delivery desk; `domain` is the rulebook and calculator. `ui/hooks` keep track of what you are doing right now. `services/coach` is an outside helper you can call. The notebook still works when that helper cannot answer. The `.test` files are practice checks using made-up examples, not real diary entries.

### Key files, one at a time

These paths start at `apps/web/src/` unless a row says otherwise. This is the first reading route through the working app, not a claim that these are all the files. The complete feature tour below points to the remaining specialist areas.

| File | Its job in plain English | If we removed it without replacing it |
|---|---|---|
| `ui/App.tsx` | Open the notebook, load saved foods/settings and choose which room to show. | The normal app entrance and tab switching break. |
| `ui/pages/TodayView.tsx` | Put today's entry box, drafts, timeline and totals together. | The Today screen breaks. |
| `ui/pages/GymView.tsx` | Put exercise choices and planning tools together. | The Gym screen breaks. |
| `ui/pages/FoodsView.tsx` | Show the saved-food collection and its editing tools. | The Foods screen breaks. |
| `ui/pages/AiView.tsx` | Put the chat on its own screen. | The AI tab breaks. |
| `ui/pages/MeView.tsx` | Put profile, display and backup tools together. | The Me screen breaks. |
| `ui/pages/FirstRunSetup.tsx` | Collect the starting body details before opening the diary. | The current first-run path breaks. |
| `ui/components/today/Composer.tsx` | Show the text box and review action. | Typed entry through that box breaks. |
| `ui/components/meals/DraftCard.tsx` | Show an editable meal before its Save button is pressed. | Meal review and that confirmation button break. |
| `ui/components/meals/EstimateDraft.tsx` | Ask for missing food facts and show the waiting/error state. | Automatic lookup from an unknown-food row breaks. |
| `ui/components/meals/EstimateResult.tsx` | Show a proposed food's source, range and review actions. | Reviewing an estimate breaks. |
| `ui/components/meals/FoodEditor.tsx` | Let the person enter or correct food facts by hand. | The manual food fallback breaks. |
| `ui/components/meals/PlatePhoto.tsx` | Show the chosen picture and connect its reading choices. | The photo capture card breaks. |
| `ui/components/meals/PhotoFoodsReader.tsx` | Upload a small redrawn photo after permission and show food suggestions. | Hosted photo reading breaks. |
| `ui/components/meals/BarcodeScan.tsx` | Accept a barcode and show a product for review. | The barcode capture card breaks. |
| `ui/components/ai/AiChat.tsx` | Hold the current message and display replies. | The chat interaction breaks. |
| `ui/components/ai/askAi.ts` | Send a question, food idea or workout request to the right helper. | Chat requests no longer reach their intended helper. |
| `ui/hooks/useEntryPanel.ts` | Remember the open draft and coordinate its confirmed save. | Draft saving and correction coordination break. |
| `ui/hooks/useDiaryDay.ts` | Load the chosen day's meals, exercise and sleep for the screen. | The day cannot load or refresh normally. |
| `ui/hooks/useToday.ts` | Recheck the device clock, including after returning to the app. | Today stops following date changes while the page stays open. |
| `domain/parsing/parseEntry.ts` | Decide whether typed words mean a meal, correction, workout, sleep or supported question. | Typed review cannot choose the right kind of draft. |
| `domain/meals/revisions.ts` | Build the first meal record or a new corrected version. | Meal creation and history rules break. |
| `domain/nutrition/scale.ts` | Work out nutrients for the amount actually eaten. | Portion calculations break. |
| `domain/nutrition/day.ts` | Collect that day's food totals without hiding missing facts. | The day's food summary breaks. |
| `domain/training/eligibility.ts` | Exclude exercises that fail the person's local rules. | Planning loses required exercise checks. |
| `domain/training/planner.ts` | Search eligible exercise combinations for the chosen time. | Automatic session selection breaks. |
| `domain/training/rounds.ts` | Add repeated blocks when that choice is enabled. | The planner loses its repeated-round option. |
| `data/storage/connection.ts` | Open the local filing cabinet and wait for whole saves to finish. | Normal local reading and writing break. |
| `data/storage/mealsRepo.ts` | File meals, their versions and retry receipts together. | Meals cannot be saved, corrected or read normally. |
| `data/storage/foodsRepo.ts` | Keep the food facts and their saved versions. | Food lookup and saved-food editing break. |
| `data/storage/logsRepo.ts` | Keep workout and sleep records. | Those logs cannot be saved or loaded normally. |
| `data/storage/profileRepo.ts` | Keep confirmed versions of the person's settings. | Profile persistence breaks. |
| `data/storage/backup/transfer.ts` | Export, restore or erase through the checked storage boundary. | Those backup actions break. |
| `data/api/post.ts` | Carry requests to the optional service and handle failed requests. | Its dependent online helpers break; the local diary remains separate. |
| `data/api/coach.ts` | Send a typed question; refuse diary context in the current setup. | Coach requests lose this browser boundary. |
| `sw/service-worker.js` | Keep a copy of the app for offline reopening. | Offline reopening loses its app-shell support. |
| `services/coach/coach/app.py` (repository root) | Receive helper requests and call the appropriate service function. | The optional Python API cannot serve the app normally. |
| `services/coach/coach/pipeline.py` (repository root) | Try nutrition sources in the defined order and return a checked proposal. | Online nutrition estimates lose their pipeline. |

Deleting an imported file usually stops the build as well as losing its job. The last column describes which responsibility is lost, not a promise that every other screen still builds.

### Follow one button: Save meal

1. You type `250 ml Fictional milk` and press Review entry. The parser reads it; it does not save it.
2. Today shows `DraftCard`. Imagine the fictional saved label says 60 calories per 100 mL: the calculator works out 150 for 250 mL. A missing added-sugar value still says Unknown.
3. You check the food, amount and date, then tap **Save meal**. `DraftCard` calls the save action supplied by Today.
4. `useEntryPanel.saveDraft` asks the meal rulebook to make version 1. It gives this intended save a receipt number so retrying it need not create another meal.
5. `mealsRepo.confirmMeal` checks that the meal can be calculated, then writes its meal header, version and receipt together in the browser's local filing cabinet. Either the whole save succeeds or none of it stays.
6. `connection.runTransaction` waits for the browser's complete signal. Only then does the screen show Saved, close the draft and reload the day. The totals are recalculated from the stored meals.
7. No model or cloud database is needed for this saved-food example. If you correct the amount later, the app adds a new version and keeps the old one. An edit from an out-of-date screen is refused for review.

The screen is the waiter, `domain` is the calculator, and `data/storage` is the filing clerk. A suggestion and a saved diary entry are two different things.

### Three things to understand before fixing bugs

1. **What did the words become?** Inspect the parser result and draft. If the wrong food or amount appears before Save, start there.
2. **What did the calculator receive?** Check the food label, portion, units and missing values. Do not turn Unknown into zero or ask the model to repair arithmetic.
3. **What actually got saved and reread?** Check the save receipt, expected version, transaction and reload. A correct draft with a wrong saved day points here rather than to the parser.

For an online-only failure, first check whether the laptop/hosted helper is reachable. A failed helper does not justify changing local diary calculations.

### Three easy questions for Yash

1. Which room shows today's entries, and which folder is the local filing cabinet?
2. Does pressing Review entry save a meal? Which button confirms the meal?
3. If a food label does not tell us added sugar, should the app show zero or Unknown, and why?

Answer in your own words before reading the technical tour. Then explain the Save meal story without looking. Mark your actual review in the AI log; no AI-written guide proves you understand it yet.

## Opening: 30 seconds

"Health Companion is a React and TypeScript PWA for food, exercise and sleep. The diary works locally in IndexedDB. Optional FastAPI services supply nutrition proposals, food-photo reading and coaching. Code owns arithmetic, revisions and hard exercise constraints; model responses are proposals that need confirmation. Missing nutrition stays unknown."

Today, 10 November: finish and rehearse the local MVP. Tomorrow, 11 November: host the frontend on Vercel and the Python backend on Render after deployment checks. MIT now covers the original code; third-party terms remain separate. The interview is Friday 13 November, 1:35 pm MYT.

## Current scope and future scope

The Me-page Google account card has been removed at Yash's request. His Firebase project configuration belongs to the developer setup; it does not authenticate every visitor, upload the diary or replace a later general sign-in system. Do not present multi-user login or cloud sync as shipped.

A later cloud diary may use Render PostgreSQL instead of Firestore. That is a future migration decision: no PostgreSQL database, vector extension or Firestore sync is implemented for this demo. Keep immutable history, null values, operation keys, revision conflicts and user ownership when that work begins. Yash confirmed Gemini Free Tier and kept diary sharing off; UI, client and server all block it.

## Five-minute live demo

1. Today: type `2 weetabix and 300 ml milk`, then Review entry. Show automatic proposals, source/range and Not saved. Check the Weetabix serving against the packet. Accept a food proposal only after reviewing it, then separately confirm the meal.
2. Enter `actually 250 ml`. Check that the intended milk item changes, totals update and the old revision remains available. Undo/history demonstrate immutable corrections.
3. Choose a plate photo. Review the AI names and counts, correct any mistakes and place the list in the composer. The photo action itself never saves a meal.
4. Look up a packet barcode on Today, if available. Review the label basis. Foods contains the saved-food list, rather than duplicate capture screens.
5. AI: send `Hi`, a protein question and `A 30 minute workout with no equipment`. Show the 30-minute plan and local eligibility checks. The seven-day switch is disabled for the confirmed free tier. Explain that diary analysis is paused; do not enable it for the demo.
6. Airplane mode: reopen the cached diary and show local entries/editing. An unavailable AI service is expected; saved local data must still work.
7. Me: show profile/adaptations, number hiding and backup/export. Explain the later general sign-in/cloud-database plan. Do not show a redundant account-login card.

For each phone step record PASS, FAIL or NOT TESTED in `docs/test-log.md`. A laptop browser screenshot is not a physical-phone result. Never clear phone site data to refresh the build. Capture a two-minute successful phone video as Friday's fallback.

## Complete feature and code tour

| Feature | Where to look | Explain-back point |
|---|---|---|
| Typed entries | `domain/parsing/`, `ui/hooks/useEntryPanel.ts` | Ordered grammar fills drafts; ambiguous input does not invent quantities. |
| Food labels and aliases | `domain/nutrition/foods.ts`, `data/storage/foodsRepo.ts` | Versioned food facts preserve what an old meal used. |
| Nutrition/day totals | `domain/nutrition/{scale,aggregate,day}.ts` | Compatible units only; known totals and unknown counts remain distinct. |
| Corrections/history/undo | `domain/meals/`, `data/storage/mealsRepo.ts` | A correction adds a revision, with an operation key and expected revision. |
| Exercise library/search/own exercises | `domain/training/{exerciseSearch,customCards,packs}.ts` | Bundled search is offline; chosen cards and custom facts require confirmation. Unknown adaptation facts do not become safe facts. |
| Session planning | `domain/training/{eligibility,planner,rounds}.ts` | Hard filters first, bounded duration search, optional repeated rounds and truthful shortfalls. Yash owns ranking changes. |
| Workouts and cardio | `domain/training/{workouts,cardio}.ts` | Log what was actually performed; cardio energy is a code-calculated range. A suggested session is not a workout log. |
| Sleep | `domain/sleep/sleep.ts`, `data/storage/logsRepo.ts` | Parse times, handle an overnight interval and confirm before logging. |
| Body/profile/adaptations | `domain/profile/`, `ui/components/me/` | Body estimates require known inputs; limitations filter locally. Diabetes display changes nutrient priority, not medication advice. |
| Weight and weekly overview | `profile/weightTrend.ts`, `domain/week/` | Saved versions and date-based aggregates show trends; missing dates remain gaps. |
| Capture and estimation | Detailed section below | Typed text, photo and barcode converge on review and explicit confirmation. |
| Coach/Nutritionist/Trainer | Detailed section below | Separate responsibilities, bounded requests, local checks and visible uncertainty. |
| Backup/restore/erase | `data/storage/backup/`, Me | Validate a backup before one transactional restore. Erase requires explicit confirmation; do not demonstrate with real data. |
| Offline PWA | `sw/service-worker.js`, `data/storage/connection.ts` | Cache the app shell; keep diary records in IndexedDB; bypass `/api` cache. The large local model caches only after download. |
| MCP | `services/coach/coach/mcp_server.py` | Two read-only tools: reviewed evidence and a fictional demo day, not unrestricted diary access. |

## Reliability and experiments: questions the interviewer may ask

- A transaction finishes only when IndexedDB confirms completion. Operation keys make retries idempotent; expected revisions reject stale edits. Snapshots retain history.
- A verified source ID is not proof of nutritional accuracy. The serving, recipe and matching records still need review. The protein reply's unchecked disclaimer is a real limitation, not a clinical validation badge.
- The router experiment used a frozen encoder and a small classification head. It lost to keyword rules on the sealed evaluation and did not ship. Do not rerun a sealed evaluation for a better result.
- M6 compared a frozen head and hand-written LoRA; M7 fine-tuned SigLIP2 with text-name vectors. The later full retrain failed its ship rule. Keep the records and explain the generalisation trade-off.
- The on-device model's benchmark score did not mean it could list five foods on a real plate. A classifier returns one label; counting, segmentation and label OCR are different tasks. Hosted photo reading is the current demo path, with mistakes disclosed.
- RAG fuses BM25 word retrieval and MiniLM semantic retrieval with reciprocal rank fusion. Its cards and evaluation questions share an AI author, so reported retrieval scores are optimistic. It is not an independently validated clinical system.
- SOLID here means one job per module and dependencies pointing towards pure domain logic. YAGNI means no new cloud database or model training just to answer seven exact dates before Friday.

## Tomorrow's hosting runbook: Render backend and Vercel frontend

This is preparation, not a deployment claim. MIT is selected for original code, with separate third-party notices. Gemini Free Tier is confirmed and private diary context stays blocked. Do not provision PostgreSQL or enable billing as part of this MVP deployment.

Render runs FastAPI from this repository. Planned build: `pip install -r services/coach/requirements.txt`; planned start: `python -m uvicorn coach.app:app --app-dir services/coach --host 0.0.0.0 --port $PORT --no-access-log`. Confirm Python compatibility and bundled exercise-data paths before deploying. Keep provider credentials in Render server settings only.

Vercel builds the Vite frontend. Because the importer reads repository-level data, build from the repository root with `npm --prefix apps/web ci` and `npm --prefix apps/web run build`, publishing `apps/web/dist`; reviewed examples are in `deploy/`. Route `/api/*` to the actual Render URL using an external rewrite before any SPA fallback. The local Vite proxy does not deploy itself.

The backend now accepts exact configured deployment hosts/origins alongside local defaults, with rejection tests. `/api/health` reports startup without a provider call. Set actual hostnames and verify them after deployment. Choose suitable access/rate controls for model endpoints; a developer-owned Firebase project is not visitor authentication. Do not place private API responses in CDN or service-worker caches.

Check the 187 MB local-model asset and service memory/startup requirements against host limits. Decide whether that optional model is included; never silently remove the phone fallback. Confirm RAG assets exist or clearly disclose the word-search fallback. Test the final HTTPS link on phone data with USB disconnected, including an API call, reload, offline diary and unavailable-provider behaviour. Record actual results and prepare the video.

Official references: [Render FastAPI](https://render.com/docs/deploy-fastapi), [Vercel external rewrites](https://vercel.com/docs/rewrites).

## Verification status

Full checks and build are required after changes. The existing laptop rehearsal demonstrated automatic draft estimates, generic chat, a 30-minute plan and cached-shell reload. Physical-phone steps remain unverified in this rehearsal until Yash reports them. No new cloud storage, sign-in flow, vector database or multi-food training should be claimed.

## Detailed chat and diary explanation


## Say it in the interview

"One chat routes a message to a question-answering Coach, a Nutritionist or a Trainer. The routing rules are deterministic. The Trainer proposes library IDs, and my planner checks them again on the device. Seven-day summaries are calculated in code, but sharing them is paused for the confirmed free-tier setup. The model does not own the diary or save changes."

## Follow one request

`AiChat.tsx` holds the message and reply in screen memory. `domain/chat/chatIntent.ts` reads the intent and session settings. `components/ai/askAi.ts` chooses the helper. A workout request always goes through the Trainer path; its returned exercises still pass `planFromProposal` with local limitations. Saved profile restrictions are not pasted into the request.

Without diary context, a food-idea request goes to the Nutritionist; when it lacks evidence the Coach can give a labelled general answer. Questions go to the Coach. `ChatReply.tsx` presents each response under its role. This screen has no conversation memory sent to the service: a follow-up is a new independent request.

The retained, currently disabled sharing implementation uses `loadWeekLines` to read seven local dates. It loads the latest meals, workouts and sleep, then calls existing domain summaries. Deleted meals and inactive components are excluded from food names. `weekLines` formats a bounded line per date. Gaps, unknown nutrition and partial totals have different text. At most seven lines of 200 characters reach `CoachRequest.context`; up to eight distinct food names appear per line, and long lines are clipped. This bounded view is not the full database or a complete nutrient history.

The sharing switch starts off on every new AI screen. Loading occurs only when it is on and a message is sent. Shared lines route question/food messages to the Coach; workout planning still uses its own path. The model route currently chooses between Groq and Gemini through the shared availability queue. Yash selected Gemini conditionally, then confirmed Free Tier and asked to keep sharing off. The UI is disabled and both request boundaries reject diary context before any provider call. A permitted paid-tier route is not enabled. Do not claim that Google sign-in or Firestore is required for these local summaries.

## What the server checks

`rag/answer.py` runs `check_safety` before retrieval or a model call. Diary context only bypasses the specific refusal saying the Coach cannot see the diary. Dosing and diagnosis refusals still apply. The context is labelled as data, not instructions, and the prompt asks the model to name dates and acknowledge missing days.

With no diary context, the grounded path retrieves reviewed cards and keeps claims only when their citation IDs exist and their numbers appear in the cited cards. This does not prove a sentence logically follows from its citation. The general-answer and diary paths validate shape and length, not every factual statement. Their answers remain labelled as unchecked general information. Prompt instructions are not a mathematical guarantee against invented facts.

Code computes nutrition aggregates before the model sees them. The current lines include daily energy, food names, session counts and sleep; they do not include enough information to calculate weekly protein. Do not claim the model can produce a reliable protein total from those lines.

## Explain the memory choice

Episodic memory is the dated diary. Retrieval is how relevant records are found. Lasting saved goals/preferences would be semantic memory; carrying earlier chat turns would be working memory. Neither a vector database nor retraining model weights is required to read seven exact dates. Firestore sync and new memory systems are deferred until after Friday.

## Verification and questions to answer

Unit tests cover the sharing gate, outgoing fields, missing days and safety refusals with fictional data. Claude's handover reports a live fictional-context reply on port 8001. Those checks are not a phone test. The current rehearsal results are in `docs/test-log.md`.

Explain why a missing day is not a zero-calorie day; which code computes totals; why Trainer IDs are checked twice; why a citation is not proof; and why a seven-day summary is not permission to upload the entire diary.


## Detailed capture and estimate explanation


## Say it in the interview

"Each capture method produces a draft. The photo model lists foods and portions; a barcode fetches a packaged-food label; typed text follows the grammar. Nutrition lookups run automatically for foods with no usable saved values. I show the source and uncertainty, then ask the person to accept the food and separately confirm the meal."

## Photo path

`PlatePhoto.tsx` creates a local preview. `PhotoFoodsReader.tsx` redraws the selected image through `vision/shrinkPhoto.ts` as a small JPEG without the original metadata, then calls `/api/photo`. Upload requires the explicit button or the remembered automatic-photo opt-in. That preference defaults off and is a device choice, independent of Google sign-in.

The server's `photo.py` asks a hosted vision model for food names, amounts and permitted units, not nutrients. It checks item shapes, names and bounds and caps the list at eight foods. A recognised food can reach the composer without an amount. When the portion is blank, the nutrition lookup automatically proposes a labelled typical serving for review. The checked strings become composer text only when the person chooses "Put these in the entry box". That action does not save a meal. The reply warns when the model reports an unidentified portion or validation drops an item. Names and counts still need human review: the model previously confused tempeh with fried chicken. It cannot reliably infer grams from a photograph.

The on-device SigLIP2 model is a separate fallback. It predicts one label for the whole image, not every food, object count or package text. Its download is explicit and its model is cached after download. The photo action no longer waits for that large download. A new React selection key prevents an old response appearing under a replacement photo. See `m8-photo-flow-walkthrough.md` for the consent and late-reply details.

## Barcode path

The barcode card is on Today beside photo capture; Foods is the saved-food list. Scanning fills the digits for the person to check before lookup. Only those digits go to the optional service. Conflicting records trigger a checked label lookup. For a conflict, AI can select a public candidate source while code checks the barcode, basis and printed values. For a missing or incomplete result, the user can explicitly send a nutrition panel photo for transcription into the same editor. The app checks a visible barcode against the typed digits and keeps missing fields unknown. `coach/barcode.py` uses Open Food Facts. Missing products, missing fields and an unreachable service must remain understandable outcomes. Database label values still need checking against the packet, because records and serving bases can differ. Nothing is saved just by looking up a code.

## Automatic estimates

`EstimateDraft.tsx` begins lookup when an unknown-food row opens. `data/api/estimate.ts` sends only its name and portion text and serialises requests in this tab to reduce bursts. Both successful and failed calls release the next queued row. A slow row can delay later rows; this queue is not a provider-quota guarantee.

The service checks composition data first, searches bounded public evidence on a miss and asks an available model only when needed. Database spreads describe the matching records; they are not statistical confidence intervals. AI proposals need usable values and genuine low/high bounds. Missing nutrients remain null, even if others are known. Energy is checked against 4P + 4C + 9F within the configured tolerance. This rejects contradictions; it cannot prove that a recipe or serving assumption is correct.

A reviewed manufacturer label can carry its own piece count. The UK Weetabix Original label is for two biscuits; the code divides by that count before scaling to the requested pieces. Without a matching label, for multiple servings the service asks for one item/container and scales values and bounds in code. `domain/nutrition/estimateInput.ts` preserves the original container count; `coach/portions.py` preserves the named container at the model boundary. See `m8-estimate-portions-walkthrough.md`. No density is invented to turn a bowl into grams.

"Use estimate" confirms a food version; "Save meal" is the separate diary write. Manual editing and unknown logging are fallbacks. Editing drops unsupported database provenance/ranges rather than pretending the edited numbers are still published label facts.

## Demo limitations

A model passing every numeric check can still use the wrong food or portion. Compare the Weetabix demo estimate with its packet and use a checked saved food for the reliable offline backup. Explain the uncertainty instead of presenting the estimate as measured nutrition.

Free-provider availability, package-database coverage and photo recognition are separate from UI correctness. Keep the recorded video as a fallback. Positive plate recognition and physical-phone capture require Yash's report; existing unit tests and a laptop screenshot do not establish those results.


Current privacy decision, 10 Nov: Yash confirmed the Gemini project is Free Tier and chose to keep diary sharing off. The sharing switch is disabled, the browser request helper rejects context without fetching, and the server returns 403 for context before calling a model. Generic typed messages still use the existing route. Google terms and account-tier review must precede any later Gemini-only private-context route; no billing was enabled.
