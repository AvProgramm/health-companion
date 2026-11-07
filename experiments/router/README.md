# Intent router (M4, FIT3181)

A small classifier that reads one diary message and says which form it belongs to: **meal, correction, workout, sleep, daily_summary or other**. It may only *preselect* the Meal / Gym / Sleep chip when the grammar parser can't classify the message. It never saves anything, never estimates nutrition and never interprets health.

It ships only if it beats the baselines on the sealed test split, with no critical error. Until then the app's grammar and keyword behaviour stay as they are.

## The data (`data/`)
- `families.json` holds 108 original, fictional **families**: 6 classes × 18 scenarios × 4 variants, written by Claude Code. Variants add typos, units, local food terms (nasi lemak, teh tarik, roti canai) and negation inside their own family. Messages about two things ("ran 5k then had nasi lemak") are `other`, because the app should ask rather than guess.
- `split_manifest.json` assigns whole families before any variant is used: **12 train / 3 validation / 3 test per class**, shuffled with Yash's seed 34871500. A test checks that the committed file still matches the seed.
- **The test split is sealed.** `load_split('test')` raises unless `final=True`, which only `run final` passes, once.
- One author wrote every split. Held-out families reduce that bias but don't remove it. The data is English only, so it says nothing about other languages.

## The pipeline
| Step | File | Who |
|---|---|---|
| Families, seeded family split, sealed test | `router/data.py` | Claude |
| Majority, keyword rules, TF-IDF + logistic regression (C chosen on validation) | `router/baselines.py` | Claude |
| Macro-F1 over all six classes, coverage, error among accepted, critical errors, threshold | `router/metrics.py` | Claude |
| Frozen MiniLM, masked mean pooling, L2 normalisation, vector cache per model revision | `router/encoder.py` | Claude |
| `VectorDataset`, `IntentHead.forward`, `train_model`, `score`, `confusion_matrix` | `router/train.py` | **Yash** |
| `seed_all`, the `Linear(384, 6)` layer, the checkpoint record | `router/train.py` | Claude |
| baselines → embed → head → final | `router/run.py` | Claude |

**A critical error** is an accepted prediction that opens a logging form (meal, workout, sleep or correction) for a question or something out of scope (daily_summary, other).

## Tensor shapes (the exercise)
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

Before writing code, check you can answer these:
- Why does `mean_pool` multiply by the mask before summing?
- Why does the loss take raw logits, not softmax output?
- Which tensor carries `requires_grad=True` in your loop?

## Your task (Yash)
In `router/train.py`, replace each `NotImplementedError('YASH: …')`:
1. `VectorDataset`: store the vectors and label indices, and return one `(vector, label)` pair.
2. `IntentHead.forward`: return the logits.
3. `train_model`:
   - Set up `CrossEntropyLoss` and `AdamW(lr=learning_rate)`.
   - In each epoch, call `train()`, then for every batch: `zero_grad`, forward, loss, `backward`, `step`.
   - After each epoch, `score()` the validation loader and compute `macro_f1`.
   - Keep a deep copy of the best `state_dict`, stop early, and never go past 20 epochs.
   - Return `{'state_dict': ..., 'history': [...]}`.
4. `score`: run under `eval()` and `no_grad()`, apply softmax, and return `(probabilities [N, 6], labels [N])`.
5. `confusion_matrix`: rows are the true label, columns the predicted one.

`tests/test_train.py` has one `expectedFailure` test for each part. When a test reports "unexpected success", remove its decorator. All five were checked against a throwaway reference implementation, which was deleted, so they can pass.

## Running it
```bash
cd experiments/router
.venv/Scripts/python.exe -m unittest discover -s tests   # also part of npm run check
.venv/Scripts/python.exe -m router.run baselines          # validation only
.venv/Scripts/python.exe -m router.run embed              # needs the pinned MiniLM download
.venv/Scripts/python.exe -m router.run head               # needs your train.py
.venv/Scripts/python.exe -m router.run final              # once, after settings are frozen
```

**Environment:** `.venv` was created with `fit3181`'s Python 3.11 using `--system-site-packages`. It reuses torch 2.13 (CUDA 13, RTX 5060 detected), transformers and scikit-learn read-only, and installs nothing into `fit3181`. Exact versions are in `requirements-lock.txt`.

**Model:** `sentence-transformers/all-MiniLM-L6-v2` (Apache-2.0), pinned to commit `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. Downloaded on 7 Nov with Yash's approval: 6 files, 91.6 MB, into the Hugging Face cache outside Git. `run embed` cached all 360 train and validation vectors on the RTX 5060 in 8.0 s. Sanity check: "ate two fried eggs" scores cosine 0.785 against "had 2 eggs for breakfast", 0.335 against "slept eight hours" and 0.286 against "how much protein today?".

## Results so far (written by `run baselines` to `results/validation-baselines.json`)
These are validation numbers on 72 messages. C and the threshold were chosen on this same split, so they're optimistic; the sealed test run is the fair one.

| Baseline | Macro-F1 | Accuracy | Coverage | Error among accepted | Critical errors |
|---|---|---|---|---|---|
| Majority ("meal") | 0.048 | 0.167 | 1.000 | 0.833 | 24 |
| Keyword rules | 0.771 | 0.764 | 0.653 | 0.085 | 0 |
| TF-IDF + LR (C = 1, threshold 0.65) | 0.750 | 0.764 | 0.111 | 0.000 | 0 |

There are no head results yet. The vectors are cached; the head needs your training loop.
