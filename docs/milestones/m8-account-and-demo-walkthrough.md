# Explain account sign-in and run the Friday demo

## Account boundary

"Google sign-in currently connects an account; it does not upload or synchronise the diary. My diary still uses IndexedDB. Firebase cloud records and vector retrieval are future work after the interview."

`api/firebaseAccount.ts` fetches only the public web configuration from the laptop. Model keys are not returned. It initialises Firebase Authentication with in-memory persistence, prepares the popup before the button tap, and opens Google sign-in only after that tap. The browser obtains an ID token and sends it to `/api/firebase/account`. It never sends a caller-selected owner as authority.

`coach/cloud/session.py` asks Firebase's account lookup endpoint to validate that token. It then checks the returned account against its subject, configured project/issuer, expiry, disabled state and revocation time. Locally decoding a token alone would not authenticate it; remote Firebase validation is the trust boundary. The server returns only the verified UID and display name. Responses use no-store and the service worker bypasses API requests.

Sign-out clears the Firebase session. In-memory authentication means a full reload may require another sign-in. It does not erase the diary. No administrator key or Firestore access is needed for the implemented account lookup. There are no sync buttons, cloud migration, cloud erasure or deployed per-user Firestore rules to demonstrate yet.

## Five-minute order

1. Reload twice at the same phone origin. Type `2 weetabix and 300 ml milk`; show automatic proposals, source/range and the unsaved state. Compare any serving assumption with the packet before confirming. A saved food can reuse its checked values.
2. After explicit meal confirmation, enter `actually 250 ml`. Show the new milk amount and revision history. Keep the old revision as evidence of the correction.
3. Choose a plate photo. Review its AI food list and counts, then place the list in the composer. Correct wrong guesses before accepting estimates or saving.
4. Look up a packet barcode on Today if one is available. Review the label and basis. If no packet is available, record NOT TESTED.
5. In AI, send `Hi`, a protein question, and `A 30 minute workout with no equipment`. Show the locally checked plan. Demonstrate diary sharing only after the provider decision: the screen should acknowledge missing dates. Keep it off while that decision is pending.
6. Use airplane mode and reopen the installed diary. Show the existing local entries and a local edit. An AI service call failing offline is expected; the diary must remain usable.
7. Open Me and Google sign-in. State that cloud sync is the next milestone. A prior reported sign-in is not proof of today's phone rehearsal.

Record each phone step in `docs/test-log.md` as PASS, FAIL or NOT TESTED. For a failure copy the exact input and visible error; create the regression before changing code. Do not clear phone site data to refresh an old build.

## Wednesday hosting gate

Ask Yash for his code licence and permitted diary-model provider first. Do not choose either on his behalf. A build passing locally is not a hosted deployment.

The deployed frontend needs HTTPS, a reachable server-side `/api`, trusted-host/origin configuration and the authorised Firebase sign-in domain. A static host alone will not run FastAPI; the Vite preview proxy is a local development convenience. Keep provider credentials only in server environment settings. Confirm whether the 187 MB local model is included and where its assets are served. Check the hosted link on phone mobile data with USB disconnected and record the result. No deployment or billing change is authorised by merely preparing this runbook.

## Thursday and Friday

Yash should explain each walkthrough back in his own words and mark his actual changes/review in `docs/ai-log.md`. Do not attribute AI-written code to him. Record a two-minute phone video after the demo works. On Friday morning start the local service if using the USB fallback, rehearse once, keep the video ready and stop changing working paths.

Tell the experimental stories honestly: the intent-router head lost to keyword rules and did not ship; the full ISIA retrain failed its ship rule; a single-label classifier's benchmark score did not solve mixed plates. Do not rerun a sealed evaluation to get a better story.
