# Photo capture without the model download

## Explain it back

Choosing a file only makes a local preview. The primary action, "List every food with AI", redraws a small JPEG and sends that copy only after a tap. It lists food names and portions, never nutrients. "Put these in the entry box" fills text; the existing review and confirmation still decide what is saved.

The local model is a separate, expandable fallback. It runs only when requested, and its real download size is shown beforehand. A build without local model facts can still use the hosted reader. This avoids making the hosted path wait for a 187 MB download.

Each selection gets a new revision key. React replaces the hosted reader for that selection, so an old in-flight reply cannot populate a different photo. Re-selecting the same file also starts a fresh reader. Preview URLs are released when replaced.

## Verification

Failing tests were written first for immediate AI access, builds without a local model, and an old reply after a replacement photo. Existing local confidence, download progress, errors, explicit upload and draft-only cases remain covered. No model training, weight downloads or diary uploads were performed.

Phone checks remain manual: choose a photo, check that no model download begins, tap the AI action, review the list, and confirm the entry only after checking portions. Expand the fallback to test local recognition after its model was previously downloaded. Switch photos during an AI request and check that the old list is not shown.

## Remembered choice (Yash, 10 Nov)

Yash chose a remembered opt-in instead of a mandatory tap for every photo. The card exposes a checkbox with the upload statement next to it. It starts off and is stored as a boolean in localStorage, alongside the existing device preferences; no diary schema or photo storage is added. An unreadable preference defaults to off.

The reader starts once for each photo after that opt-in. A ref prevents effect replays or turning the choice on after a manual request from uploading the same photo twice. Turning it off stops automatic reading for later selections; if shrinking has not finished, the pending automatic upload also stops. Explicit retries remain available. Tests remount the card to check the remembered value, turn it off, and check that only the redrawn JPEG is sent and no draft is accepted automatically.
