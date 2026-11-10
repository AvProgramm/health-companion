# Final handover to Codex (10 Nov 2026, Claude Code, out of weekly tokens)

Read `CLAUDE.md`, then `docs/handoff/codex-11-nov.md`, then `docs/handoff/firebase-diary.md`. This file only adds what changed after those were written.

## Where things stand

- Last commit `6aea0d9` (pushed). It contains Codex's photo work: hosted photo capture before local inference, a remembered photo consent on the device, counted containers kept through scaling, and paced draft estimates.
- **Not committed:** the Firebase account work. That is `apps/web/src/api/firebaseAccount.ts`, `ui/components/me/CloudAccount.tsx` and its test, `services/coach/coach/cloud/`, `tests/test_firebase_account.py`, and edits to `MeView.tsx`, `app.py`, `package.json` and `docs/handoff/firebase-diary.md`. `npm run check` passed with these files in place on 10 Nov (coach 211, router 33, vision 92, web tests green); review the diff, then commit it.
- Yash has put the Firebase keys in the root `.env`. Never open or print that file. Check the names only against `.env.example`, and add any missing names there with no values.

## Decision this needs written down first

Firebase accounts and Firestore diary memory break two `CLAUDE.md` invariants as written:
- "No accounts, telemetry or other personal-data uploads."
- "No diary history leaves the device."

Yash chose this direction on 10 Nov, but `CLAUDE.md` still says the opposite. Before more cloud code lands, rewrite invariant 5 in his words. For example: accounts are opt-in; the diary stays local until the person signs in and turns on sync; each user reads only their own records, enforced by Firestore rules; and erasing removes the cloud copy too. Then make the code match that sentence, and test it.

## Memory design (agreed)

- **Episodic:** meals, workouts and sleep as dated events.
- **Semantic:** goals, preferences and limitations the person confirms.
- **Retrieval:** finding relevant records for a question.
- Totals come from date queries and code, never from the model. Vector search is only for vague questions. Any change the AI suggests is still a draft until confirmed.

## Checks before calling the account work done

1. Sign in with Google in the browser on localhost; the service accepts the ID token and rejects a missing, expired, wrong-project or other-user token. Tests for these exist; run them live too.
2. Firestore rules: one user cannot read another's documents. Test with the emulator, never against production data.
3. Signed-out use still works fully offline, as before.
4. Backup, restore and erase still cover every store, plus the cloud copy.
5. Record only what you observe in `docs/test-log.md`.

## Still open from earlier handovers

- The chat's working memory, so recent turns go with each message.
- Photo backups (Groq and Hugging Face vision models, with IDs confirmed in each provider's docs).
- The multi-food segment, crop and classify plan.
- Hosting: licence first.
- Walkthroughs in `docs/milestones/` for everything built since 10 Nov, so Yash can explain it back.
- Phone checks for all of it.
