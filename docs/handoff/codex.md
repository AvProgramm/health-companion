# Handoff to Codex (from Claude Code, 7 Nov 2026)

Read `CLAUDE.md` first; its invariants and rules apply to you too, along with `.claude/rules/*.md`. Run `npm run check` before and after every change, and push at every green check. Yash reviews every diff, and the code style is his FIT3080 voice (`.claude/rules/code-style.md`).

## Where things stand
- **Done:**
  - **M1:** offline save, correct and reopen on the phone.
  - **M2:** a usable diary (parser, drafts, corrections, meal sheet, foods, backup and restore, hide numbers, hook and CI).
  - **M3:** training, sleep, the Gym tab, schema v3, and the feature-folder restructure.
- **Last commit:** see `git log -1`. Walkthroughs are in `docs/milestones/`.
- **Phone setup and gates:** `docs/test-log.md` (USB forwarding `4173 → 127.0.0.1:4173`, then reload twice).

## Next milestones, in order
Work on one branch per milestone, with small commits.

### M3b: diet rules, photos, reminder (UI + domain; Codex can own this)
1. **Diet rules (FR02/FR03/FR43, journeys J1 and J11).**
   - New `domain/nutrition/rules.ts`. A rule has a kind (`allergy` | `exclusion` | `dislike`), food tags (meat, poultry, fish, egg, dairy, beef, pork, alcohol, caffeine), and optional inclusive `startDate`/`endDate`.
   - Foods get optional `tags` in `FoodVersion`. Add tag checkboxes to `ui/FoodEditor.tsx`.
   - A draft or meal shows a badge such as "Outside your vegetarian rule (11–19 Oct)". **It never blocks a save.** It never infers a rule from identity or religion, and there are no fasting windows.
   - Storage: a new `rules` store means schema **v4**. Follow `.claude/skills/schema-migration/SKILL.md` exactly: an upgrade test from v3 with data, plus a backup checker.
2. **Local photo on a meal (FR08).**
   - Resize the photo and re-encode it to strip metadata (canvas → JPEG blob), then store it in an `attachments` store.
   - Never upload it. Backups exclude images by default and say so.
3. **Reminder card (FR32/FR46/FR50).**
   - Off by default and foreground only.
   - "Busy today, remind me tomorrow" from the composer creates a due card with snooze.
   - The UI must say there is no background notification.
4. **Visual pass:** bundle the Geist and Geist Mono fonts (works offline), Phosphor icons and a dark theme. Use the design rules from `docs/spec/07` and the elayadesign skill: no gradients, spacing 4/8/12/16/24/32, and skeletons instead of spinners.

### M4: workout planner (FIT3080) + intent router (FIT3181)
- **Planner** (`domain/training/planner.ts`):
  - Depth-first search over at most 8 reviewed movement cards (equipment, capability tags, duration, category).
  - Hard filters come first and are never relaxed. "No plan" is a valid answer.
  - Tests compare against a brute-force oracle, plus the greedy counterexample in kit doc 04 (12 min; A=10 push, B=6 push, C=6 pull).
  - **Yash writes `compareCandidates`** (categories covered → preference → shorter time → ID). Scaffold only its signature and failing tests.
- **Router** (`experiments/router/`, separate `health-ml` conda env):
  - Family-grouped splits, then keyword and TF-IDF+LR baselines.
  - Frozen `sentence-transformers/all-MiniLM-L6-v2` (pinned revision), mean pooling with the mask, L2 normalised, then `Linear(384, 6)`: 2,310 trainable parameters.
  - **Yash writes the training loop**, reusing his FIT3181 `train_model`/`score`/`seed_all(34871500)` habits. Avoid the template's `BaseTrainer.evaluate` loss bug.
  - It ships only if it beats the baseline on held-out macro-F1. It only preselects a draft type and never saves.

### M5: coach (RAG + MCP) — the full data flow is in the approved plan
- **Service:** FastAPI on `127.0.0.1:8000`, proxied as `/api`.
- **Retrieval:** BM25 over 8–12 reviewed WHO evidence cards (`eval/fixtures/evidence_seed.json` to start).
- **MCP:** a stdio server with exactly `search_evidence` and `get_demo_day`, synthetic data only. Add `.mcp.json` then, not before.
- **Answering:**
  - The provider adapter defaults to no key (source excerpts only).
  - The citation validator drops uncited sentences.
  - The client says "Coach is offline. Your diary still works." when the service is down.
- **Reuse rule:** Yash's Veritaserum `pipeline/ranking.py` (`BM25Ranker`, `_ranked_copies`) may be ported **only after** a `REUSE.md` entry (repo, commit `36110aa`, blob hash, `git log --follow` authors, team permission). Anything co-authored gets reimplemented instead.

### Later (Yash's direction)
- Photo → ViT/LoRA food suggestions and nutrition lookup by retrieval or web search. These fill a **draft with a source badge and a range**; the user still confirms. Manual edit stays.
- An LLM or BERT parser for free text. Same rule: it only fills drafts.
- An RL experiment (Q-learning/SARSA from FIT3080), for example adaptive reminder timing in a simulator. It needs an honest baseline, and real diary data must never be used as reward.

## Rules that matter most
- Unknown is not zero. Snapshots are immutable. One write is one transaction with an operation key and an expected revision. Nothing saves without confirmation. No diary data leaves the device.
- A failing test comes first, built from the exact input (`.claude/skills/parser-case`).
- Stage paths explicitly. The guard hook blocks `git add -A`, force-push and `--no-verify`.
