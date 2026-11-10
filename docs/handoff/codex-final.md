# Final handover to Codex (10 Nov 2026, evening, Claude Code; weekly tokens nearly gone)

Read `CLAUDE.md`, then this file, then `docs/handoff/firebase-diary.md` (the cloud plan) and `docs/handoff/codex-11-nov.md` (photo verdict, chat, multi-food model idea). Last commit `67ecac6`, pushed. Deadlines: hosting Wed 11 Nov; Deriv interview Fri 13 Nov, 1:35 pm MYT.

## Firebase keys: working; a real sign-in is the only check left

Checked through the running service on 10 Nov, evening, without opening `.env` (the scripts printed facts only, never a key). Yash enabled Google sign-in in the Firebase Console between the two runs.

| Check | Result |
|---|---|
| `GET /api/firebase/config` | 200; apiKey, projectId, authDomain and appId are all present |
| Google accepts the API key | Yes |
| Firebase Authentication set up | Yes (a fake token now gets `INVALID_ID_TOKEN`, where it got `CONFIGURATION_NOT_FOUND` before) |
| Google sign-in enabled | Yes (`accounts:createAuthUri` for google.com returned a sign-in link) |
| `localhost` authorised | Yes |

Not checked: an actual sign-in, which needs Yash at the browser (Me, account card). One older Google endpoint returned a project value that did not equal the configured project ID; it is probably the project number, and was not confirmed.

**Port warning:** an old coach process (uvicorn, started in an earlier session) still holds port 8000; Claude was not permitted to stop it, so Yash or Codex must (`Stop-Process` on the PID that owns port 8000, then start the service again). It and does not have the Firebase or diary-context code (it returned 404 for the config endpoint). The web preview proxies `/api` to 8000, so the phone and browser are talking to old code. Stop that process, then start the service again on 8000. Claude's checks used a second copy on 8001.

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

1. Google sign-in is enabled. Next: a live sign-in on localhost by Yash; Firestore rules in the emulator (one user cannot read another's records); record results in `docs/test-log.md`.
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
