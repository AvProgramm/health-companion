# Intent router (M4, FIT3181)

A small classifier that reads one diary message and says which form it belongs to: **meal, correction, workout, sleep, daily_summary or other**. It could only ever *preselect* the Meal / Gym / Sleep chip when the grammar parser can't classify a message. It never saves anything, never estimates nutrition and never interprets health.

## Result (8 Nov 2026): the router does not ship
The sealed test (72 messages) was run once. Settings were frozen and committed first (`a181128`), and `run final` refuses to run again. The record is `results/final.json`.

| Model | Macro-F1 | Accuracy | Coverage | Error among accepted | Critical errors |
|---|---|---|---|---|---|
| Keyword rules | 0.735 | 0.736 | 0.694 | 0.140 | 1 |
| TF-IDF + logistic regression | 0.723 | 0.722 | 0.125 | 0.111 | 0 |
| MiniLM + `Linear(384, 6)` | 0.721 | 0.736 | 0.250 | 0.222 | 0 |

The ship rule needs the head to beat both baselines on macro-F1 with no critical error. It had no critical errors, but 0.721 is below 0.735 and 0.723, so the app keeps its grammar and buttons. One message is worth about 0.014 of accuracy here, so all three are within about a message of each other. This is a tie rather than a clear loss, and 72 messages can't separate them.

**Where the head goes wrong** (confusion matrix in `results/final.json`):
- `other` is its weakest class, with recall 0.33: of 12 messages, 4 were read as meal, 2 as correction and 2 as daily summary. `other` is a mixed bag (greetings, weather, two things in one message), so one linear layer probably has no single direction to find.
- Corrections about sleep look like sleep: 4 of 12 corrections were read as sleep. Correction recall is 0.58, against 0.75 for the keyword rules.
- The threshold didn't carry over. Validation accepted only 9 messages, all correct, so the 5% error limit was poorly measured. On test it accepted 18 and got 4 wrong.

**Limits:** one author wrote every split, the data is English only, and 288 training messages is small. More training families is the first thing to try if this is revisited.

## The pipeline
| Step | File | Written by |
|---|---|---|
| Families, seeded family split, sealed test | `router/data.py` | Claude |
| Majority, keyword rules, TF-IDF + logistic regression | `router/baselines.py` | Claude |
| Macro-F1 over all six classes, coverage, critical errors, threshold | `router/metrics.py` | Claude |
| Frozen MiniLM, masked mean pooling, L2 normalisation, vector cache | `router/encoder.py` | Claude |
| `VectorDataset`, `IntentHead`, `train_model`, `score`, `confusion_matrix` | `router/train.py` | Claude, at Yash's request on 8 Nov, in his FIT3181 style. **Yash cross-checks.** |
| baselines → embed → head → final | `router/run.py` | Claude |

**A critical error** is an accepted prediction that opens a logging form (meal, workout, sleep or correction) for a question or something out of scope (daily_summary, other).

## What to cross-check in `router/train.py` (Yash)
1. **`VectorDataset`:** vectors are `float32` and labels are `long`, because `CrossEntropyLoss` needs class indices as long integers.
2. **`IntentHead.forward`:** returns raw logits with no softmax, because `CrossEntropyLoss` applies log-softmax itself.
3. **`train_model`:**
   - The order inside the batch loop is `zero_grad`, forward, loss, `backward`, `step`.
   - The epoch loss is weighted by batch size, so a short last batch can't skew it. That's the old `BaseTrainer.evaluate` bug avoided.
   - The best weights are a `copy.deepcopy`, because the live `state_dict` keeps changing. It stops 5 epochs after the best one and never passes 20.
4. **`score`:** uses both `eval()` and `no_grad()`. `eval()` switches off training-only behaviour, and `no_grad()` stops PyTorch recording gradients.
5. **`confusion_matrix`:** rows are the true label, columns the predicted one.

`tests/test_train.py` checks each of these, including that the best epoch's weights come back rather than the last.

## Tensor shapes
For a batch of B messages padded to T tokens:

```
input_ids, attention_mask    [B, T]           tokenizer, padding=True
last_hidden_state            [B, T, 384]      frozen MiniLM, eval() + no_grad()
mean_pool                    [B, 384]         sum(hidden * mask) / sum(mask): padding left out
sentence vector              [B, 384]         L2-normalised, cached once per model revision
IntentHead.forward           [B, 6]           raw logits (Linear(384, 6): 6 x 384 + 6 = 2,310 parameters)
CrossEntropyLoss(logits, y)  scalar           y is [B] label indices in LABELS order
softmax(logits)              [B, 6]           only in score(), each row sums to one
```

The mask is multiplied in before summing so padding tokens add nothing to the average. Only the head's 2,310 parameters have `requires_grad=True`; the encoder never sees an optimiser.

## The data (`data/`)
- `families.json` holds 108 original, fictional **families**: 6 classes × 18 scenarios × 4 variants, written by Claude Code. Variants add typos, units, local food terms (nasi lemak, teh tarik, roti canai) and negation inside their own family. Messages about two things ("ran 5k then had nasi lemak") are `other`, because the app should ask rather than guess.
- `split_manifest.json` assigns whole families before any variant is used: **12 train / 3 validation / 3 test per class**, shuffled with Yash's seed 34871500. A test checks that the committed file still matches the seed.
- **The test split is sealed.** `load_split('test')` raises unless `final=True`, which only `run final` passes.

## Choosing settings on validation
Validation only (72 messages), written by the runner to `results/`. C, the learning rate and the thresholds were chosen on this same split, so these numbers are optimistic.

| Learning rate | Macro-F1 | Best epoch / epochs run |
|---|---|---|
| 0.001 | 0.580 | 14 / 19 |
| 0.003 | 0.616 | 20 / 20 |
| **0.01** (chosen) | 0.648 | 8 / 13 |
| 0.03 | 0.642 | 5 / 10 |
| 0.1 | 0.603 | 2 / 7 |

The plan's example rates were 0.001 and 0.003. They underfit: the best epoch at 0.003 was the 20-epoch cap, with loss still falling. So the grid was widened upward until the best rate sat inside it. The test split stayed sealed throughout.

| Model on validation | Macro-F1 | Accuracy | Coverage | Error among accepted | Critical errors |
|---|---|---|---|---|---|
| Majority ("meal") | 0.048 | 0.167 | 1.000 | 0.833 | 24 |
| Keyword rules | 0.771 | 0.764 | 0.653 | 0.085 | 0 |
| TF-IDF + LR (C = 1, threshold 0.65) | 0.750 | 0.764 | 0.111 | 0.000 | 0 |
| Head (lr 0.01, threshold 0.65) | 0.648 | 0.681 | 0.125 | 0.000 | 0 |

## Running it
```bash
cd experiments/router
.venv/Scripts/python.exe -m unittest discover -s tests   # also part of npm run check
.venv/Scripts/python.exe -m router.run baselines          # validation only
.venv/Scripts/python.exe -m router.run embed              # caches train and validation vectors
.venv/Scripts/python.exe -m router.run head               # trains at each learning rate
```

`run final` has already happened and won't run a second time.

**Environment:** `.venv` was created with `fit3181`'s Python 3.11 using `--system-site-packages`. It reuses torch 2.13 (CUDA 13, RTX 5060 detected), transformers and scikit-learn read-only, and installs nothing into `fit3181`. Exact versions are in `requirements-lock.txt`.

**Model:** `sentence-transformers/all-MiniLM-L6-v2` (Apache-2.0), pinned to commit `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. Downloaded on 7 Nov with Yash's approval: 6 files, 91.6 MB, into the Hugging Face cache outside Git.
