# Explain the chat and opt-in diary context

## Say it in the interview

"One chat routes a message to a question-answering Coach, a Nutritionist or a Trainer. The routing rules are deterministic. The Trainer proposes library IDs, and my planner checks them again on the device. For a diary question I can explicitly share seven dated summary lines, whose totals are calculated in code. The model describes that context; it does not own the diary or save changes."

## Follow one request

`AiChat.tsx` holds the message and reply in screen memory. `domain/chat/chatIntent.ts` reads the intent and session settings. `components/ai/askAi.ts` chooses the helper. A workout request always goes through the Trainer path; its returned exercises still pass `planFromProposal` with local limitations. Saved profile restrictions are not pasted into the request.

Without diary context, a food-idea request goes to the Nutritionist; when it lacks evidence the Coach can give a labelled general answer. Questions go to the Coach. `ChatReply.tsx` presents each response under its role. This screen has no conversation memory sent to the service: a follow-up is a new independent request.

With the sharing switch on, `loadWeekLines` reads seven local dates. It loads the latest meals, workouts and sleep, then calls existing domain summaries. Deleted meals and inactive components are excluded from food names. `weekLines` formats a bounded line per date. Gaps, unknown nutrition and partial totals have different text. At most seven lines of 200 characters reach `CoachRequest.context`; up to eight distinct food names appear per line, and long lines are clipped. This bounded view is not the full database or a complete nutrient history.

The sharing switch starts off on every new AI screen. Loading occurs only when it is on and a message is sent. Shared lines route question/food messages to the Coach; workout planning still uses its own path. The model route currently chooses between Groq and Gemini through the shared availability queue. Yash has not selected the permitted diary provider yet: keep real diary sharing off until that decision is made. Do not claim that Google sign-in or Firestore is required for these local summaries.

## What the server checks

`rag/answer.py` runs `check_safety` before retrieval or a model call. Diary context only bypasses the specific refusal saying the Coach cannot see the diary. Dosing and diagnosis refusals still apply. The context is labelled as data, not instructions, and the prompt asks the model to name dates and acknowledge missing days.

With no diary context, the grounded path retrieves reviewed cards and keeps claims only when their citation IDs exist and their numbers appear in the cited cards. This does not prove a sentence logically follows from its citation. The general-answer and diary paths validate shape and length, not every factual statement. Their answers remain labelled as unchecked general information. Prompt instructions are not a mathematical guarantee against invented facts.

Code computes nutrition aggregates before the model sees them. The current lines include daily energy, food names, session counts and sleep; they do not include enough information to calculate weekly protein. Do not claim the model can produce a reliable protein total from those lines.

## Explain the memory choice

Episodic memory is the dated diary. Retrieval is how relevant records are found. Lasting saved goals/preferences would be semantic memory; carrying earlier chat turns would be working memory. Neither a vector database nor retraining model weights is required to read seven exact dates. Firestore sync and new memory systems are deferred until after Friday.

## Verification and questions to answer

Unit tests cover the sharing gate, outgoing fields, missing days and safety refusals with fictional data. Claude's handover reports a live fictional-context reply on port 8001. Those checks are not a phone test. The current rehearsal results are in `docs/test-log.md`.

Explain why a missing day is not a zero-calorie day; which code computes totals; why Trainer IDs are checked twice; why a citation is not proof; and why a seven-day summary is not permission to upload the entire diary.
