# Final handover to Codex (10 Nov 2026, evening, Claude Code; weekly tokens nearly gone)

Read `CLAUDE.md`, then this file, then `docs/handoff/firebase-diary.md` (the cloud plan) and `docs/handoff/codex-11-nov.md` (photo verdict, chat, multi-food model idea). Last commit `67ecac6`, pushed. Deadlines: hosting Wed 11 Nov; Deriv interview Fri 13 Nov, 1:35 pm MYT.

## Firebase keys: checked, one thing blocks sign-in

Checked through the running service on 10 Nov without opening `.env` (the script printed facts only, never a key):

| Check | Result |
|---|---|
| `GET /api/firebase/config` | 200; apiKey, projectId, authDomain and appId are all present |
| Google accepts the API key | Yes (the key is recognised) |
| Firebase Authentication set up in the project | **No.** Google answers `CONFIGURATION_NOT_FOUND` |

**Yash must do this in the Firebase Console (an account setting, so not for an agent):** Authentication → Get started → Sign-in method → Google → Enable, and confirm `localhost` is under Settings → Authorised domains. Until then Google sign-in cannot work, whatever the code does. After that, re-run the check and try a real sign-in on localhost.

**Port warning:** an old coach process still holds port 8000 and does not have the Firebase or diary-context code (it returned 404 for the config endpoint). The web preview proxies `/api` to 8000, so the phone and browser are talking to old code. Stop that process, then start the service again on 8000. Claude's checks used a second copy on 8001.

## Built in this last session (commit `67ecac6`; web tests 565 and coach tests 214 pass)

**Diary-aware chat (episodic memory, step 4 of the cloud plan, done locally first).**
- The AI tab has a switch, "Share my last 7 days with the AI", off by default and off again each time the screen opens.
- When on, each message also sends one line per day, built in code on the device: `2026-01-05: food 1800 kcal (oats, dal); training 1 session; sleep 7 h 30 min`. Gaps read "nothing logged", never zero. Deleted meals and removed items are left out.
- Files: `apps/web/src/domain/week/weekLines.ts`, `ui/hooks/loadWeek.ts`, `ui/components/ai/askAi.ts` and `AiChat.tsx`, `api/coach.ts`; service `models.py` (`CoachRequest.context`, at most 7 lines of 200 characters) and `rag/answer.py` (`general_answer` with `DIARY_LABEL` and `DIARY_RULES`).
- Safety: dose, diagnosis and the other refusals still run first; only the "the Coach cannot see your diary" refusal is skipped when lines are shared. The lines are labelled as data, never instructions.
- Checked live on port 8001 with fictional lines: the answer named the foods and sleep per day and said which day had no food logged. Unit tests cover: nothing is read or sent unless the switch is on; the exact body sent; a dose question is refused even with lines.
- **Not checked:** in a browser or on the phone with a real diary. `WeekCard.tsx` still has its own copy of the week loading; make both use one loader (repeated code).
- **Not decided:** which hosted model may receive diary lines. `firebase-diary.md` says to check the provider's data-use terms first (Gemini's unpaid tier in particular). Today the lines go to whichever of Groq or Gemini is free. Ask Yash, then pin the route.

**Invariant 5 in `CLAUDE.md`** was rewritten for opt-in Google sign-in and sync, in Claude's wording. It does not yet mention the 7-day switch: add one sentence for it, in Yash's words.

**Firebase account work (Codex's, committed in `9b07b4c`)**: account card on Me, service token checks, tests. Sign-in is all that exists. No sync, no Firestore reads or writes, no cloud memory yet.

## What is left, in order

1. Yash enables Google sign-in (above). Then: live sign-in on localhost; Firestore rules in the emulator (one user cannot read another's records); record results in `docs/test-log.md`.
2. Free port 8000 and restart the service; rebuild and serve the web app; phone-check the chat, the 7-day switch, automatic estimates, the photo reader and the barcode on Today.
3. Cloud plan steps 2 and 3: cloud repositories behind the storage boundary, then a migration preview with read-back. Never erase the local diary automatically.
4. Chat working memory: send the last few turns with each message, capped, still safety-checked.
5. Semantic memory: goals and preferences the person saves, viewable and deletable in Me.
6. Photo backups (Groq and Hugging Face vision models; confirm IDs in provider docs).
7. Hosting: licence choice first.
8. Walkthroughs in `docs/milestones/` and rows in `docs/ai-log.md` for everything since 10 Nov. Yash has reviewed none of it yet.

## Rules that are easy to break

- Never open or print `.env`, `KEY.txt` or any token file. Test data is fictional only.
- A model never does arithmetic: totals come from code, and unknown is not zero.
- Nothing saves without the person confirming. AI output is a draft.
- A bug fix starts with a failing test. Files stay at or under 300 lines.
- Stage explicit paths; never force-push; push at each green check.
- `compareCandidates` and the PyTorch loop need Yash's sign-off.
