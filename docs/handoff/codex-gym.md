# Handoff to Codex: Gym redesign, exercise search, coach chatbots

Current planner update: target-duration DP, up to twelve distinct cards; see `docs/milestones/m4-target-duration-walkthrough.md`. The original DFS description below is historical.

Written 7 Nov 2026, after M4 part 1 merged (`main` at e5bf9ac). Read `CLAUDE.md`, `AGENTS.md` and `.claude/rules/` first. Yash reviews every diff and must be able to explain it, so keep the FIT3080 comment style.

## Where things stand
- **Planner (FIT3080):**
  - What it does: `domain/training/{catalogue, eligibility, planner}.ts` is a depth-first include/skip search over 8 reviewed cards (at most 3 per session).
  - Ranking: Yash wrote `compareCandidates` himself.
  - Tests: oracle tests, the greedy counterexample and 6 ranking tests, all green.
- **Gym tab:**
  - `ui/GymView.tsx` shows the "Plan a session" card (`ui/PlanSession.tsx`), "Last time" and "History".
  - Browser-pane check: 20 min, all equipment, all four areas gives band pull-apart, jump squat and plank, "14 of 20 min, covers 3 of 4", best of 70.
  - Not checked yet: the phone.
- **Fixed 7 Nov:**
  - Problem: a sample food showed the repository path `eval/fixtures/ledger_golden.json` under "Sources and assumptions".
  - Fix: `ui/format.ts` `describeSource` now says it is a fictional sample. The stored record is unchanged (snapshots are immutable).

## Yash's feedback (7 Nov)
1. "The UI is still bad." He wants a modern, depth-heavy ("3D") look, especially on the Gym tab.
2. Eight fixed cards are too few. He should be able to **search and add the exercises he wants**.
3. Later, an **AI trainer** chatbot and an **AI nutritionist** chatbot. The chatbots are the end goal.

## Task A: exercise search (do this first)
**Recommended: bundle an open exercise dataset, with no live API.** It stays offline-first (the phone gate must still pass in airplane mode), and no query leaves the device.
- **Candidate datasets.** Check each licence before use and record it in `docs/` with its provenance.
  - **free-exercise-db** (GitHub `yuhonas/free-exercise-db`): about 800 exercises as JSON, with images, Unlicense (public domain).
  - **wger** (`wger.de/api/v2/`): an open-source REST API, CC-BY-SA data. Use it only as a build-time import, or as an optional lookup that sends just the search text, like food estimates do (invariant 5).
- **Shape:**
  - A build step converts the dataset into `MovementCard`s in a generated JSON file (category, equipment, minutes default, cue, `requires`, image path).
  - Map the dataset's muscles and equipment onto our `Category`, `Equipment` and `Capability` types. Anything unmapped stays unknown: never guess a capability.
  - Add a `customCards` IndexedDB store so the person can add exercises they chose. That needs the `schema-migration` skill: `DB_VERSION` 4, one `if (oldVersion < 4)` step, `STORE_NAMES`, a backup checker and the round-trip test.
  - Search UI: a text box on the Gym tab with matches as you type, and "Add to my exercises" (an explicit confirm). The planner then searches over the reviewed cards plus the chosen ones.
- **Keep:**
  - Hard filters stay in `ineligibleReason` and are never relaxed.
  - The DFS stays exhaustive only while it is cheap. With hundreds of cards, plan over **the person's chosen exercises** (tens), not the whole dataset. If that grows, add a node budget or best-first search, keep the oracle test on a small catalogue, and ask Yash before touching `compareCandidates` (his function).

## Task B: the Gym visual redesign
- `ui/app.css` owns the tokens. Keep the responsive rules: a sidebar and two columns on laptops, edge to edge with a bottom dock on phones.
- **"3D" without hurting a phone PWA:**
  - Layered surfaces: two-level shadows, a subtle inner highlight, and a slight perspective tilt and press-in on cards (CSS `transform: perspective() rotateX()`, with `prefers-reduced-motion` respected).
  - Exercise cards with the dataset image or an **SVG muscle map** (front and back body, with the targeted muscles highlighted). This is the most "sporty" win for the least weight.
  - Optional later: a lazily loaded three.js body model, only on the Gym tab, kept out of the main bundle and still offline after the first load.
- Plan result: one card per exercise with its image, minutes and category chip, plus a progress ring for "14 of 20 min" and coverage chips (push, pull, legs, core).
- Verify in the browser pane at 375 px and at laptop width, then do the phone gate.

## Task C (later): AI trainer and nutritionist chatbots
- Coach service (`services/coach`) endpoints such as `/api/coach/trainer` and `/api/coach/nutrition`.
- Invariants still hold:
  - **Context:** a chatbot only receives what the person types into it, plus, with an explicit per-message opt-in, a summary they can see first. Never diary history by default (invariant 5).
  - **Drafts:** its suggestions fill drafts (a plan or a meal) that the person confirms (invariant 4).
  - **Numbers:** they come from the domain code and the estimate pipeline, never from the model.
  - **Safety:** no medical advice. Refuse injuries, eating disorders and medication questions with a plain pointer to a professional.
- This needs the planned BM25 retrieval and MCP tools (see `integrations.md`), plus the intent router (M4 part 2, where Yash writes the training loop) to route between food, workout, sleep and question.

## Checks
- `npm run check` must stay green, plus `npm --prefix apps/web run build`.
- Do the phone gate (`docs/test-log.md`) after any UI change.
- Stage explicit paths only. Push at every green checkpoint.

## Task D: adapt to disabilities, injuries and conditions (Yash, 7 Nov)
**What his friend's FitSense does** (GitHub `Divi19/FitSense`, Flutter, KitaHack 2026; read 7 Nov for ideas only, copy no code):
- **Onboarding body map:** you tap body areas to mark injury or chronic pain. There are 19 areas, from rotator cuff, elbow, wrist and knee to lumbar spine and hernia.
- **Other conditions:** cardiovascular, asthma, osteoarthritis, wheelchair user and prosthesis, plus free-text clinical notes.
- **How it is used:** the profile is stored in Firestore and pasted as text into a Gemini prompt (`rag_service.dart`), so the **model** decides what is safe.
- **Diabetes:** no handling was found in its code.

**What we take, and what we do differently:**
- **Take the UX:** a tappable SVG body map (front and back) with "I have no limitations", the systemic-condition chips, a wheelchair or seated mode, and a notes field. It fits the Task B muscle-map design.
- **Make it a hard filter, not a prompt:**
  - Each `MovementCard` gets `loads: BodyArea[]` (joints and areas it stresses) and `positions: ('standing' | 'seated' | 'floor')[]`.
  - `PlanRequest` gets `avoidAreas` and `seatedOnly`.
  - `ineligibleReason` adds "it loads your knee" and "it needs standing", checked from the firmest rule down and never relaxed, with oracle tests for each.
  - The model can explain a plan, but it can never be the safety check.
- **Keep it on the device:** limitations and conditions are health data. They live in IndexedDB (a `profile` store, using the schema-migration skill) and are never sent to the coach service or any model (invariant 5). FitSense uploads them; we must not.
- **Seated set:** add a seated/wheelchair-friendly set of cards (seated press, band row, seated core) so a wheelchair user gets a real plan, not "no plan".

**Diabetes and other diet conditions** (M3b diet rules, which also feed the nutritionist chatbot later):
- **Opt-in profile:** for example "I manage diabetes", stored only on the device.
- **What it changes:** it shows carbohydrate, added sugar and fibre first on each meal and day. Day totals already keep unknown separate from zero.
- **Exercise note:** a plain "check your glucose before and after exercise as your care team advised" on the plan card.
- **Never:** insulin or medication dosing, carb-ratio maths, glucose targets, or anything that reads as medical advice. Point to the care team instead. Any number shown comes from logged food, with its unknowns kept separate.
- Other conditions can follow the same pattern later (for example hypertension, where sodium is shown first).
- **Tests:** a diabetes profile reorders what is shown and never hides a nutrient. An unknown carb value stays "Unknown", never 0.


## Task A checkpoint (7 Nov 2026, Codex)

Implemented on `codex/exercise-search`: schema-v4 immutable choices, bounded offline search over 876 pinned Unlicense records, explicit requirements review and confirmation, backup compatibility, and chosen-pool planning. Dataset provenance: `docs/data/exercise-dataset.md`. Explain-back, verification evidence and phone gate: `docs/milestones/m4-exercise-search-walkthrough.md`.

Task B's lightweight CSS depth, front/back SVG targets, minutes ring and coverage chips are also present. Physical phone verification remains pending. Unknown source equipment is searchable but unavailable to add; capability metadata always needs review. No injury safety claims. Next schema version is **v5**, including for profile/diet rules. Task D's new `ineligibleReason` rules remain reserved for Yash. Task C and the training loop remain untouched.


### Planner form follow-up (7 Nov)
Yash reported the exercise feature works on his phone and approved the Gym visual direction. At his request the planner now uses Without equipment / With equipment, keeps What to train, and removes You cannot do from this form. Equipment details appear only in With equipment; suggestions come from added exercises and remain editable for today. Nothing is inferred about health or saved as an ownership profile. See the updated Task A walkthrough for request semantics and tests. Task D's limitation profile/rules are still outstanding and reserved for Yash; do not treat the simplified form as implementing them.


### Target-duration follow-up (7 Nov, explicitly authorised)
Yash authorised Codex to update compareCandidates and the session cap after the 15/60 screenshot. Current ranking: coverage -> closer to the target without exceeding it -> preference -> ordered IDs. Up to 12 distinct blocks; bounded DP replaces full subset enumeration. Whole-minute targets 0–240. Shortfalls are shown explicitly; do not duplicate exercises or inflate durations to hide them. The screenshot's starter-only bodyweight pool genuinely contains only 15 minutes. Full 60/60 verified in the browser with nine temporary chosen blocks plus the three bodyweight starters; test choices removed afterwards. Read the new walkthrough for interview questions, state dominance proof and verification. Future ranking edits still need Yash's authorisation.

Later scope reaffirmed: free-first agentic trainer/nutritionist, evaluated BERT/transformer and DL/ML experiments. These are roadmap items, not implemented features. Keep the existing local-first/privacy/draft rules; the training loop and injury/seated rules remain reserved.


Latest: Yash authorised repeated rounds and requested a wrap-up. Read `docs/handoff/claude-code.md` and `docs/milestones/m4-repeated-rounds-walkthrough.md`. These supersede the distinct-only/no-repeat and 240-minute-cap notes above. No new milestone is authorised by the handoff itself.
