# Run from VS Code and test on the phone

Open this existing folder in VS Code:

`C:\Users\User\OneDrive - Monash University\Desktop\HealthCompanion`

Use the integrated PowerShell terminal at the repository root. The current branch is `feat/ai-estimates`; do not discard existing local edits or reset the diary.

## Terminal 1: laptop estimates

The Python environment is already installed on this laptop. Start:

```powershell
.\services\coach\.venv\Scripts\python.exe -m uvicorn coach.app:app --app-dir services/coach --host 127.0.0.1 --port 8000 --no-access-log
```

The service reads the root `.env`. Restart it after changing a key or model setting. Keep secrets out of terminal output. For a fresh checkout, see `services/coach/README.md` for environment/dependency installation.

## Terminal 2: checked PWA build

```powershell
npm run check
npm --prefix apps/web run build
npm --prefix apps/web run preview
```

Open `http://localhost:4173` on the laptop. If port 8000 or 4173 is already occupied by the service/preview Codex started, use the running app. To take over in VS Code, stop only that existing coach/preview process first; do not silently switch ports. A different origin can make the diary appear empty.

Use the production preview for the phone/offline gate. `npm --prefix apps/web run dev` is available for desktop editing, but does not provide the production offline shell.

## Phone gate

1. Plug in USB, enable USB debugging, and accept the phone prompt.
2. In desktop Chrome, open `chrome://inspect/#devices`. Enable port forwarding with `4173 → 127.0.0.1:4173`. Port 8000 stays on the laptop; the preview proxies it.
3. On phone Chrome, open exactly `http://localhost:4173`. Reload twice; close/reopen the tab if the older build remains. Confirm earlier meals, workouts and sleep are present.
4. For a food not already saved, type `50 g oats`, then Review entry → Estimate nutrition. Review database sources and the range. Saved foods can be reused without another request.
5. Try an unknown dish such as `nasi lemak`. Review its assumed typical serving, recipe, AI badge, cited web sources and range. Use Edit if the assumptions do not match. Use estimate saves a food version; Save meal is the separate diary confirmation.
6. Correct the amount, undo, and check totals/ranges. Ensure the meal was not duplicated.
7. Unplug, switch to airplane mode, close/reopen, and confirm saved entries remain. Try an unknown food: manual entry and Log with unknown values must still work. Unknown logging starts at one piece; review it before Save meal.

Record what actually happened in `docs/test-log.md`. Physical-phone checks remain unverified until Yash reports the observations. Never clear phone site data to fix a stale build; preserve the diary and take a backup in Me.

The UI now has a desktop sidebar and a phone bottom dock. Quick entry collapses after Review entry; Sources and assumptions expands the secondary detail. If you still see the old narrow layout, keep the same origin, reload twice, then close/reopen the tab. Do not clear site data. Restart the coach after pulling provider changes.
