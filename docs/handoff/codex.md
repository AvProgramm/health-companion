# Handoff to Codex (from Claude Code, 7 Nov 2026)

Read `CLAUDE.md` first; its invariants and rules apply to you too, along with `.claude/rules/*.md`. Run `npm run check` before and after every change, and push at every green check. Yash reviews every diff, and the code style is his FIT3080 voice (`.claude/rules/code-style.md`).

## Where things stand
- **Done:**
  - **M1:** offline save, correct and reopen on the phone.
  - **M2:** a usable diary (parser, drafts, corrections, meal sheet, foods, backup and restore, hide numbers, hook and CI).
  - **M3:** training, sleep, the Gym tab, schema v3, and the feature-folder restructure.
  - **M3a implementation:** database-first nutrition estimates, Groq fallback, ranges/provenance, confirmation, manual/unknown fallback, tests and CI. Live USDA and Tavily-assisted Groq calls through the preview pass (7 Nov). The responsive UI follow-up is implemented and checked at 320/390/1440 px. The Hugging Face fallback adapter is tested, but its live endpoint returns HTTP 402. Physical-phone acceptance is still pending; see `docs/test-log.md`.
- **Last commit:** see `git log -1`. Walkthroughs are in `docs/milestones/`.
- **Phone setup and gates:** `docs/test-log.md` (USB forwarding `4173 → 127.0.0.1:4173`, then reload twice).

## Next milestones, in order
Work on one branch per milestone, with small commits.

### M3a (implemented; finish the phone gate): AI nutrition estimates instead of typing label numbers

Current walkthrough: `docs/milestones/m3a-walkthrough.md`. Local startup: `docs/run-locally.md`. Groq uses `openai/gpt-oss-20b`: the earlier Llama default returned 404 for this account. Keep the requirements below as the acceptance checklist, not a request to reimplement completed code. Test the existing flow on the phone before moving to M3b. See `docs/milestones/m3a-ui-and-retrieval.md` for the screenshot-reported all-null fix, responsive design and expanded provider pipeline.
Goal: when the composer meets an unknown food ("nasi lemak", "2 weetabix"), the app proposes the nutrition itself. The user should not have to type label values. Manual editing stays as the fallback.

1. **Laptop service** `services/coach` (FastAPI on 127.0.0.1:8000, proxied as `/api`), with a new endpoint `POST /api/estimate { name, portionText }`.
   - **Database first:** look the food up in public composition data, using USDA FoodData Central (free API key, laptop `.env` only) and Open Food Facts. The Malaysian Food Composition Database (MyFCD) can come later. Return each nutrient as the **average across matches, with low/high** from their spread, plus every source used.
   - **Public retrieval on a database miss:** Tavily retrieves up to three bounded, relevant nutrition excerpts. Only actual cited URLs are attached; this is evidence for an AI draft, not a verified composition database.
   - **Models after retrieval:** Groq first, Hugging Face hosted inference on failure, with structured JSON output. Use it only to map the dish to database entries, or to estimate when nothing matches. Its numbers are labelled `ai_estimate` with a range and a short reason. The prompt must say to return null for anything unknown, never 0.
   - **Privacy:** send only the food name and portion text. Never send diary history or other entries.
2. **Domain:**
   - Add `SourceKind` `'ai_estimate' | 'database'`.
   - Add an optional `range` per nutrient on `FoodVersion`.
   - Day totals show "≈" and the range when an item is estimated.
   - **Unknown is still not zero.**
3. **UI:** the draft row shows "Estimated: 133 kcal (110–160) · USDA + AI" with the sources. The user taps **Use estimate** (which saves a food version) or **Edit**. Nothing saves without that tap.
4. **Offline:** with no laptop reachable (phone unplugged), the draft says "Estimates need the laptop. Add it manually or log it now and estimate later." The diary keeps working.
5. **Tests:**
   - The service: the parser for each database's response, averaging and range, an LLM output validator (rejects missing or negative values), and a timeout fallback.
   - The app: the draft states (estimated, offline, edited).

### M3b: diet rules, photos, reminder (UI + domain; Codex can own this)
1. **Diet rules (FR02/FR03/FR43, journeys J1 and J11).**
   - New `domain/nutrition/rules.ts`. A rule has a kind (`allergy` | `exclusion` | `dislike`), food tags (meat, poultry, fish, egg, dairy, beef, pork, alcohol, caffeine), and optional inclusive `startDate`/`endDate`.
   - Foods get optional `tags` in `FoodVersion`. Add tag checkboxes to `ui/FoodEditor.tsx`.
   - A draft or meal shows a badge such as "Outside your vegetarian rule (11–19 Oct)". **It never blocks a save.** It never infers a rule from identity or religion, and there are no fasting windows.
   - Storage: a new `rules` store means schema **v5** (v4 now holds `customCards`). Follow `.claude/skills/schema-migration/SKILL.md` exactly: an upgrade test from v4 with data, plus a backup checker.
2. **Local photo on a meal (FR08).**
   - Resize the photo and re-encode it to strip metadata (canvas → JPEG blob), then store it in an `attachments` store.
   - Never upload it. Backups exclude images by default and say so.
3. **Reminder card (FR32/FR46/FR50).**
   - Off by default and foreground only.
   - "Busy today, remind me tomorrow" from the composer creates a due card with snooze.
   - The UI must say there is no background notification.
4. **Visual pass:** Geist and Phosphor are now bundled offline, with a responsive layout and compact estimate cards pulled forward at Yash's request. Dark theme and any further visual refinements remain later work; no new diary stores were introduced by this pass. Use the design rules from `docs/spec/07` and the elayadesign skill: no gradients, spacing 4/8/12/16/24/32, and skeletons instead of spinners.

### M4: workout planner (FIT3080) + intent router (FIT3181)
- **Planner** (`domain/training/planner.ts`):
  - Current implementation supersedes the original DFS/stub checklist below: bounded target-duration DP, twelve-card cap, coverage then duration then preference ranking. Explicitly authorised by Yash on 7 Nov. Read `docs/milestones/m4-target-duration-walkthrough.md`; the older bullets describe the original milestone.
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

Read `docs/handoff/integrations.md`: Tavily and Hugging Face credentials are available in the ignored laptop `.env` for later retrieval/DL work. Tavily is now used after a database miss. Hugging Face is the final hosted-model fallback; live availability still requires resolving its HTTP 402 response. Do not copy secrets into notes, fixtures, Vite variables or tool output. Visual redesign and signup/security remain explicit later milestones; available credentials alone do not change the current data-sharing or confirmation rules.
- Photo → ViT/LoRA food suggestions and nutrition lookup by retrieval or web search. These fill a **draft with a source badge and a range**; the user still confirms. Manual edit stays.
  - **Ranges, not single numbers (Yash, 7 Nov).** A photo of a whole meal cannot see oil, sauce or what was left behind, so the model proposes the dishes (top-k with confidence) and a portion range. Nutrition comes from the same estimate pipeline, and the shown range combines portion uncertainty with the source spread.
  - **Avoid one-source bias.** Average across several databases or sources wherever possible, keep their spread as the range, and say when only one source was found. Never present a model's single guess as a measurement.
  - **Keep the 7 Nov estimate rules** (`services/coach/coach/model_client.py`): a model estimate needs a real low-high range, and a count of servings is asked as one serving and multiplied in code, never by the model.
- An LLM or BERT parser for free text. Same rule: it only fills drafts.
- An RL experiment (Q-learning/SARSA from FIT3080), for example adaptive reminder timing in a simulator. It needs an honest baseline, and real diary data must never be used as reward.

## Rules that matter most
- Unknown is not zero. Snapshots are immutable. One write is one transaction with an operation key and an expected revision. Nothing saves without confirmation. No diary data leaves the device.
- A failing test comes first, built from the exact input (`.claude/skills/parser-case`).
- Stage paths explicitly. The guard hook blocks `git add -A`, force-push and `--no-verify`.
