# M4 status, and the intent router (FIT3181)

7 Nov 2026, Claude Code. Yash asked whether Milestone 4 was complete and to finish what remained. M4 had two halves in `docs/handoff/codex.md`: the workout planner (FIT3080) and the intent router (FIT3181).

## M4 checklist
| Item | Status | Where |
|---|---|---|
| Planner search, hard filters, oracle and greedy tests | Done | `m4-planner-walkthrough.md` |
| `compareCandidates` (Yash) | Done; the duration ranking was later authorised by Yash | `m4-target-duration-walkthrough.md` |
| Exercise library, review sheet, ready-made days, allocation sweep | Done | `m4-exercise-search-walkthrough.md`, `m4-gym-fixes-walkthrough.md` |
| Router data: 6 classes × 18 families, family split 12 / 3 / 3, sealed test | Done | `experiments/router/data/` |
| Router baselines: majority, keyword, TF-IDF + LR | Done; validation results recorded | `experiments/router/results/` |
| Frozen MiniLM encoder: masked mean pooling, L2 normalisation, revision cache | Code and tests done; the weights still need downloading | `experiments/router/router/encoder.py` |
| Router Dataset, forward, training loop, scoring, confusion matrix | **Yash's task**; stubs with 5 expectedFailure tests | `experiments/router/router/train.py` |
| Final sealed test run and ship decision | After Yash's loop | `python -m router.run final` |
| Phone gate for the M4 Gym features | **Yash's task** | `docs/test-log.md` |

## How the router is judged
- **Six classes:** meal, correction, workout, sleep, daily_summary and other. A message about two things is `other`, because the app should ask.
- **Splits by family, not by message.** A family is one scenario with its variants (typos, units, local food words, negation). A variant of a training scenario can never be used to test it.
- **Macro-F1 over all six classes,** so ignoring a rare class costs as much as getting a common one wrong.
- **Confidence threshold, chosen on validation.** It's the lowest one whose accepted errors stay at or under 5%. Below it the router abstains and the app shows the buttons. Coverage is the share it accepts.
- **Critical error:** opening a logging form for a question or an out-of-scope message. Shipping needs zero.
- **Ship rule:** the head must beat both the keyword rules and TF-IDF on the sealed test macro-F1, run once.

## Validation baselines (real numbers, from `results/validation-baselines.json`)
| Baseline | Macro-F1 | Coverage | Error among accepted |
|---|---|---|---|
| Majority | 0.048 | 1.000 | 0.833 |
| Keyword rules | 0.771 | 0.653 | 0.085 |
| TF-IDF + LR | 0.750 | 0.111 | 0.000 |

The keyword rules are currently the bar to beat. TF-IDF is rarely confident enough to accept a message with this little data. That gap is where a pretrained sentence encoder might help, and the sealed test will say whether it does.

## Verified
- `npm run check` now ends with the router tests. In the router environment that's 28 tests: 22 pass, 5 are Yash's expected failures, and 1 is skipped until the model is downloaded. In CI only the plain-Python data and keyword tests run.
- Yash's five tests were run against a temporary reference implementation, which was then deleted. All five pass with correct code, so they can be passed.
- One test bug was found and fixed this way: the toy validation clusters had different centres from the training ones.

## Explain-back questions
- Why split by family rather than by message, and what would leak if you didn't?
- Why is the threshold chosen on validation, and the test split read only once?
- Why can a model with higher accuracy still be refused?
