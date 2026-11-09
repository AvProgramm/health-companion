# Milestone 5 walkthrough: the Coach, the Trainer and the Nutritionist

Open each file beside this page. The order follows real uses, from the screen down. Local adaptations have their own page, [m5-profile-walkthrough.md](m5-profile-walkthrough.md). The dish photo is Milestone 6.

The whole milestone follows one idea: **the model only proposes, and ordinary code decides.**

## 1. Asking the Coach "How much sodium is too much in a day?"

**Screen to service.** [AskCoach.tsx](../../apps/web/src/ui/AskCoach.tsx) `handleSubmit` → [coach.ts](../../apps/web/src/api/coach.ts) `askCoach` → [post.ts](../../apps/web/src/api/post.ts) `postJson`. The body is only `{ question }`.
- *Why:* invariant 5. The diary is not involved, so it cannot leak.

**The door.** [app.py](../../services/coach/coach/app.py) `coach` calls `check_local`, then `answer_question` in [answer.py](../../services/coach/coach/rag/answer.py).
- *Why:* only the local app's own pages may use this service, and a Pydantic model refuses extra fields.

**Safety comes first.** [safety.py](../../services/coach/coach/safety.py) `check_safety` walks a list of small rules: emergency, self-harm, dosing, diagnosis, extreme dieting, injection, diary.
- *Why:* a question about an insulin dose should reach neither a search nor a model. A new kind of refusal is one more list entry.

**Finding the cards.** [retriever.py](../../services/coach/coach/rag/retriever.py) `Retriever.search` over the 36 cards in [cards.json](../../services/coach/knowledge/cards.json):
1. [bm25.py](../../services/coach/coach/rag/bm25.py) `BM25Index` scores shared words, with `stem` making plurals singular.
2. [vectors.py](../../services/coach/coach/rag/vectors.py) `VectorIndex` scores meaning, with MiniLM running on the CPU.
3. `rrf` merges the two rankings using positions only.

If the closest card is below similarity 0.336, it returns nothing.
- *Why positions only:* BM25 scores and cosines are on different scales, so adding them would be meaningless.
- *Why it abstains:* a card about something else is worse than saying "I don't know".
- *Why [cards.py](../../services/coach/coach/rag/cards.py) refuses incomplete cards:* a card with no source or date could not be cited honestly.

**Checking the answer.** `build_context` numbers the cards and labels them as data, and Groq replies with claims. `validate_citations` keeps a claim only if it cites a real card and every number in it appears in that card.
- *Why:* model output is never trusted for numbers. An invented "1,500 mg" gets dropped.
- *With no key or a busy provider:* the reviewed cards themselves are shown, so the feature degrades instead of breaking.

**Back on screen.** [coachReply.ts](../../apps/web/src/domain/coach/coachReply.ts) `readCoachReply` validates the reply. [SourceLine.tsx](../../apps/web/src/ui/SourceLine.tsx) shows sources as plain text, never links, as `CLAUDE.md` asks.

## 2. "120 minutes, no kit" from the Trainer

[TrainerCard.tsx](../../apps/web/src/ui/TrainerCard.tsx) sends only goal, minutes, kit, areas and level (invariant 5). In [trainer.py](../../services/coach/coach/trainer.py) `plan_session`:

1. `check_safety` runs on the goal.
2. [exercises.py](../../services/coach/coach/exercises.py) `search_exercises` filters by area, kit and level, then `spread_by_muscle` builds a shortlist of 40.
   - *Why first:* the model only sees exercises the person could do, so it cannot talk its way past a hard limit. Unknown equipment is left out, never treated as bodyweight.
3. [agent.py](../../services/coach/coach/agent.py) `run_coach` runs a JSON loop of at most three model calls.
   - *Why three:* it cannot loop forever or drain the free tier. Tool results are labelled as data, because retrieved text must never act as orders.
4. `valid_picks` keeps only IDs that are really on the shortlist. With too few, a balanced library set is used and labelled as such.

Back on the phone, [trainerPlan.ts](../../apps/web/src/domain/training/trainerPlan.ts) `planFromProposal` drops unknown IDs, turns the ranking into preferences, and calls the same `bestPlan` and `ineligibleReason` as every other session.
- *Why:* the AI's reply is a proposal, and the same rules apply however a session was chosen. A long session repeats a varied set, instead of eight blocks of three exercises.

## 3. The Nutritionist

[NutritionistCard.tsx](../../apps/web/src/ui/NutritionistCard.tsx) → [nutritionist.py](../../services/coach/coach/nutritionist.py) `suggest_meals`, which follows the Coach's steps but searches only the nutrition and diabetes cards.

`valid_suggestion` refuses any entry stating calories or nutrient amounts.
- *Why:* those numbers come only from the estimate step, with its ranges and energy check.

"Use as draft" only fills the Today entry box through `initialEntry` in [App.tsx](../../apps/web/src/ui/App.tsx).
- *Why:* invariant 4. The person still reviews, estimates and confirms.

## 4. Adding an exercise the library lacks, down to storage

A search miss in [ExerciseSearch.tsx](../../apps/web/src/ui/ExerciseSearch.tsx) offers the typed name. [OwnExerciseSheet.tsx](../../apps/web/src/ui/OwnExerciseSheet.tsx) `confirm` → [customCards.ts](../../apps/web/src/domain/training/customCards.ts) `ownExerciseCard` → [GymView.tsx](../../apps/web/src/ui/GymView.tsx) `persistChoice` → [customCardsRepo.ts](../../apps/web/src/storage/customCardsRepo.ts) `saveCustomCard`.

- *Why blank facts stay `null`:* invariant 1 applied to exercises. Unticked is not the same as "loads nothing", so an active adaptation leaves the exercise out.
- *Why one ID per open form:* a retried save replays instead of creating a second exercise (invariant 3).
- *Why Delete adds a version:* invariant 2. History is kept, and the pool simply stops using it.
- *Why no schema change:* an own exercise is a new kind of value in the existing `customCards` store. `validSource` refuses a card that lies about where it came from.

## 5. How the retrieval design was chosen

[evaluate.py](../../services/coach/coach/rag/evaluate.py) compares six designs. The development and sealed questions were written before any search ran, and the decision rule was committed before the sealed run (`d218dcf`).

| Sealed result ([retrieval_final.json](../../eval/results/retrieval_final.json)) | Recall@3 | MRR |
|---|---|---|
| Words + meaning, whole cards (**shipped**) | 0.987 | 0.944 |
| Meaning only, whole cards | 0.974 | 0.952 |
| Words only, whole cards | 0.910 | 0.871 |

Say these plainly:
- The winning margin is about half a question.
- Meaning alone has the better MRR.
- Sentence windows lost, so small-to-big did not ship.
- Query rewriting and reranking were not built, because development recall@3 was already 0.986.
- The threshold caught 6 of 8 out-of-scope questions. The misses were a banana bread recipe and daily step counts.
- Claude wrote both the cards and the questions, so these scores are optimistic.

## 6. MCP

[mcp_server.py](../../services/coach/coach/mcp_server.py) is hand-written stdio JSON-RPC with exactly two read-only tools. `search_evidence` reads the reviewed cards, and `get_demo_day` returns a fictional day.
- *Why only those:* a client can never reach a real diary, because no tool reads one (invariant 5).

## Bugs found

| Bug | Test that now covers it |
|---|---|
| 120 min with no kit gave three exercises, eight blocks each | `trainerPlan.test.ts`: fills 120 minutes with a varied set |
| First `search_exercises`: `KeyError`, a crash on unknown equipment, unknown treated as bodyweight, exact level match, alphabetical slice | `test_exercises.py` |
| BM25 treated "sugar" and "sugars" as different words | `test_rag.py`: `test_stem_follows_the_s_stemmer_rules` |
| Abstention threshold sat on the edge of its gap | `test_rag.py`: `test_threshold_sits_in_the_middle_of_the_gap` |
| Editing the minutes after a reply changed the "of N min" shown | `TrainerCard.test.ts`: keeps the minutes a session was planned for |

## Verified

- `npm run check` passed at `84f7b20` and again after later commits, including 139 coach tests.
- Throwaway mutant checks on `trainerPlan.ts` (3 of 3 caught), then deleted.
- Sealed retrieval ran once, and a second run was refused (terminal).
- Browser pane, localhost:4173, with the real service and Groq:
  - Trainer: 120 min, no kit, 12 different exercises.
  - Coach: a cited answer, an honest no-evidence reply, a dosing refusal, and the Ask card driven on the Me tab.
  - Nutritionist: a cited idea, then "Use as draft" reached the Today box, unsaved.
  - Own exercise: search miss, saved (pool 8 → 9), deleted (back to 8), no console errors.
- MCP: Claude Code connected through `.mcp.json` on 9 Nov. Both tools answered, and `tests/test_mcp.py` drives a real process over stdin and stdout.

## Not verified

- **Nothing here has been tested on the physical phone.** That is the next gate.
- Word-only search with no encoder, and the Trainer's `search_evidence` tool: unit tests only, never seen live.
- The Trainer's library fallback when Groq is busy: unit tests only.
- The safety rules are patterns tested on fictional cases only. Typos and unusual wording can slip through.
- Retrieval on real people's questions, or on guidance that has changed since the cards were written.
- Hosting: nothing has been deployed.
