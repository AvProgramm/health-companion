---
description: Build, serve and walk Yash through the offline phone test, then record what he saw
argument-hint: "[milestone number, e.g. 3]"
---

Run the phone gate for Milestone $ARGUMENTS.

1. Run `npm run check`. Stop and report if anything fails; never test a red build on the phone.
2. Run `npm --prefix apps/web run build`. If a preview server is already on port 4173, check it serves the new hashed files (`curl` each `dist/assets/*` file and `sw.js`, expect 200). Otherwise ask Yash to start `npm --prefix apps/web run preview`.
3. Give Yash the steps from `docs/test-log.md`:
   - USB debugging on
   - `chrome://inspect/#devices` shows the phone (not "Pending authentication" or "stale")
   - port forwarding `4173 → 127.0.0.1:4173` with Enable ticked
   - open `http://localhost:4173` and reload twice so the new service worker takes over
4. List the milestone's checks from the matching table in `docs/test-log.md`, plus the airplane-mode reopen.
5. When Yash reports back, write only what he observed into `docs/test-log.md` (date, device, Chrome version, PASS / FAIL / NOT TESTED). If something failed, go through the "If the offline reopen fails" checklist before proposing any change.
