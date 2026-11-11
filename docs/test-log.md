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

## Estimate card and app updates (7 Nov 2026, Claude)

| Check | Observed | Result |
|---|---|---|
| Yash's phone at 18:11: sources still links, only protein and fat | Phone was running an older cached build (the 17:57 build has no links) | Cause: cache-first shell kept the old build until a second reload |
| Fix: app checks for a new build when it returns to the foreground, and reloads once when the new build takes over (not on first install) | `src/sw/register.ts` | Needs one last manual reload on the phone to get this code; later builds switch automatically |
| Estimate card, rolled oats 50 g (browser pane) | Energy 188.2 kcal (187.5–191.0); protein, fat, saturated fat, total sugar, added sugar each shown with range; 0 links | PASS |
| Automated | UI test: every tracked nutrient listed, unknown says "Unknown", no links in sources | PASS |
| Phone after one reload | Card shows all nutrients, no links | NOT TESTED |

## Carbohydrate, fibre, sodium, unsaturated fat (7 Nov 2026, Claude)

| Check | Observed | Result |
|---|---|---|
| Live pipeline, rolled oats 50 g (USDA path) | carbs 33.8 g, fibre 5.2 g, unsat fat 2.5 g, sat fat 0.5 g, sodium 0.6 mg | PASS (USDA ≈ 68 g carbs, 10 g fibre per 100 g) |
| Estimate card against the older running service | New nutrients show "Unknown"; existing ones unchanged; 0 links | PASS (backward compatible) |
| Day summary with no values for a nutrient | "Carbohydrate: Unknown, 2 without a value" (was "0.0 g known + 2 unknown") | FOUND AND FIXED |
| Real zero next to an unknown item | "Added sugar 0.0 g, known + 1 unknown" | PASS (golden A) |
| Auto-update | Browser pane switched to each new build by itself (navigation type "reload") | PASS (browser pane) |
| Automated | App tests incl. missing-as-unknown, question parser for fibre/sodium/carbs/unsaturated fat; 25 coach tests incl. USDA IDs, OFF sodium g→mg, mono+poly sum | PASS |
| Phone, after restarting the estimate service | All ten nutrients on a new estimate | NOT TESTED |

## Phone: estimate with all nutrients (7 Nov 2026, 18:45, Yash's Samsung SM-S918B)

| Check | Observed | Result |
|---|---|---|
| USB link after re-approving "Allow USB debugging" | Estimate request reached the laptop | PASS |
| "nasi lemak chicken", "1 plate" | ≈ 1015 kcal (950–1080); protein 29 g; carbohydrate 87 g; fat 59 g; sodium 500 mg (400–600); fibre, sugars, saturated and unsaturated fat Unknown | PASS (all ten nutrients shown; unknowns say Unknown) |
| Energy consistency (4 × protein + 4 × carbohydrate + 9 × fat) | 995 kcal vs 1015 shown, within 2% | PASS |
| Plausibility | Energy and macros plausible for one plate with fried chicken; sodium likely low (sambal, anchovies and fried chicken usually give 1,000–2,000 mg); range narrow for a stall dish | NOTE |
| Phone build | New error wording appeared before the link was restored, then the newest card layout | PASS (self-update reached the phone) |

## M4 planner (7 Nov 2026, Claude, branch feat/planner)

| Check | Observed | Result |
|---|---|---|
| Search vs independent brute-force oracle, 12 kit scenarios | Identical session sets | PASS |
| Hard-rule violations across all scenarios | 0 | PASS |
| Kit counterexample (12 min; A 10 push pref 3, B 6 push, C 6 pull) | Greedy covers push only; search finds push + pull | PASS |
| compareCandidates / bestPlan spec tests | it.fails with the stub; all 6 flip with a correct reference implementation (then stub restored) | PASS (awaiting Yash's function) |
| Gym tab "Find a plan" with the stub | "compareCandidates is not written yet", no crash | PASS (browser pane) |
| 0 minutes | "There is no time for a session today. Rest is a valid choice." plus every exclusion reason | PASS (browser pane) |
| A real plan on screen, phone | Needs compareCandidates | NOT TESTED |


## M4 exercise search and Gym UI (7 Nov 2026, Codex)

| Check | Observed | Result |
|---|---|---|
| Automated check and production build | App/type/hook/coach/importer checks pass; separate dataset chunk emits and is precached | PASS |
| Migration from versions 1, 2, 3 | Meals preserved; version-3 workout/sleep snapshots unchanged; customCards store added | PASS (fake IndexedDB) |
| Backup/wipe/restore | Fictional choice preserved alongside diary; older backups get empty choices | PASS (unit test) |
| Operation retry, stale version, cap, invalid data | Replay/conflict/rollback and validation paths covered | PASS (unit test) |
| Confirmed choice -> planner -> reload | Added row appears in plan; choice survives reload | PASS (browser) |
| Preview server stopped | Cached reload, local Air Bike search/add, reload and plan work; remove returns pool to eight | PASS (browser, server unavailable) |
| 375 px / 1440 px | Phone one column and bottom dock, no horizontal overflow; laptop sidebar/two columns | PASS (browser widths) |
| Real phone upgrade and airplane-mode cold reopen | Follow walkthrough; old entries must remain before adding | NOT TESTED |

Preview was restarted after the server-unavailable test. No diary history was sent to any service. See `docs/milestones/m4-exercise-search-walkthrough.md` for limits and explain-back.


## Compact Gym session setup (7 Nov 2026, Codex)

- Yash reported the previous exercise feature works on his phone; screenshot shows the Gym planner. This does not establish the full migration/airplane-mode gate.
- Red first: the new compact-control and equipment-mode tests failed against the previous form. Five planner UI tests now pass with the full check and build.
- Browser at 375 px: shorter form, Without / With equipment, What to train retained, no horizontal overflow, bottom dock visible. Laptop layout retained at 1440 px.
- Browser: Without equipment produces a bodyweight plan; With equipment with no gear prompts for selection. Selecting resistance band yields band pull-apart + push-up, 11 of 20 min. Switching mode clears the previous plan.
- Physical phone check of the new controls: NOT TESTED. Reload twice and test both modes after confirming the existing diary is still present.


## Target-duration Gym sessions (7 Nov 2026, Codex)

- Red first: target-duration, cap, ranking, invalid-target and partial-session UI regressions fail against the old planner. Check and build pass after implementation.
- Independent exhaustive oracle: original twelve scenarios plus twelve ten-card scenarios with mixed preferences and hard filters. Exact 60/60, near 59/60, thirteen-card cap, 32-card state bound and stable input ordering are covered.
- Browser: starter-only bodyweight pool shows A partial session, 15/60, 45 min unfilled. With nine temporary five-minute choices confirmed through the normal UI, planner shows Your target is covered, 60/60, twelve unique exercises. Test choices removed; no workout logged.
- Browser widths 375/1440 px: full-target ring and cards render; phone-width content has no horizontal overflow. These temporary choices test arithmetic and UI, not a recommended training programme.
- Physical phone target-duration check: NOT TESTED. Reload twice, use 60 minutes with enough reviewed choices and available equipment; verify the target or a clearly labelled shortfall. Existing diary must remain intact.


## Repeated rounds (7 Nov, Codex)
Check and build pass. Browser: 31/31, 60/60 (four rounds), 90/90 and 241/241 from starter bodyweight choices; repetition off restores 15/60. Billion-minute input stays compact; ring display overlap reproduced and fixed with an exact-accessibility regression. Cached cold reload and 60/60 planning pass with preview stopped; preview restarted. Physical phone repeat-toggle and airplane-mode check: NOT TESTED. See docs/handoff/claude-code.md.


## Gym fixes and USDA liquids (7 Nov 2026, Claude Code)
- Red first for each fix: USDA per-100 mL and Foundation sugar, importer evidence (bar, pull-up, jumping, untracked kit, gym gear), fixed review facts, packs, area rule, even repeats. `npm run check` and the build pass.
- Live service code: "milk, 250 ml" now returns a USDA database estimate (146 kcal; every nutrient except added sugar, which stays Unknown) instead of falling through to the model.
- Browser (laptop and 375 px): fixed facts on the review sheet (dumbbell row: Pull, Dumbbells; Pullups: Pull-up bar, A pull-up); decline crunches blocked with a reason; ready-made days update on every choice; plan form: no kit push+pull 5 min no plan, 15 min push-up ×2, 60 min push-up ×10; dumbbells push+pull 60 min floor press ×3, row ×3, push-up ×2; no area chosen asks for one. No horizontal overflow at 375 px. No diary entry added.
- Physical phone check of packs and the new review sheet: NOT TESTED. Reload twice, open Gym, try Leg day at each difficulty, and confirm the diary is still there.


## USDA milk through the app, and the router (8 Nov 2026, Claude Code)
- Browser pane, with the coach service and preview started fresh: typed "250 ml milk", requested an estimate. Result: Database estimate, ≈146.0 kcal (127.5–155.0), source USDA, added sugar Unknown. POST /api/estimate returned 200. The draft was discarded, nothing was saved and no console errors appeared.
- Router sealed test, run once after settings were committed at a181128: head 0.721 macro-F1, keyword 0.735, TF-IDF 0.723. Does not ship. Record: experiments/router/results/final.json.
- Physical phone check of the M4 Gym features: NOT TESTED.


## M5 local profile and adaptations (8 Nov, Codex)
Check and build pass, including 120 coach and 33 router tests. Unit/fake-IDB: v4-to-v5 preservation, whole-diary backup round trip with a profile, retries/conflicts/collisions/concurrent writes/corrupt reads and 1,536 body-area/seated combinations. Throwaway seated-only mutant rejected, then restored. Trainer privacy and stale replies checked with mocked requests.

Browser: profile stays draft until confirmation, survives reload, excludes unknown/blocked movement facts and yields a seated arm-only plan under the synthetic seated/knee-avoidance profile. Existing three meals remain. Diabetes priorities keep Unknown apart from a real zero. At 375 px no horizontal overflow; laptop layout checked. Cached cold reload and the same seated plan pass with preview stopped; preview restarted. Test settings were cleared with a new confirmed version, no diary entry changed. Physical phone: NOT TESTED. Follow docs/milestones/m5-profile-walkthrough.md.

## Dish photo and M5 features (9 Nov 2026, Claude Code)

Laptop only so far: unit tests, the browser pane and real GPU training. Details are in the m5 and m6 walkthroughs.

**Phone checks still to run (NOT TESTED on the phone):**
1. Reload twice on the same localhost:4173 origin, and confirm the old diary is intact.
2. Today: take a photo of a real plate; note the top five, the time taken and whether the photo is the right way up.
3. Tap a dish; check only the entry box fills, then review, estimate and confirm.
4. Airplane mode: close and reopen, then read a photo again.
5. Gym: Ask the Trainer for 120 minutes with no kit (needs the laptop service).
6. Gym: search for something missing, add it as your own, plan with it, delete it.
7. Foods: ask the Nutritionist, use a suggestion as a draft, and confirm nothing saves by itself.
8. Me: ask the Coach a normal question, then a dosing question that must be refused.
9. Stop the laptop service: Trainer, Coach and Nutritionist must say so, and the diary must keep working.
10. Me: the profile checks from `docs/milestones/m5-profile-walkthrough.md`.

**Phone results so far (9 Nov 2026, SM-S918B, Android 16, Chrome 156.0.8078.79, connected with `adb reverse tcp:4173 tcp:4173`):**

| Check | Result | What was observed |
|---|---|---|
| 2. Photo of a real plate | PASS for capture; model limit | Yash photographed almonds in a steel bowl. Preview was the right way up. The card said "Not sure": Popiah 13%, Roti canai 12%, Nasi lemak 12%, Kaya toast 10%, Breakfast burrito 5%. Almonds are not one of the 109 trained dishes, so this is the model's limit, not a pipeline fault |
| Known photos on the phone | PASS | Validation photos sent through the real file input on the phone over DevTools: nasi lemak 81%, roti canai 95%, laksa 99%, about 560 to 780 ms each, matching the laptop browser |
| 1, 3 to 10 | NOT TESTED | |

## Global food model (9 Nov 2026, Claude Code)

Laptop only so far. The browser pane was hidden, so the times may read slightly high. Validation photos only, through the real file input and worker on localhost:4173.

| Check | Result | What was observed |
|---|---|---|
| Warning before the first photo | PASS | "The first photo downloads the food model once, 187 MB, and keeps it on this device." Gone after the first photo |
| First download | PASS | The button counted 0% to 99%, then "Looking at your plate…". 8.4 s in all over localhost. The model landed in its own `health-companion-model-` cache |
| 16-bit `Cast` in `onnxruntime-web/wasm` | PASS | The model loads and runs on one thread |
| Browser matches desktop ONNX on the same file | PASS | Sushi 52%, aloo gobi 44%, nasi lemak 62% in the browser; 51.9%, 43.8%, 62.2% on desktop from the same JPEG, so the phone's pixel pipeline is faithful. Scored from the stored pixels before the JPEG re-save, the same photos read 75.1%, 35.0%, 57.4%: a re-save changing pixels by about 2 out of 255 moved sushi by 23 points, so confidence is only a rough guide |
| Unsure message | PASS | Roti canai came back "Not sure": nasi lemak 9%, roti canai 7%, nasi dagang 5%. Aloo gobi at 44% is also unsure, correctly under the 0.5 line |
| Time per photo, model loaded | 1.9 to 2.0 s | One thread, laptop. The first model took about 290 ms |
| Fresh load from the cache | 3.1 to 3.3 s | Reading the model and one photo. No download label appeared |
| Offline | PASS | Server stopped, page reloaded from the service worker, model read from its cache, same answer (satay 80%) |
| Phone width, 375 px | PASS | No horizontal overflow. A picked dish filled the entry box with "aloo gobi 1 plate", waiting at Review entry |

**Phone checks for this model (NOT TESTED on the phone):** the warning; the download finishing; the time per photo and how long the first load takes; memory on a real phone; a real plate; almonds, which are now one of the names; airplane mode after the download.

### Global food model on the phone (10 Nov 2026, 11:00, Samsung SM-S918B, Chrome 156.0.8078.79)

Yash's own photos over USB (`adb reverse tcp:4173`). The top guesses below are taken from his screenshots.

| Photo | Result | Top guesses shown |
|---|---|---|
| Almonds in a steel bowl | PASS | "Which is it?": Almonds 72%, Payasam 3%, Almond biscuit 2%. An earlier, darker shot of the same bowl said "Not sure": Almonds 18%, Popiah 12% |
| Laddu (photo of a menu screen) | PASS | Laddu 91% |
| Mixed rice plate | PASS | Mixed rice 53%, Nasi campur 15% |
| Banana leaf meal | PASS, unsure | Banana leaf rice 29%, Nasi briyani 17%, Mixed rice 10% |
| Fried chicken, rice and a cola | Partial | Fried chicken 45%. It gave one dish only; the rice and the drink are not named |
| Rice bowl with egg, fish and pickles | FAIL | Bibimbap 20%, Chazuke 5%, Nasi lemak 4% |
| Kuih held in the hand | Unsure | Kuih lapis 28%, Carrot cake 14%, Kuih 9% |
| Paratha, dal and raita | FAIL | Roti canai 30%, Thosai 5%, Naan 4% |
| Paratha, chickpeas and curry | Partial | Roti canai 25%, Chickpeas 8%, Murtabak 6% |
| Milk carton label | FAIL | Protein shake 21%, Soy milk 17%, Energy drink 8% |
| Almonds → "almonds 1 plate" → lookup | PASS for the flow | The guess only filled the entry box. The draft was "Not saved yet", with an AI estimate of about 160 kcal (150–170) for one typical serving, from Tavily web and Groq |

**What Yash found:** one name per photo, so a plate with several foods gets only its largest dish; it cannot count items, such as the number of almonds; most confidences are low; and the names lean Malaysian. Not tested yet: the download time, the time per photo, the Nutritionist, the Coach, the Trainer, adding your own exercise, and airplane mode.

## Whichever model is available, and who answered (9 Nov 2026, Claude Code)

Laptop only, generic text only. For the hand-over checks Groq was given a fake key in that one process, so it really refused. The browser-pane checks used the laptop's real keys.

| Check | Result | What was observed |
|---|---|---|
| Hand-over between real providers | PASS | Groq answered 401, Gemini answered 200, 1.5 s in all. "nasi lemak, 2 plates" came back as 2 pieces, 1300 kcal (1000–1700), naming Gemini AI |
| The queue remembers a refusal | PASS | After that one 401, the Trainer, Nutritionist and Coach each went straight to Gemini, with no second request to Groq |
| Each reply names its model | PASS | `answeredBy: Gemini` on the Trainer (12 picks, 1.5 s), the Nutritionist (1 idea, 1.0 s) and the Coach (2 claims, 0.8 s) |
| Gemini leaving a nutrient unknown | Bug found, then fixed | 12 real estimates over 4 generic foods: 4 were thrown away, because Gemini left added sugar null and still wrote a range such as 0 to 5. After the fix, 11 of 12 were kept, with that nutrient still unknown. The one rejection was correct: the model misspelled a range key as `added_standard_g` |
| Label on the real cards | PASS | Browser pane, rebuilt app on localhost:4173, real service and real Groq. The Trainer, Nutritionist and Coach each showed "Answered by Groq" above the reply. The first two were clicked through; the Coach form was submitted by script in a background tab, because the pane was in use. No service errors |
| Phone | NOT TESTED | The phone needs the rebuilt preview to show the label and the 35-second wait |


## Photo-first flow and unified chat (10 Nov 2026, Codex)

Fresh production preview on localhost:4173 with the restarted real coach service. Browser pane only; no phone claim.

- Coach: "Hi" returned a friendly answer.
- Nutritionist: "Breakfast ideas with more fibre" returned two sourced ideas with "Use as draft" actions. Neither was saved.
- Trainer: "A 30 minute workout with no equipment" returned six 5-minute blocks, 30 of 30 minutes. Nothing was logged.
- Photo: selecting a generated blank JPEG immediately showed the AI action without running or downloading the local model. The explicit AI tap returned "No foods could be read" with the manual-entry fallback. This verifies the empty-image path, not recognition accuracy on a real plate.
- Automated: failing regressions first, then all checks and the production build passed. The photo card has 18 passing cases, including a late reply after replacing a photo. Coach 200, router 33, vision 92 and importer 9 also passed. The existing large-chunk build warning remains.
- Phone still needed: new photo flow, barcode on Today, all three chat routes, local fallback after download, and airplane mode.


### Remembered photo choice and counted portions (10 Nov, Codex)

The browser checkbox started off, was enabled explicitly, and remained enabled after a reload. Automatic dispatch, duplicate prevention and disabling were tested with fictional HTTP replies in unit tests; real photo accuracy remains a phone task. The user approved the remembered opt-in in this chat.

Failing parser-to-review tests reproduced "2 bowls of dal" becoming "1 bowl". Passing regressions now send "dal" / "2 bowl", "dal" / "0.5 bowl", "rice" / "2 cup", "almonds" / "12 piece", and "rice" / "150 g". A non-container food name, "bowl noodles", stays unchanged. No estimate was accepted or meal saved by these tests.

The request-order regression first observed two simultaneous calls; after the change the second waits, including when the first fails. Full npm check and production build passed. Physical phone and live multi-row estimate accuracy were not verified at this checkpoint.


### Live counted draft and responsive check (10 Nov, Codex)

Browser, real service, no diary entry saved: "2 bowls of dal" showed `dal` / `2 bowl` and received a range-labelled estimate automatically, with added sugar still Unknown. The draft was discarded. The request text and responsive review were checked at 393 by 852; the photo checkbox and barcode layout also fit that width. This is browser viewport testing, not a physical phone.

The check exposed a separate backend issue: counts were modelled as generic "1", losing bowl/cup semantics. Added failing service regressions and fixed that boundary afterwards. Full check passed with 203 coach tests; build passed with the existing large-chunk warning. No training or model downloads ran.


After restarting the coach with the new portion code, two generic live API requests (dal / "2 bowls" and dal / "2 cups") both returned Gemini estimates with count 2, known energy and a real range. This confirms the restarted request path responds; it does not validate serving weight or nutrient accuracy. No diary/profile data was included. The build preview and coach were left running on loopback for Yash's next check.


## Interview demo rehearsal (10 Nov 2026 evening, Codex)

Baseline: clean `feat/ai-trainer` at `1fef81b`. `npm run check` and `npm --prefix apps/web run build` passed. The existing large-chunk build warning remains. No application code changed for this checkpoint.

Laptop service: initial port 8000 check was unreachable and the preview proxy returned 502. Started this checkout's coach on loopback port 8000. GET `/api/firebase/config` then returned 200 directly and through localhost:4173, with all four web fields present. Only status/presence flags were printed; no credential files or values were displayed. This was an environment/startup issue, not a reproduced code defect.

Phone results below are for this rehearsal only. Update from Yash's report, one step at a time; previous device checks do not count as observing the current build.

| Step | Test | Result | Observation |
|---|---|---|---|
| 1 | `2 weetabix and 300 ml milk`, automatic estimates and explicit save | FAIL (estimate accuracy) | 11 Nov, physical phone over USB: draft showed both requested portions, sources, ranges and Not saved. Later totals are consistent with the two estimates, but the screenshot does not establish the exact saved meal count. Weetabix was estimated at 272 kcal for two pieces; the [UK Original label](https://weetabix.co.uk/our-products/original-classic/weetabix/) lists 136 kcal for two biscuits. Also observed: `200ml milk no wait 300ml` treated the trailing correction as part of the food name and estimated 200 mL. Both inputs now have regression tests. On the 2a4ad48 phone retest, the old saved estimate initially appeared. After clearing that row’s saved-food selection, Yash confirmed the fresh lookup worked. The inline correction regression passed in automated tests; its phone retest was not reported. |
| 2 | `actually 250 ml`, saved correction | PASS | Phone screenshot shows the existing 15:57 entry marked Edited, with milk at 250 mL (146 kcal) and the cereal still at two pieces. A separate 16:16 card is also visible; its origin cannot be established from this image. Phone undo PASS: the same meal returned to 300 mL and 175.2 kcal. The screenshot shows the restored amount; the History list itself was not shown. |
| 3 | Photo reader, counted foods into entry box and estimates | FAIL (recognition) | 11 Nov: initial offline message coincided with a missing USB forward. Restored it and verified phone-to-service health. The phone then showed a hosted list, with fish misidentified as chicken and cucumber listed separately from its salad. The preview showed the entry-box action; draft handoff and estimates were not observed. |
| 4 | Barcode on Today | NOT TESTED | Requires a packet; record NOT TESTED if unavailable. |
| 5 | Coach greeting/protein question, 30-minute session, opt-in week context | NOT TESTED | Keep week sharing off until the diary-provider choice is resolved; do not silently send diary lines through the current fallback queue. |
| 6 | Airplane-mode diary | NOT TESTED | Awaiting earlier steps. |
| 7 | Google sign-in on Me | NOT TESTED | Prior success was reported in the handover; this rehearsal has not been observed. |

Firestore sync, vector storage and the multi-food experiment are deferred until after Friday. Hosting follows Yash's licence choice; changing the diary-model route requires his provider choice. No working demo path was refactored.


### Independent laptop rehearsal while Yash was away (10 Nov, Codex)

Browser pane on localhost:4173 after the fresh build; real coach on port 8000. These observations do not change any physical-phone NOT TESTED result above.

| Check | Result | Scope and observation |
|---|---|---|
| Exact meal `2 weetabix and 300 ml milk` | PASS | Both requests started automatically. Weetabix showed an AI range/source, milk a USDA database range/source, both Not saved. Added sugar remained Unknown. Draft discarded; no food or meal accepted. This is a flow check, not verified serving/nutrition accuracy. Compare the Weetabix portion with the packet before the demo. |
| Greeting `Hi` | PASS | Coach replied in the browser. Diary sharing stayed off. |
| `How much protein is too much?` | PASS | A general answer appeared with the existing unchecked-information disclaimer. Its numerical/health claims were not independently validated; this result is not evidence of clinical accuracy. |
| `A 30 minute workout with no equipment` | PASS | Browser showed six five-minute blocks, 30 of 30 minutes, with no diary write. Profile adaptation cases remain covered by automated tests rather than this unrestricted browser profile. |
| Account card | PASS | Me showed the enabled Google sign-in button and explicit text that the diary has not been uploaded. No real sign-in attempted on Yash's behalf. |
| Cached shell reload | PASS | Verified and briefly stopped only this checkout's Vite preview process. Reloaded the browser at the same origin: Today and the existing week display still rendered. Restarted preview immediately afterwards. This does not simulate phone radio state, all offline edits or external-network failures. |
| Positive real plate, packet barcode, correction/save and physical phone | NOT TESTED | No new user phone observations or packet/photo supplied during this rehearsal. Existing automated coverage is separate. |
| Real diary context | NOT TESTED | Sharing remained off pending Yash's provider choice. No private diary lines were sent. |

`npm run check` and `npm --prefix apps/web run build` passed after preparing the walkthroughs. The existing chunk-size warning remains. Three explain-back documents and new AI attribution rows were prepared; no application path was refactored, no Firestore/vector work started, no sealed evaluation rerun and no model weight/photo download requested.


## MVP scope update (10 Nov, Codex)

Yash selected Vercel frontend/Render backend for tomorrow, removed the separate Me-page Google account card and deferred general multi-user login and a possible PostgreSQL migration. The old rehearsal step 7 (Google sign-in) is superseded: use Me profile/adaptations/backup for the current demo instead. Phone verification remains NOT TESTED.

Regression first: opening Me displayed "Connect with Google" and made a Firebase request. After removing the card and unused client authentication code, the new MeView regression passes: no Google prompt/request, backup still available. Full `npm run check` and production build passed. Uninstalling the unused Firebase web dependency reported zero web dependency vulnerabilities. Existing server-side config/account checks remain intact for future use; no authentication bypass or cloud upload was added.

Browser PASS: rebuilt preview, reloaded to update the cached shell, then opened Me. The page begins with local adaptations, with body/storage/backup/display below and no Google account card. No profile or diary data was changed. Physical-phone result remains NOT TESTED.

The single interview document is `docs/milestones/interview-walkthrough.md` (146 lines), covering all MVP features, source files, demo sequence, experimental limitations and tomorrow's hosting gates. Three separate M8 interview scripts were consolidated into it; older milestone histories remain as provenance. No deployment, database provisioning or licence/provider decision was made.


## Organisation checkpoint 1: API folder (10 Nov, Codex)

Rollback point suggested before work: 7d33b80, clean and pushed. Baseline check/build passed. Moved the existing request tests first; they failed because the new location had no implementation yet. Moved all eight API files into data/api and adjusted relative imports only. Mechanical comparison against Git confirms identical contents apart from domain import paths. Post-move full check/build passed, including existing UI request/privacy and queue cases. No endpoint, payload, timeout, model route or saving behaviour changed. Phone NOT TESTED for this organisation-only change. Rules are saved in CLAUDE.md; storage is a separate next folder.


## Organisation checkpoint 2: local storage (10 Nov, Codex)

Started from pushed db60917. Moved the existing connection/migration test first; it failed at the new location until the implementation moved. Relocated all 17 storage files into data/storage and retargeted imports. Mechanical comparison against Git confirms no changes beyond module paths; every moved file is under 300 lines. Full check/build passed, including original revision, operation-key, rollback, schema-upgrade and backup tests. Database name, DB_VERSION, stores, indexes and schema steps are unchanged: this is a source-folder move, not a diary data migration. Phone NOT TESTED. Updated the rule/checklist file paths so future agents find the existing code.


## Organisation checkpoint 3: diary loader (10 Nov, Codex)

Started from pushed 900d3c6. Moved the existing plain loadWeekLines helper from ui/hooks into data/diary/loadWeek.ts and changed only storage import paths plus the AiView caller. Mechanical comparison confirms unchanged function contents; the sharing switch and model route are untouched. Full check/build passed again. All relocated API, storage, loader and test files are under 300 lines.

Final browser smoke check after rebuilding/reloading: Me still showed the existing three meals and three saved foods, and the week display retained its existing entries. This confirms visibility of the existing local store, not a complete data-integrity audit. The AI screen opened with sharing off. No saved data, account settings or limitations were edited. Phone checks remain NOT TESTED.

Browser chat smoke PASS after all three moves: submitted only `Hi` with sharing off and received the Coach greeting. No diary/profile lines were uploaded. Screenshot saved outside the repo. This verifies the relocated request path; it does not substitute for the outstanding phone rehearsal.


## Final pre-hosting retest (10 Nov, Codex; source 1513e4e)

Working tree was clean at the start. `npm run check` passed (web/type/hook checks, 214 coach tests, importer 9, router 33, vision 92) and the production build passed with the existing large-chunk warning. No application changes were needed. Tests used fictional records only; no training, sealed evaluation, real-diary sharing or new cloud feature was run.

### Live service/proxy

| Check | Result | Evidence |
|---|---|---|
| Firebase public config through preview | PASS | 200, all four fields present; values were not printed. |
| Account with no token | PASS | 401. |
| Estimate request with an extra diary field | PASS | 422. |
| Dosing question | PASS | 200 with refused mode. |
| Malformed barcode | PASS | 422. |
| Public product barcode 3017620422003 | PASS | 200 with product found; package nutrition accuracy was not independently established. |
| Generated blank JPEG | PASS | 200 with nothing mode and zero foods. No personal photo uploaded. |
| Generic no-equipment Trainer request | PASS | 200, AI proposal with 11 library IDs. This API check is not a completed workout. |
| Generic higher-fibre breakfast request | PASS | 200 with two Nutritionist suggestions. |

### Integrated browser tests on isolated 127.0.0.1:4173

This origin initially showed first-run setup and no foods. It is separate from the user's localhost diary. Created only fictional profile/label/log records for this test; did not inspect or modify the user's real diary. Browser capture controls became unreliable in the small in-app pane; accessible-element actions completed the same tests. Those tool-control issues were not treated as app defects.

| Check | Result | Evidence |
|---|---|---|
| First run/manual food | PASS | Fictional 170 cm/70 kg profile; Fictional milk label, 60 kcal and 3 g protein per 100 mL; other nutrients blank. |
| Parse and review 250 ml Fictional milk | PASS | Unsaved draft showed 150 kcal and 7.5 g protein; day still empty before confirmation. |
| Confirm meal and unknown handling | PASS | One meal, 150 kcal/7.5 g protein; missing nutrients remained Unknown. |
| actually 200 ml | PASS | Preview 120 kcal/6 g protein; confirmed revision 2 retained revision 1. |
| Undo | PASS | Restored 250 mL/150 kcal as revision 3; both earlier revisions remained in history. |
| Overnight sleep | PASS | `slept 11 pm to 7 am` previewed 8 h in bed. Explicit 7.5 h actual sleep saved as 7 h 30 min, separately from time in bed. |
| Workout log | PASS | `run 30 min 5 km` previewed and saved only after confirmation. Reload retained meal, workout and sleep. |
| Weekly overview | PASS | Displayed 150 kcal, one training session and 7.5 h on the test date; other dates remained gaps. |
| 60-minute plan with repetitions | PASS | 60/60, with 4 full rounds; displayed coverage 3/4 rather than pretending every area was covered. |
| Same target without repetitions | PASS | 15/60, partial session, explicit 45-minute shortfall. |
| Exercise search/add/remove | PASS | Found Pushups locally, reviewed before adding, showed 1/24 after reload; removal returned through the existing versioned choice path. |
| Backup download | PASS | UI reported download; inspected only the known fictional export: 1 food, 1 meal, 3 meal revisions, 1 workout, 1 sleep, added sugar still unknown. |
| Cached reload with preview stopped | PASS | Stopped only the verified app preview; same-origin reload still displayed saved fictional meal/workout/sleep and weekly values. Preview restarted immediately afterwards. This is not a physical-phone radio-state test. |

### Limits and remaining phone gate

Positive real-plate recognition/camera controls, the packet barcode UI, actual phone airplane mode, and phone backup permissions remain NOT TESTED in this pass. Restore/erase, conflicts/replays and adaptation combinations are covered by automated tests; destructive real-diary restore/erase was not attempted in the browser. No assertion of independent clinical/nutrient accuracy is made. Real diary sharing remains off until Yash chooses its permitted provider. Phone results must be reported separately as PASS/FAIL/NOT TESTED.

Before hosting: phone reload twice at the usual origin, download a backup, then test meal/correction/history, photo and barcode, Gym search/60-minute repeat setting, AI without diary sharing, sleep/workout persistence, and cold reopening after disconnecting USB and enabling airplane mode. Check Me has no Google card and number hiding works. Keep licence and diary-provider decisions separate from functional test results.


## Confirmed Free Tier privacy gate (10 Nov, Codex)

Yash selected Gemini subject to terms/tier review, then confirmed Free Tier and explicitly kept diary sharing off. New tests first failed for the enabled switch, unblocked client request and server accepting context. After the change: disabled UI, no diary loader/fetch on that path, and server 403 before a model. Existing pure summary/retrieval/safety tests remain; ordinary chat requests are unchanged. Full check (215 coach tests) and production build passed. No personal diary was sent and no billing/account setting changed. Latest hosting preparation and runtime checks: [10 Nov report](testing/2026-11-10-hosting-preparation.md).
