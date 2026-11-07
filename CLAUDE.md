# Health Companion

A free, local-first diary for balancing food, exercise and sleep. It remembers what was logged, accepts corrections, and always shows what it knows versus what it estimated. Built in six days (8–13 Nov 2026) by Yash, with Claude Code (architecture, frontend) and Codex (Python backend, PyTorch). Yash reviews every diff and explains the code himself.

## Stack
- `apps/web`: Vite + React 19 + TypeScript PWA.
  - Diary in IndexedDB.
  - Hand-written service worker (`src/sw/service-worker.js`, filled in by the build).
  - No backend for the diary.
- `services/coach` (planned, Codex): FastAPI on 127.0.0.1, BM25 retrieval, MCP stdio tools. Optional; the diary never depends on it.
- `experiments/router` (planned, Codex harness, Yash's training loop): frozen MiniLM + `Linear(384, 6)` intent head.

## Commands
```bash
npm run check                                     # typecheck + all tests (same as the hook and CI)
npm --prefix apps/web run build                   # production build, regenerates sw.js
npm --prefix apps/web run preview                 # serves the build at 127.0.0.1:4173 for the phone
```
Phone setup and the offline gate are in `docs/test-log.md`.

## Where things live
- `apps/web/src/domain/`: pure logic, no storage or UI imports. This is where the numbers come from.
  - `scale.ts`, `aggregate.ts`, `day.ts`: nutrient arithmetic and day totals.
  - `revisions.ts`: `startMeal`, `reviseMeal`, `reviseAmount`. Every change is a new revision.
  - `parse.ts`, `corrections.ts`: the composer grammar and correction targeting.
  - `foods.ts`, `units.ts`, `validate.ts`, `dates.ts`.
- `apps/web/src/storage/`: `db.ts` (IndexedDB schema and transactions) and `backup.ts` (export, validate, restore).
- `apps/web/src/ui/`: React screens. They call domain and storage and never compute totals themselves.
- `eval/fixtures/`: fictional golden cases. `ledger_golden.json` is the source of truth for totals.
- `docs/`: ADRs, milestone walkthroughs, the device test log and the AI contribution log.

## Invariants (never break these)
1. **Unknown is not zero.** A blank label value is `null` and shows as "+ N unknown". An empty day is "nothing logged".
2. **Snapshots are immutable.** Corrections, undo and deletes add a revision; nothing is edited in place.
3. **One write = one IndexedDB transaction.** Every write carries an operation key (replay on retry) and an expected revision (conflict on a stale screen).
4. **Nothing saves without the user confirming.** The parser, and any future AI, only fill drafts.
5. **No diary data leaves the device.** No accounts, telemetry or cloud calls with personal data. Fixtures are fictional only.
6. **Round for display only** (`ui/format.ts`).

## Working rules
- Read the matching file in `.claude/rules/` before editing that area. Code style follows Yash's FIT3080 voice.
- Add a failing test from the exact input before fixing a bug. Phone-reported phrases go in `parse.test.ts` verbatim.
- Run `npm run check` before saying anything works, and say what was verified and where (unit test, browser pane, phone).
- Stage reviewed paths only (`git add <paths>`, never `-A` or `.`). End commit messages with the Co-Authored-By line. Never force-push.
- Each milestone ends with `docs/milestones/mN-walkthrough.md`, so Yash can explain it back in his own words.
- Do not write the functions Yash reserves for himself without asking: `compareCandidates` (planner objective) and the PyTorch training loop.
