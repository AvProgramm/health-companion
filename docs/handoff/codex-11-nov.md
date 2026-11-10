# Handover to Codex (written 10 Nov 2026, 11:30, by Claude Code)

Claude Code is unavailable for the next days. Branch `feat/ai-trainer`, last commit `13025e0`, pushed, `npm run check` green (198 coach tests, web, router 33, vision 92). Read `CLAUDE.md` first; its rules and invariants still apply. Deadlines: hosting by Wed 11 Nov; Deriv interview Fri 13 Nov, 1:35 pm MYT.

## The main issue: the photo model

Yash tested 11 of his own photos on the phone (table in `docs/test-log.md`, "Global food model on the phone"). His verdict: "Nothing seems good."

| What he saw | Why |
|---|---|
| Fried chicken, rice and a cola → only "Fried chicken 45%" | The model gives one name for the whole photo, so it cannot list several foods |
| Almonds 72%, but no count | A classifier cannot count pieces |
| Milk carton label → "Protein shake 21%" | It cannot read text on a label |
| Paratha and dal → "Roti canai 30%"; rice bowl → "Bibimbap 20%" | The 686 names lean Malaysian, and most confidences are under 50% |
| "almonds 1 plate" → 160 kcal for "1 typical serving" | The portion the photo pick adds ("1 plate") is not a real amount |

More training will not fix the first three. **Yash's decision for Friday: stop training our own model and use the Gemini API for photos, because it is more accurate.**

## Built today (not yet seen in a browser or on the phone)

1. **Photo reader** (`services/coach/coach/photo.py`, `POST /api/photo`, `apps/web/src/ui/components/meals/PhotoFoodsReader.tsx`). After choosing a photo, "List every food with AI" sends a 768 px re-drawn JPEG to Gemini. The reply is checked in code (unit list, no nutrient words, at most 8 foods) and becomes entry text such as `12 almonds, 1 bowl of dal`. It only fills the entry box.
2. **General answers** (`rag/answer.py`, `general_answer`). With no reviewed card on a topic the Coach gives the model's own answer under the label "not checked against reviewed guidance". Safety refusals still run first.
3. **One AI chat** (`apps/web/src/ui/components/ai/`, `domain/chat/chatIntent.ts`, new AI tab). Keyword rules send each message to the Coach, Nutritionist or Trainer service. Replies are labelled by role, **Coach** (questions and sessions) or **Nutritionist** (food and cooking), never by the hosted model's name. `AskCoach`, `NutritionistCard`, `TrainerCard`, `AskCard` and `AnsweredBy` were deleted.

Invariant 5 changed with Yash's approval: a photo may leave the device on an explicit tap.

**Before anything else:** restart the coach service so `/api/photo` exists, serve the fresh build, and try in the browser pane and on the phone: one question, one food idea, one "30 minute workout", and one photo with "List every food with AI". Record what is observed in `docs/test-log.md`. Checked live on 10 Nov after restarting the service (generic text, through the proxy): "Hi", "How much priten is too much" and "how do I cook dal" each got a friendly general answer; before the restart the phone showed the old no-guidance line. Yash wants the chat to feel like an intelligent agent, not a question box. Known gaps: the chat answers each message alone (no memory of earlier turns); a session's place and difficulty come only from words in the message.

## What Yash asked for next, in his order of urgency

1. **Gemini as the main photo path.** Today it is a second button under the on-device guesses. He wants it to be the accurate default. Keep a visible statement of what is sent, and keep the on-device model as the offline fallback. Ask him whether one tap per photo is still wanted, or a remembered "always use AI for photos" setting on the device.
2. **Estimates without pressing a button.** When a typed or photo entry reaches review and a food has no saved match, fetch the nutrition estimate automatically (whichever of Groq, Gemini or Tavily search is available), show it in the draft, and let him edit any nutrient afterwards. Nothing saves until he confirms (invariant 4). Only the food name and portion text are sent (invariant 5). Start in `apps/web/src/ui/components/meals/EstimateDraft.tsx` and `useEntryPanel`.
3. **A better estimate from two opinions.** Ask Gemini directly, and separately build the web-search (Tavily) estimate, then have a model pick the less biased one. Whatever is picked must still pass the code checks in `model_client.py` (real low-high range, energy within 25% of 4 × protein + 4 × carbohydrate + 9 × fat, servings multiplied in code). The picker chooses between checked candidates; it never writes numbers. Mind the six-second estimate budget in `pipeline.py`.
4. **Portions from a photo.** "1 plate" should become the counted or estimated amount from the photo reader (`12 almonds`), not a typical serving.

## Added later on 10 Nov (after the handover was first written)

- **Done: estimates arrive without a tap.** `EstimateDraft.tsx` fetches as soon as a draft row has a food with no saved match, and "bowl of dal" is split into food "dal" and portion "1 bowl". The button now reads "Estimate again". Unit tests pass; not seen on the phone. Left to do: a count before a container ("2 bowls of dal") still loses the 2, and several rows fetch at once, so watch the providers' rate limits.
- **Done: the chat is friendly** and answers greetings, typos and off-topic questions (checked live). The "not checked" note is once in the footer.
- **Photo reader seen on the phone:** on a plate of roti canai, tempeh, chickpeas, dhal and sambar it listed "1 roti canai, 1 bowl of curry, 1 bowl of chickpeas, 1 plate of fried chicken". Better than one name, but it called the tempeh fried chicken. Try a stronger Gemini model through `GEMINI_MODEL` (the default is the small flash-lite), and add "say what you are unsure of" to `photo.py`'s prompt.
- **Yash's view of the on-device model: "the vision transformer is trash".** The Malaysian set is too small for the fine-tune to tell these dishes apart. He is thinking of fine-tuning `google/vit-base-patch16-224` (or a Swin) on Food-101 on his laptop. Tell him plainly before he spends the days: that is still one label per photo, so it cannot fix a plate with five foods, counts or labels; M6 and M7 already tried ViT-Small and SigLIP2 with LoRA; and Food-101 has no Malaysian or Indian plates. For Friday the Gemini photo reader is the working path. A local model is worth it only as the offline fallback or as the FIT3181 story.

## Still open from the 10 Nov plan

- Phone: Coach, Nutritionist and session through the new chat; add and delete your own exercise; airplane mode after the model download; download time and time per photo.
- Split `experiments/vision/vision/run_global.py` (428 lines, over the 300-line rule), tests first, and update the Code Tour.
- Hosting by Wed: licence choice first; the 187 MB on-device model (may be dropped from the hosted build if Gemini becomes the photo path); Gemini free-tier limits, since the photo reader and chat now need a server-side key.
- Yash has not reviewed today's diffs or yesterday's repeated-code removal. He reviews every diff and explains it back, so write `docs/milestones/` walkthrough notes for the chat and the photo reader.

## Rules that are easy to break

- Never read `.env`, `KEY.txt` or the token file; never print a key. Fixtures and test text are fictional only.
- A model's numbers are never trusted: keep every check in code.
- Bug fix starts with a failing test. Files stay at or under 300 lines. Stage explicit paths; never force-push; push at each green check.
- `compareCandidates` and the PyTorch loop need Yash's sign-off.

## Chat memory: which kinds to add (Yash's idea, 10 Nov)

Yash shared a list of seven kinds of agent memory and asked which fit this app. Today the chat has only two: **retrieval** (the reviewed cards in `rag/`) and **parametric** (whatever the hosted model already knows). Each message is answered alone.

| Order | Kind | What it would be here | Where it lives | Why this order |
|---|---|---|---|---|
| 1 | **Working** (now) | Send the last few turns of this chat with each message, so "and for breakfast?" works | The screen's memory only, as now | Smallest change, biggest effect on "feels like an agent". Add a `history` field to the three request models, capped (for example 6 turns, 300 characters each), and run `check_safety` on the new message as today |
| 2 | **Semantic** (facts) | Lasting facts he chooses to tell it: vegetarian, dislikes, goal, usual gym kit | A new immutable IndexedDB store on the phone, shown and editable in Me | The most interesting one for a health diary: the answers become personal while the facts stay on the device. Only the facts relevant to one message are sent with it, and he must be able to see and delete every fact (a `schema-migration` skill exists for the new store) |
| 3 | **Episodic** (events) | "You slept 5 h on Tuesday and skipped legs" from the diary itself | Already on the phone: `week/weekOverview` builds one line per day | Powerful, but it means diary history leaving the device, which invariant 5 forbids. Only with his explicit approval, opt-in per message, and sending the summary lines, never raw entries |
| 4 | **Prospective** (later) | "Remind me to log dinner", a weekly check-in | Local notifications from the service worker | Useful after hosting; no model needed |
| - | Procedural | Already the code: the planner, the estimate checks, the safety rules | | Nothing to add |

**A vector database (he mentioned Firestore):** not needed for items 1, 2 and 4, which are small and local. It becomes relevant only for accounts with memory across devices, or a much larger card library. That is the parked "accounts and per-user coaches" idea, and it would end "no accounts, nothing leaves the device", so it is his decision and comes after Friday. The current card search (BM25 and MiniLM in memory) is enough for the reviewed cards.

**Recommended for Friday:** item 1 only. Item 2 is the best next milestone and a good interview talking point: memory the user can read, edit and erase, kept on the device.
