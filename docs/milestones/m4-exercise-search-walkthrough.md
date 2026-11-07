# M4 Task A: offline exercise choices and Gym surfaces

7 Nov 2026, Codex, branch `codex/exercise-search`. Review and explain-back by Yash are pending.

## Explain it back

1. The importer verifies the pinned source and Unlicense hashes, then converts 876 records into a local JSON index. Builds do not download anything. Provenance and mapping limits are in `docs/data/exercise-dataset.md`.
2. Search is a pure function over that index. An imported card keeps unmapped fields null; it is not yet eligible for the planner. No exercise query goes through the coach service.
3. Review collects a category, editable planning block, equipment and capability requirements. The five-minute default is ours, not a measurement from the dataset. A checkbox and the final Add button are required; opening a result does not write anything. Unsupported equipment cannot be added yet. Requirements need explicit review because the source does not encode them.
4. Confirmation appends a `customCards` snapshot. Its compound key is `[id, version]`; a unique operation-key index handles retries. One transaction checks the expected version, the 24-active-choice cap and the write. Removing a choice appends a deleted version, preserving older snapshots.
5. Gym passes the eight starter cards plus active choices to `PlanSession`. The 876 search records never enter DFS directly. At the maximum 32-card pool, at most 5,488 subsets of one to three cards exist. Changing the pool or form clears a stale result. The ranking and hard filters are unchanged.
6. Schema v4 adds just the new store and index. Backups contain every snapshot and validate its fields, unique keys, contiguous history and active-choice cap. Older backups get an empty list. Export, erase and restore share `STORE_NAMES`. Future diet/profile migrations must start at v5.
7. UI components have separate jobs: search, review, target illustration, minutes ring and planner presentation. CSS tokens own depth and colour. SVGs work offline; tilt only runs when reduced motion is not requested. Laptop: sidebar and two columns. Phone: one column and bottom dock.

## What was verified

- Tests were written before the search/repository/UI implementation; the initial red runs were observed. Importer regression tests also rejected classifying unknown muscles from force alone.
- `npm run check` and `npm --prefix apps/web run build` pass. These cover app/type/hook tests, 26 coach tests and three importer tests. The production build reports a size warning for the separate exercise chunk (about 758 kB raw / 147 kB gzip); it is intentionally precached for offline use.
- Fresh IndexedDB tests upgrade v1/v2/v3 meals; v3 workout and sleep snapshots remain unchanged. Backup fixture includes a fictional exercise alongside meals, revisions, workouts and sleep; export/wipe/restore preserves it. Retry, conflict, malformed record and pool-cap paths are covered.
- Browser at localhost:4173: explicit Add gate, chosen card in a real plan, reload persistence, minutes ring and coverage chips. At 375 px viewport (360 px content after scrollbar), no horizontal overflow; at 1440 px, sidebar and two columns.
- Stopped the verified Vite preview process: reloaded the cached app, searched Air Bike, confirmed a choice, reloaded and planned successfully. Removed both browser test choices and reloaded: pool returned to eight starter cards. Restarted preview afterwards.
- Physical phone upgrade/offline gate: NOT TESTED for this change. Browser widths are not a phone test.

## Phone gate for Yash

Keep the same `http://localhost:4173` origin and existing USB forwarding. Run preview from VS Code as described in `docs/run-locally.md`. Reload twice and confirm old meals, workouts and sleep remain before adding anything. Gym: search a supported exercise, review its instructions and requirements, confirm, plan, then close/reopen and check it remains. Repeat search, add, plan and remove in airplane mode with the laptop link disconnected after the build has cached. Download a backup including choices; use a separate test browser for a destructive restore test.

## Remaining work

Task A is implemented with conservative equipment coverage. More equipment and independently reviewed capability metadata need a later change. Task B's lightweight depth, SVG map, ring and chips are included; the map is a target illustration, not an interactive injury selector. Task D and chatbots are not implemented. `compareCandidates`, `ineligibleReason` and the PyTorch training loop were not changed. Yash owns the later injury/seated rules; leave those for his implementation.


## Simpler session setup (7 Nov, Yash's phone feedback)

The planner now asks for minutes, **Without equipment / With equipment**, and **What to train**. The old always-visible equipment and capability checklists are removed. Without equipment is the default and sends an empty equipment list to the existing hard filters. With equipment reveals only gear used by the current pool. Added exercises supply visible gear suggestions; the person can adjust them before planning. No added gear means nothing is assumed: choose what is available today. Bodyweight movements can still be part of an equipment session.

Changing mode or gear clears the previous result. No diary write, schema change, ownership profile or health inference is introduced. The request's capability list is empty because this form no longer collects limitations; this is not a replacement for Task D's future profile. The domain hard filters and Yash's ranking function are unchanged.

Five UI tests cover the compact controls, bodyweight exclusion, suggested gear, unavailable gear, empty-gear prompt and stale-result clearing. The new tests failed against the previous form before implementation. Check and production build pass. Browser 375 px: no horizontal overflow and bottom dock retained. Browser equipment mode: no gear prompts for a selection; resistance band produces band pull-apart plus push-up (11/20 min). Switching back clears the result. Physical phone verification of these new controls is pending. Reload twice, try both modes and confirm only gear available today is checked.
