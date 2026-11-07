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

## Milestone 3 phone checks
| Date | Step | Expected | Observed | Pass? |
|---|---|---|---|---|
| | Reload twice after plugging in | Tabs read Today / Gym / Foods / Me; earlier meals still there (v3 upgrade) | | |
| | "add gym: row 3 x 8 at 5 kg each hand", then save | "3 × 8 @ 5 kg each hand", not 15 kg | | |
| | "slept 23:30 to 7", then save | 7 h 30 min in bed, counted under the waking date | | |
| | Gym tab | Row appears under "Last time" | | |
| | Airplane mode, then reopen | Sleep, meals and training still shown | | |

## If the offline reopen fails, check these in order
Open `chrome://inspect` → inspect the phone tab → Application. Write each finding in the table above.
1. **Same origin?** The address must be exactly `http://localhost:4173`. `127.0.0.1` or an IP address is a different origin, and so a different, empty database.
2. **Production build?** It must be the build served by `npm run preview`, not `npm run dev`.
3. **Service worker activated and controlling the page?**
4. **Cache Storage complete?** It should hold `index.html` and every `/assets/*` file.
5. **IndexedDB populated?** `health-companion` → `meals` / `revisions` should have rows. Also check `persisted()` and the site-data settings.
6. **Same Chrome profile?** Not incognito, and not opened in another app's WebView.
7. **Reproducible on the laptop?** Tick DevTools Network → Offline and reload.

## Milestone M3a browser verification (7 Nov 2026, Codex in-app browser)

| Step | Observed | Result |
|---|---|---|
| Live lookup through preview /api proxy | Open Food Facts returned oats on a 50 g basis with source and per-nutrient ranges | PASS |
| First request encounters provider failure, then retry | Actionable manual/unknown fallback; retry returned a proposal | PASS |
| Before Use estimate | Proposal said Not saved; no meal appeared | PASS |
| Use estimate, then Save meal | Food version filled the draft; meal appeared only after Save meal | PASS |
| Reload/reopen | Saved meal and approximate day ranges survived | PASS |
| Coach process stopped | Fictional oatcakes still logged locally with null nutrients; totals showed + 1 unknown | PASS |
| Coach and preview both stopped, reload | Cached diary opened and retained both test meals | PASS |
| Phone-width viewport (390 px) | Document width did not exceed viewport; cards and navigation remained readable | PASS (browser viewport only) |
| Final app tests | 148 tests in 17 files; typecheck and hook tests pass | PASS |
| Coach tests | 7 tests, including synthetic Groq HTTP fallback and privacy rejection | PASS |
| Production build | Vite build completed | PASS |
| Live Groq / live USDA | Keys still blank at verification time | NOT TESTED |
| Physical phone | No physical-phone interaction in this milestone | NOT TESTED |

The test meals above were entered in the separate browser preview for verification, not copied into fixtures. The existing M1 walkthrough edit was left untouched.

## Milestone M3a phone checklist

| Step | Expected | Observed |
|---|---|---|
| Add GROQ_API_KEY to root .env, then restart coach using services/coach/README.md | Key stays on laptop; /api uses it through the proxy | NOT TESTED |
| USB forwarding 4173 → 127.0.0.1:4173; open http://localhost:4173 and reload twice (close/reopen if still showing the old build) | Earlier diary entries remain; unknown draft offers Estimate nutrition | NOT TESTED |
| Type an unknown food and portion, e.g. 2 weetabix or nasi lemak; request estimate | Source badge, range, portion assumptions, and Use estimate/Edit; nothing saved yet | NOT TESTED |
| Tap Edit and change a value | Manual values remain editable and are labelled My estimate | NOT TESTED |
| Tap Use estimate, review amount, then Save meal | Food accepted first; meal saved once; day shows ≈ and ranges | NOT TESTED |
| Change amount / eaten fraction, undo, reload | Revision history stays intact and estimate ranges scale with the serving | NOT TESTED |
| Unplug, airplane mode, close/reopen | Existing meals, training and sleep still visible | NOT TESTED |
| Unknown food while unplugged | Lookup explains laptop requirement; manual and Log with unknown values remain usable | NOT TESTED |
| Log unknowns now, estimate later | Review one-piece default before saving; later compose same saved food and estimate; Change → Replace updates an old meal explicitly | NOT TESTED |
| Export and restore a backup after using an estimate | Ranges and source references survive alongside earlier records | NOT TESTED |


## M3a configured-provider follow-up (7 Nov 2026, Codex terminal)

These observations supersede the earlier missing-key status; earlier records are retained as history.

| Check | Observed | Result |
|---|---|---|
| Root environment | USDA, Groq, Tavily and HF variable names are configured; values not displayed | PASS (presence only) |
| Live USDA adapter | Four usable oats records parsed | PASS |
| Live preview database path | HTTP 200, sourceKind database, USDA source records | PASS |
| Original Groq model | Llama default unavailable to this account, HTTP 404; authenticated model list did not include it | FIXED |
| Corrected Groq model | openai/gpt-oss-20b available; default, local model setting and example updated; regression test first | PASS |
| Live preview AI path | nasi lemak / 1 piece returned HTTP 200, sourceKind ai_estimate, Groq AI source | PASS |
| Direct live Groq validation | Model proposal passed the strict nutrient/range/basis validator | PASS |
| Tavily / Hugging Face API | Tokens reserved for later work; no calls made | NOT TESTED |
| Physical phone | Startup and acceptance instructions provided to Yash | NOT TESTED |


## M3a UI and retrieval follow-up (7 Nov 2026, Codex browser/terminal)

| Check | Observed | Result |
|---|---|---|
| User screenshot: nasi lemak, blank portion | Empty nutrition was presented with Use estimate | REPRODUCED; fixed with service/browser regressions |
| Empty proposals and real zero | Empty proposals rejected; real zero remains valid | PASS (automated) |
| Tavily retrieval | Three public nutrition snippets returned for the reported dish | PASS (live) |
| Retrieval-assisted Groq | Five known nutrients plus cited sources; added sugar null | PASS (live) |
| Browser confirmation | Proposal unsaved until Use estimate; meal saved only after Save meal | PASS |
| Hugging Face hosted fallback | HTTP 402 | UNAVAILABLE (successful path tested with fictional transport) |
| 390 px estimate card | Use estimate ended at y=772 in an 844 px viewport, above the dock | PASS (viewport only) |
| 320 px Foods, Me, Gym | No horizontal overflow | PASS (viewport only) |
| 1440 px Today | Sidebar, wide diary and separate daily overview | PASS (viewport only) |
| Phone after this build | Yash must reload twice/close and reopen, preserving site data | NOT TESTED |

Retest on phone: confirm the new sidebar/dock style, compose an unknown dish → Review entry → Estimate nutrition, open Sources and assumptions, then Use estimate → Save meal. Check Edit/manual/unknown alternatives and offline reopen. A saved food is reused without a new lookup, so use an unsaved food or review its saved source details when testing retrieval.

Final automated checkpoint for this follow-up: 150 app tests, 15 coach tests, typecheck, hook tests and production build pass.

## Date follows the device clock (7 Nov 2026, Claude browser pane)

| Check | Observed | Result |
|---|---|---|
| Page open on today, clock moved past midnight, app regains focus | Header changed Sat 7 Nov → Sun 8 Nov without a reload; no stray "Today" button | PASS |
| Clock restored, focus again | Header returned to Sat 7 Nov | PASS |
| Older day picked on purpose | Stays on that day (unit test `followToday`) | PASS (automated) |
| First attempt | Date did not follow: the state updater read the ref after it had moved on. Fixed by reading it first | FOUND AND FIXED |
| Phone left open overnight | Should show the new day on return | NOT TESTED |

## Estimate accuracy and phone diagnosis (7 Nov 2026, Claude)

| Check | Observed | Result |
|---|---|---|
| Yash's phone: "nasi lemak", portion "2" | "Estimates need the laptop" (the request never reached the laptop) | Laptop path re-tested: proxy → service answered in 2.8 s. Likely cause: the 4173 server was restarting (new PID). Messages now name the cause |
| Same request on the laptop before fixes | 494 kcal, range 494–494, read as "2 cups (494 g)" | FOUND: false certainty and wrong portion |
| Live after fixes: nasi lemak "2" | 696 kcal (600–800); asked as one plate (~300 g) × 2 in code | PASS (plausible; published plates ≈ 400–650 kcal) |
| Live: nasi lemak "1 plate" | 500 kcal (480–520) on one run | Range narrower than real stall variation; prompt now asks for wider ranges for mixed dishes |
| Live: Weetabix "2" (before the per-serving change) | 136 kcal (130–140), 4.5 g protein | PASS (UK label: 68 kcal per biscuit) |
| Live: rolled oats 50 g (database path) | 188 kcal (187.5–191), 6.2 g protein, 3.5 g fat, 5 USDA records | PASS (USDA ≈ 379 kcal/100 g) |
| Later live calls | Groq HTTP 429 (free-tier rate limit from repeated testing) | Not a code fault; the service then returns 503 and the app says sources may be busy |
| Estimate card sources | Plain text ("USDA: ROLLED OATS"), 0 links | PASS (browser pane) |
| Automated | App tests, hook tests, 22 coach tests incl. zero-width range rejection and serving multiplication | PASS |
| Phone, after restarting the estimate service | Retry "nasi lemak" / "2" with both servers up | NOT TESTED |
