# Device test log

Record only what was actually observed. Put "NOT TESTED" if a step was skipped.

## Milestone 1 gate: save, close, reopen, correct
| Date | Phone / Android | Chrome | Step | Expected | Observed | Pass? |
|---|---|---|---|---|---|---|
| 7 Nov 14:23 | Samsung (serial R5CW8050M6X); model and Android TBC | TBC | Save first amount over USB (350 mL used instead of 300) | rev 1 · 350 mL | rev 1 · 350 mL (screenshot) | PASS |
| 7 Nov 14:23 | same | TBC | Correct over USB to 400 mL | rev 2 · 177.3 kcal · 13.6 g | rev 2 · 400 mL · 177.3 kcal · 13.6 g · added sugar 0.0 g (screenshot) | PASS |
| 7 Nov | same | TBC | Swipe away, unplug, airplane mode, cold reopen, correct | saved entries shown, correction saves | Yash reported "working on airplane mode too"; exact revision and amount not recorded | PASS (reported) |
| 7 Nov | same | TBC | Storage status line | "persistent" or "best effort" | "Chrome may clear it…", so persist() returned best effort | NOTE |

**Setup notes (7 Nov):**
- Desktop Chrome `chrome://inspect` showed the device as "Pending authentication" until the USB debugging prompt was accepted on the phone.
- Port forwarding needed a new row `4173 → 127.0.0.1:4173` with **Enable port forwarding** ticked. Only an old 8080 row existed before.

## Milestone 2 phone checks
| Date | Step | Expected | Observed | Pass? |
|---|---|---|---|---|
| | Plug in and reload twice so the new version takes over | The Today screen has a composer and a Foods/Me tab bar | | |
| | Milestone 1 meal still there (v1 → v2 upgrade) | 7 Nov shows the earlier milk meal | | |
| | Type "2 weetabix and 300 ml milk", add both foods from the draft, save | 266.0 kcal · 14.3 g · added sugar 0 g known + 1 unknown (with the golden label values) | | |
| | "actually 250 ml" → Save correction | 243.8 kcal · 12.6 g, still one meal | | |
| | Me → Download backup | A `.json` file appears in Downloads | | |
| | Airplane mode, close Chrome, reopen | Today still shows the meal | | |

## If the offline reopen fails, check these in order
Open `chrome://inspect` → inspect the phone tab → Application. Write each finding in the table above.
1. **Same origin?** The address must be exactly `http://localhost:4173`. `127.0.0.1` or an IP address is a different origin, and so a different, empty database.
2. **Production build?** It must be the build served by `npm run preview`, not `npm run dev`.
3. **Service worker activated and controlling the page?**
4. **Cache Storage complete?** It should hold `index.html` and every `/assets/*` file.
5. **IndexedDB populated?** `health-companion` → `meals` / `revisions` should have rows. Also check `persisted()` and the site-data settings.
6. **Same Chrome profile?** Not incognito, and not opened in another app's WebView.
7. **Reproducible on the laptop?** Tick DevTools Network → Offline and reload.
