# ADR-001: Local-first React + TypeScript PWA

**Status:** accepted 7 Nov 2026 (Yash), pending the Milestone 1 phone gate.

## Decision
- **Frontend:** Vite + React + TypeScript, served as a production build.
- **Diary storage:** IndexedDB in the browser.
- **Offline support:** a hand-written service worker that precaches the build.
- **Backend:** none for the diary.
- **Coach and experiments (later):** a separate, optional Python service on the laptop at `127.0.0.1`.

## Why
- Node is already installed. Flutter would need Android Studio, the SDK and USB setup on Windows first, which costs 1.5–3 hours of a six-day sprint.
- Yash has shipped React 19 + Vite + plain CSS before (the Veritaserum frontend).
- One build serves both the Android phone and the laptop.
- The ledger runs in one testable language (TypeScript) on the device, so totals never depend on a server.

## Costs we accept
- **Browser storage belongs to one origin and can be cleared.**
  - We request `navigator.storage.persist()` and show the result honestly.
  - We ship export and restore (Milestone 2).
  - The origin never changes (`http://localhost:4173`).
- **Reminders are foreground only**, and the app says so.
- **Updating the phone copy requires plugging the USB cable back in** to the laptop.

## Fallback
If the offline cold start fails, run the diagnosis checklist in `docs/test-log.md` first. Write up alternatives here only if service worker + IndexedDB still fail after those fixes. A stable HTTPS static origin comes first; Flutter + SQLite comes last.
