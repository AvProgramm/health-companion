# Device test log

Record only what was actually observed. Put "NOT TESTED" if a step was skipped.

## Milestone 1 gate: save, close, reopen, correct
| Date | Phone / Android | Chrome | Step | Expected | Observed | Pass? |
|---|---|---|---|---|---|---|
| | | | Save 300 mL | rev 1 · 133.0 kcal | | |
| | | | Swipe away, unplug, airplane mode, cold reopen | rev 1 · 300 mL still shown | | |
| | | | Correct to 250 mL | rev 2 · 110.8 kcal | | |
| | | | Close and reopen again | rev 2 · 250 mL | | |
| | | | Storage status line | "persistent" or "best effort" (write which) | | |

## If the offline reopen fails, check these in order
Open `chrome://inspect` → inspect the phone tab → Application. Write each finding in the table above.
1. **Same origin?** The address must be exactly `http://localhost:4173`. `127.0.0.1` or an IP address is a different origin, and so a different, empty database.
2. **Production build?** It must be the build served by `npm run preview`, not `npm run dev`.
3. **Service worker activated and controlling the page?**
4. **Cache Storage complete?** It should hold `index.html` and every `/assets/*` file.
5. **IndexedDB populated?** `health-companion` → `meals` / `revisions` should have rows. Also check `persisted()` and the site-data settings.
6. **Same Chrome profile?** Not incognito, and not opened in another app's WebView.
7. **Reproducible on the laptop?** Tick DevTools Network → Offline and reload.
