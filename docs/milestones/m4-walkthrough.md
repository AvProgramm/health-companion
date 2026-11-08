# Milestone 4: workout planner and intent router

Written 7–8 Nov 2026 by Claude Code. M4 had two halves in `docs/handoff/codex.md`: the workout planner (FIT3080) and the intent router (FIT3181). The planner half has its own walkthroughs, listed at the end. This one follows a message through the router.

## Status
| Item | Status | Where |
|---|---|---|
| Planner search, hard filters, oracle and greedy tests | Done | `m4-planner-walkthrough.md` |
| `compareCandidates` | Done by Yash; duration ranking later authorised by him | `m4-target-duration-walkthrough.md` |
| Repeated rounds (pigeonhole remainder search) | Done | `m4-repeated-rounds-walkthrough.md` |
| Exercise library, review sheet, ready-made days, allocation sweep | Done | `m4-exercise-search-walkthrough.md`, `m4-gym-fixes-walkthrough.md` |
| Router data, family split, baselines, frozen encoder | Done | `experiments/router/` |
| Router training code | Done; written by Claude at Yash's request on 8 Nov, **Yash cross-checks** | `experiments/router/router/train.py` |
| Sealed test and ship decision | Done; **does not ship** | `experiments/router/results/final.json` |
| Phone test of the M4 Gym features | **Not done (Yash)** | `docs/test-log.md` |

## One message through the router
Take a message like "ran 5 km in 30 min".

1. **It belongs to a family** ([data.py](../../experiments/router/router/data.py)). A family is one scenario with its variants. `assign_splits` puts whole families into train, validation or test, 12 / 3 / 3 per class, so a variant of a training scenario can't make the test look easy.
2. **It becomes a vector** ([encoder.py](../../experiments/router/router/encoder.py)). `load_encoder` freezes MiniLM, `encode` tokenises the message, and `sentence_vectors` averages its token vectors with the mask, so padding counts for nothing, then scales the result to length one. `cached_vectors` stores it under a hash of the text in a file named after the model revision, so vectors from different weights can never mix.
3. **The head learns from it** ([train.py](../../experiments/router/router/train.py)). `VectorDataset` pairs the vector with its label index. `IntentHead` is one `Linear(384, 6)`, 2,310 parameters. `train_model` takes one AdamW step per batch on `CrossEntropyLoss`, scores validation after each epoch, and keeps a deep copy of the best weights.
4. **It gets judged** ([metrics.py](../../experiments/router/router/metrics.py)). `macro_f1` averages over all six classes, so ignoring a rare class costs as much as getting a common one wrong. `choose_threshold` picks the lowest confidence that keeps accepted errors within 5% on validation. Below it the router abstains and the app would show the buttons, so a guess could never become a saved entry (invariant 4).
5. **The decision happens once** ([run.py](../../experiments/router/router/run.py)). `final` is the only code allowed to read the test families. The head had to beat both baselines on macro-F1 with no critical error, which means opening a logging form for a question or something out of scope.

## Result
| Sealed test (72 messages) | Macro-F1 | Accuracy | Coverage | Error among accepted | Critical errors |
|---|---|---|---|---|---|
| Keyword rules | 0.735 | 0.736 | 0.694 | 0.140 | 1 |
| TF-IDF + LR | 0.723 | 0.722 | 0.125 | 0.111 | 0 |
| MiniLM + `Linear(384, 6)` | 0.721 | 0.736 | 0.250 | 0.222 | 0 |

The head did not beat them, so the router does not ship and the app is unchanged. The gap is about one message in 72, so it's a tie rather than a clear loss. Because nothing was deployed, no message text goes anywhere new (invariant 5). The learning-rate choice, the failure analysis and a cross-check list for `train.py` are in [the router README](../../experiments/router/README.md).

## Bugs found on the way
- `macro_f1` only understood label names, so a training loop passing indices would have scored 0. It now accepts both (`test_metrics.py`).
- A toy training check gave validation different cluster centres from training, so nothing could learn it. A throwaway reference implementation exposed this (`test_train.py`).
- The plan's example learning rates underfit, with the best epoch at the 20-epoch cap. The grid was widened on validation only.

## Verified
- `npm run check`: typecheck, app and hook tests, 28 coach tests, 7 importer tests and 33 router tests.
- The real frozen encoder: no trainable parameter, 384 numbers of length one per message.
- `head` and `final` end to end on a stand-in split before the real run, including the once-only guard and the model-revision check (`test_run.py`).
- The sealed test ran once, after settings were committed at `a181128`.
- Browser pane, app → coach → USDA on 8 Nov: "250 ml milk" gave a Database estimate of ≈146.0 kcal (127.5–155.0). Added sugar correctly showed Unknown. Nothing was saved.

## Not verified
- The phone, for every M4 Gym feature: ready-made days, the review sheet, target duration and repeat rounds.
- Any deployed router behaviour, because it did not ship.

## Earlier M4 walkthroughs
`m4-planner-walkthrough.md`, `m4-exercise-search-walkthrough.md`, `m4-target-duration-walkthrough.md`, `m4-repeated-rounds-walkthrough.md` and `m4-gym-fixes-walkthrough.md`.
