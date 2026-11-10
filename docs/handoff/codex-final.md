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

## Plan to Friday and the demo (agreed with Yash, 10 Nov evening)

Yash reports that Google sign-in now works in the app (Claude did not see it). Port 8000 was restarted by him.

### Before Friday

| When | Do | Why |
|---|---|---|
| Tonight | Reload the phone twice and run every demo step below once | Most of 10 Nov's work has only passed unit tests, never the phone |
| Tonight | Write any failure into `docs/test-log.md` and fix it, failing test first | A bug found on Thursday is too late |
| Wed | Hosting: Yash picks the licence, deploy, check the hosted link on phone data | His deadline, and a link is safer than USB on the day |
| Wed | Decide which model may receive diary lines; pin a stronger Gemini model for photos (`GEMINI_MODEL`) | Tempeh was read as fried chicken on the small model |
| Thu | Walkthroughs in `docs/milestones/` for the chat, photo reader, automatic estimates and diary sharing, so Yash can explain each part himself | He will be asked how it works |
| Thu | Yash records a 2-minute screen video of the demo | Backup if the network or a free tier fails live |
| Fri morning | Start the service, run the demo once, keep the video open | |

**Do not start before Friday:** Firestore sync, a vector database, the multi-food model. Sign-in existing is enough to talk about them. Do not refactor working demo paths this week.

### Demo order (about 5 minutes)

1. Type a meal, "2 weetabix and 300 ml milk": the estimate appears on its own with a range and sources, and nothing saves until he confirms.
2. Correct it, "actually 250 ml": a new revision, the old one kept.
3. Photo of a plate, "List every food with AI": several foods with counts land in the entry box and the estimates load.
4. Barcode on the same screen, if a packet is handy.
5. AI tab: "Hi" and a protein question; "A 30 minute workout with no equipment" (a session adapted to his profile); switch on "Share my last 7 days" and ask "how was my week?" (it answers from his diary and names the days with nothing logged).
6. Airplane mode: the diary still opens and works.
7. Me: Google sign-in; sync is the next step and is opt-in.

Each of these seven must be checked on the phone and recorded in `docs/test-log.md` as PASS, FAIL or NOT TESTED before Friday.

### Stories he will tell (keep the records they rest on intact)

- A model that did not ship: the router head lost to keyword rules on a sealed test (`experiments/router/results/final.json`); the full ISIA retrain failed its ship rule (`experiments/vision/results/global_full_final.json`).
- Why photos moved to Gemini: 94% on the benchmark, but one name per photo while his real plates had five foods (`docs/test-log.md`, 10 Nov).
- Never trust model numbers: energy within 25% of 4 × protein + 4 × carbohydrate + 9 × fat, arithmetic in code, every estimate with a range.
- What is next: segment, crop, classify; memory the user can read and delete.

**Biggest risk:** a free model tier running out mid-demo. Steps 2 and 6 work offline, and step 1 does with a saved food.


## Codex rehearsal continuation (10 Nov, while Yash was away)

At takeover the branch was clean at 1fef81b. Full check/build passed. Port 8000 was unreachable, so Codex started the current checkout's coach; `/api/firebase/config` returned 200 directly and through localhost:4173 without printing values. The initial phone checklist was pushed in 25b10cd.

Yash then asked for all independent work while away. Codex prepared `m8-chat-and-diary-walkthrough.md`, `m8-capture-and-confirmation-walkthrough.md` and `m8-account-and-demo-walkthrough.md`, and added attribution rows to `docs/ai-log.md`. Invariant 5 now mentions the implemented seven-day switch and the pending permitted-provider decision. No model route changed and sharing stayed off.

The browser meal draft, greeting, protein reply, 30-minute plan and ready account card were checked. A cached-shell reload passed with the preview briefly stopped; the preview was restarted. See `docs/test-log.md` for limits, including the unverified Weetabix serving assumption. No new diary entries were saved. The coach and preview were left running on loopback.

Resume with phone step 1, not with a new feature. All seven phone results remain NOT TESTED in this rehearsal until Yash reports them. Then collect the licence/provider choices for Wednesday. Hosting, actual sign-in, real diary-sharing and phone radio-state checks are not completed by these browser observations. No sync, vector database, model training or working-path refactor was started.


## Latest MVP decision (Yash, 10 Nov)

Frontend hosting: Vercel; backend: Render, planned for 11 Nov. The redundant Me-page Google sign-in card is removed; general multi-user sign-in is later work. Developer Firebase ownership does not authenticate visitors. A later database migration may use Render PostgreSQL rather than Firestore/vector storage; no migration is implemented now. The single interview entry point is `docs/milestones/interview-walkthrough.md`, replacing the three separate M8 interview scripts. Historical milestone records remain as provenance. Licence and permitted diary-model choices remain pending.


## Beginner-readable organisation (Yash, 10 Nov)

Yash explicitly authorised small organisation refactors despite the earlier freeze. His rules are now in CLAUDE.md: read first each chat, check existing components/data before new code, pages for screens, components for reusable UI, data for I/O, one job/file, max 300 lines, suggest a Git save point, and change/verify one folder at a time. Begin app explanations with the child-friendly folder map.

Save points: 7d33b80 before refactoring; db60917 after API moved to data/api; 900d3c6 after persistence moved to data/storage. The third checkpoint relocates the plain seven-day loader to data/diary/loadWeek.ts. Functions are unchanged except imports. Each checkpoint passed full check/build; all moved files were mechanically compared. Database name/version/stores, backup format, domain algorithms, request fields/endpoints/timeouts and sharing/model route remain unchanged. No real diary data was sent in the browser smoke check.

The one interview walkthrough has the current folder map. Historical milestone documents retain old paths as provenance. The schema-migration checklist now points to data/storage/connection.ts; this was not a schema migration. Keep future refactors small and separately verified; do not turn remaining UI orchestration into a new framework. Hosting/licence/provider and physical-phone gates remain as previously recorded.
