# Handoff to Codex: Gym redesign, exercise search, coach chatbots

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
