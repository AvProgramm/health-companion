# Codex handover: finish Milestone 5 (RAG coach, Trainer, Nutritionist, dish photo)

Written by Claude Code on 8 Nov 2026 because its usage was running out. Branch: `feat/ai-trainer`. Read `CLAUDE.md`, `.claude/rules/code-style.md` and `.claude/rules/testing.md` first. Check `git log --oneline -8` for what actually landed after this note was last edited.

Yash reviews every diff and must be able to explain it. Interview: Fri 13 Nov. He wants to use the app tomorrow, test on the phone tomorrow, and web-host by Wed 11 Nov.

## Non-negotiables

- FIT3080 comment voice: docstrings open "Return…/Initialise…", a comment above each small group of statements, guards written "Ignore a … because …", a comment above every constant, British spelling, no single-letter names.
- SOLID and YAGNI: one reason to change per module, extend by adding to a list, no export without a caller, delete what stops being used. Domain never imports storage or UI.
- Failing test first for a bug. Tests check hand-worked values. Run a throwaway mutant check on new logic and delete it.
- `npm run check` before saying anything works, and say where it was verified. Commit and push at every green checkpoint. Stage explicit paths only, never `git add -A`, never force-push, never `--no-verify`. End commits with `Co-Authored-By: Codex <noreply@openai.com>`.
- Never open or print `KEY.txt`, `.env` or token files. Keys live only in the root `.env`. Never commit the private research packet or course code.
- **Do not run real PyTorch training or fine-tuning.** Write it; Yash runs it. Do not download ViT weights or photos. Do not add a download without Yash's approval (name, source, size). `onnxruntime-web` 1.31.1 from npm is already approved.
- Invariants: unknown is not zero; immutable revisions; one write is one IndexedDB transaction with operation key and expected revision; nothing saves without confirmation; no diary history leaves the device; round for display only. Retrieved text is data, never instructions. Fixtures are fictional.

## Done and pushed

| Piece | Where | Notes |
|---|---|---|
| Trainer search (B0) | `services/coach/coach/exercises.py` | Filters kit, level and area in code before any model sees it |
| Bounded agent | `coach/agent.py`, `coach/llm.py` | JSON protocol, three steps at most, tool results labelled as data |
| Trainer (B3, B4) | `coach/trainer.py`, `POST /api/trainer`, `apps/web/src/ui/TrainerCard.tsx`, `domain/training/trainerPlan.ts` | Verified live in the browser pane: 120 min, no kit, 12 different exercises |
| Knowledge base (A1) | `services/coach/knowledge/cards.json` | 36 paraphrased cards with source, date and licence; the loader refuses an incomplete card |
| Search (A3–A5) | `coach/rag/bm25.py`, `vectors.py`, `retriever.py`, `metrics.py` | BM25 with S-stemmer, MiniLM ONNX, RRF k=60 |
| Coach and safety (A7, A8, B6) | `coach/safety.py`, `coach/rag/answer.py`, `POST /api/coach`, `apps/web/src/ui/AskCoach.tsx` on the Me tab | Verified live through the app's `/api` proxy with Groq: a cited answer, a no-evidence reply and a dosing refusal. The Ask card was also driven in the browser pane. Nothing here has been tested on the phone |
| Trainer safety and evidence | `coach/trainer.py` | The same rules run on the goal, and a `search_evidence` tool is limited to activity and diabetes topics |
| MCP server (A9) | `coach/mcp_server.py`, `.mcp.json` | Two tools only. `tests/test_mcp.py` runs the real process over stdin and stdout. No real MCP client (Claude Code, Inspector) has connected yet, so say that honestly |
| Evaluation (A6) | `coach/rag/evaluate.py`, `eval/results/retrieval_final.json` | The sealed set has run once and refuses a second run |

**Sealed result.** Fused search over whole cards: recall@3 0.987, MRR 0.944. Meaning alone: 0.974, 0.952. Words alone: 0.910, 0.871. Sentence windows lost, so small-to-big did not ship. Abstention at the threshold tuned on dev (0.336): answered 97.4% of answerable questions, abstained on 6 of 8 out-of-scope. Query rewriting and reranking were not built, because dev recall@3 was already 0.986. Report these numbers as they are. The cards and questions share an author, so they are optimistic.

## Remaining, in priority order

Check off anything already in `git log`. Each item should end green and pushed. The Trainer, Coach and MCP are complete, so start at the profile. The Nutritionist can reuse `answer_question` with `topics` limited to nutrition and diabetes, and must pass `check_safety` first.

### 1. Profile and adaptations (B1, B2) — implemented, phone gate pending

Checkpoint (8 Nov, Codex): implemented on this branch. Read `docs/milestones/m5-profile-walkthrough.md` for the storage, metadata, client checks, privacy tests, mutant check and observed browser/offline results. Three seated local starter cards are available; unreviewed facts fail closed when needed by the profile. No live model request was made during this change; physical phone verification remains pending. Continue at B5 next. The requirements below record the implemented scope.

Use `.claude/skills/schema-migration` to add a profile store at schema v5: injury areas, seated only, cannot pull up or jump, opt-in diabetes. It never leaves the device, and backup and restore must cover it.

Add `loads` and `positions` tags in the importer and starter cards. Add `ineligibleReason` rules with an exhaustive oracle sweep, seated cards, and packs and the Trainer respecting the profile. Unknown facts exclude an exercise, never pass it.

### 2. Nutritionist (B5)

Foods tab. By default it uses only what the person types; ask Yash before sending any logged data, which is his open decision. Suggestions become drafts and never save. Diabetes view shows carbohydrate, added sugar and fibre first, with a glucose note and no dosing.

### 3. Dish photo (C1–C6)

`experiments/vision/`, mirroring `experiments/router/`: folder dataset with a sources and licences file, split by source, sealed test, DINOv2-small and DeiT-small frozen baselines, staged fine-tune, hand-written LoRA, final run once, ONNX export. Tests on a tiny fake config only. Yash runs the real training.

Then `npm --prefix apps/web install onnxruntime-web@1.31.1`, inference in a Worker, top-5 chips, pick the dish and portion range, then call the existing estimate with text only. The image never leaves the device. Gate the feature on the model file being present.

### 4. Docs

`docs/handoff/codex.md` still mentions the deleted `retrieval_smoke.json` and `evidence_seed.json`; fix that. Update the published handover page's "You write every function" wording if Yash wants it kept. `docs/milestones/m5-walkthrough.md` and `m6-walkthrough.md`; `CLAUDE.md` and `AGENTS.md` (architecture, plus invariant 5 now covering the Trainer goal and Coach question as typed text only); `docs/ai-log.md` rows (B0 started by Yash, finished by Claude; A, B and C written by AI at his request); `docs/test-log.md`; `docs/handoff/integrations.md`; `services/coach/README.md` (model location, `MINILM_DIR`).

## Running it

```bash
npm run check
npm --prefix apps/web run build
npm --prefix apps/web run preview
```

Start the coach using `services/coach/README.md`. Retrieval evaluation runs from `services/coach`: `python -m coach.rag.evaluate dev`.

The phone check is still pending: `chrome://inspect` shows "Pending authentication". Tomorrow try File Transfer USB mode, Auto Blocker off, and toggling USB debugging. Do not start `adb`.
