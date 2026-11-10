# Milestone 7 walkthrough: a food is a name

Open each file beside this page. Part 1 follows one photo through what changed in the app. Parts 2 to 5 are how the model was made. Part 6 is what it scored. Yash chose the direction: a transformer already trained on everything, fine-tuned on a very large food set, as one general model that regions can later build on. He approved the SigLIP2 and ISIA downloads. Claude wrote the code in his FIT3181 style and ran the training with his go-ahead, for him to cross-check.

## 1. One photo, on a model eight times the size

[PlatePhoto.tsx](../../apps/web/src/ui/components/meals/PlatePhoto.tsx) `handlePhoto` → [recogniseDish.ts](../../apps/web/src/vision/recogniseDish.ts) `recogniseDish` → [dishWorker.ts](../../apps/web/src/vision/dishWorker.ts) `readModel` → [service-worker.js](../../apps/web/src/sw/service-worker.js) `modelResponse`.

- `modelIsKept` asks whether any cache already holds the model. If none does, the card gives the download's real size, which `write_web_files` wrote into `labels.json` as `modelBytes`.
  - *Why warn first:* it is a large one-off download, and a person on mobile data should know before choosing a photo.
- `modelResponse` keeps the model the first time it is asked for, in its own cache named after a hash of the model.
  - *Why not precache it:* everyone would pay for it at install even if they never take a photo, and one failed fetch would stop the whole offline shell installing.
  - *Why a hash in the name:* an ordinary build must not fetch it again, and a new model must replace the old one.
- `readModel` fills one buffer of exactly `modelBytes`, reporting each whole percent.
  - *Why one buffer:* joining pieces would need twice the memory. It also means a model cut off part-way can never be loaded.
- `recogniseDish` restarts a three-minute countdown whenever the worker reports.
  - *Why:* only silence counts, so a long download can finish. If silence runs out the worker is dropped, so a late answer can never be shown beside a later photo.
- `UNSURE_BELOW` is 0.5, read from the table in part 6, not carried over from the first model.

Unchanged and still true: a pick only fills the entry box (invariant 4), and the photo goes only to this worker (invariant 5). The download goes one way, from the server to the phone.

## 2. Why a food is a name

[zero_shot.py](../../experiments/vision/vision/zero_shot.py) `name_vectors` → [global_model.py](../../experiments/vision/vision/global_model.py) `FoodMatcher`.

SigLIP2 was trained on web-scale captioned images. It has an image encoder and a text encoder that map into the same 768-dimensional space, so a photo and a sentence can be compared directly.

- `name_vectors` embeds each food name in three wordings, averages them, and returns unit vectors.
- `FoodMatcher` puts those vectors in an ordinary `nn.Linear` with no bias, multiplied by the model's own `logit_scale`. The output is one scaled cosine per name, so it behaves like any classifier.
  - *Why the head is not learned:* a new food is one more row, which is a line of text. No photos, no retraining. That is the whole idea, and it is why the phone knows 686 names: 473 dataset dishes and 213 hand-written foods from `vocabulary/basic_foods.txt`, such as nuts and fruit.
- Before any food training, SigLIP2 scored 88.15% top-1 on the first model's validation photos against its 109 names (`results/zero_shot.json`). The first model took eight epochs of training to reach 88.3%.

## 3. A very large food set

[isia.py](../../experiments/vision/vision/isia.py) fetches an even sample of ISIA Food-500 at a pinned revision. [prepare_global.py](../../experiments/vision/vision/prepare_global.py) joins it with Food-101 and the Malaysian set.

- The files are sorted by dish, in blocks of 100 photos, and `blocks_to_fetch` takes every fourth. *Why:* all 44 GB would take nearly five hours here, and a sample keeps every dish represented at a quarter of the cost.
- `global_names` makes a dish found in two datasets one class. The join has 183,701 photos and 473 dishes (`results/prepare_global.json`), of which 128,169 photos are for training.
- The fetch stopped at 93 of 131 files, so 69 of the 473 dishes have no training photo at all. The median dish has 180.
- `isia_splits` keeps any copy of a training photo out of the sealed set, by 64-bit fingerprint. It dropped 180.

## 4. LoRA on a shared vision model

[run_global.py](../../experiments/vision/vision/run_global.py) `lora` → `add_lora(..., train_head=False)` in [lora.py](../../experiments/vision/vision/lora.py) → the same `train_lora` loop as Milestone 6.

- Rank 16 on every linear layer in the 12 blocks trains 2.65 million of 95.9 million weights, which is 2.8%. The name vectors stay fixed.
  - *Why fixed:* LoRA should change how the model sees food, and leave the names alone, which is what keeps a general model general.
- Batch 64, three epochs, 48 minutes on the RTX 5060. Validation top-1 across 473 dishes went 79.3%, 81.0%, 81.6%, and the best epoch was the last (`results/global_lora.json`).
- `trained_matcher` merges the corrections into an ordinary ViT and then swaps in whichever names are wanted, which is all it takes to change what it can recognise.

Yash's regional plan fits this shape: a region is a small set of corrections and extra names on a shared base. Nothing here builds that yet.

## 5. Why 16 bits, and why it is 187 MB

[export.py](../../experiments/vision/vision/export.py) `halve_weights`. The first model's 8-bit copy worked. This one did not: on its first export it gave the full model's first guess on only 44.5% of 200 photos (`git show eb6d405:experiments/vision/results/global_export.json`).

The `shrink` stage measured why, on all 14,252 validation photos with all 686 names. Top-1 before shrinking was 79.7% (`results/global_shrink.json`).

| Stored as | Share of weights | Same first guess | Top-1 |
|---|---|---|---|
| **16-bit, every weight (shipped)** | 100% | **99.9%** | **79.7%** |
| 8-bit, blocks 6 to 11 only | 46% | 97.2% | 79.8% |
| 8-bit, attention only | 30% | 97.2% | 79.1% |
| 8-bit, blocks 0 to 5 only | 46% | 95.9% | 79.2% |
| 8-bit, feed-forward layers only | 61% | 95.7% | 79.6% |
| 8-bit per row, every weight | 100% | 88.2% | 74.1% |
| 8-bit, every weight | 100% | 82.0% | 71.1% |

- *Why 8-bit hurts here:* SigLIP2 tells hundreds of similar food names apart by very small differences in cosine, and rounding the weights moves those differences. A palette of 256 values, tried in a throwaway script, was worse still, at 72.9%.
- `halve_weights` stores each large weight as a 16-bit float, with a `Cast` node in front. *Why a Cast:* the runtime multiplies in 32 bits, so each weight is widened once when the model loads.
- `export` checks one photo from each of the 223 validation batches and refuses to install a copy that agrees less than 98% of the time. *Why:* a copy that answers differently is not the model that was tested. It agreed on all 223.

## 6. Results

The rule is in the `run_global.py` docstring and was committed before the sealed run (`9bd560f`, with the validation results): the model ships only if its top-1 on the first experiment's sealed photos, against those 109 names, is at least 89.3%. It scored 94.0%, so it shipped.

| | SigLIP2 alone | **With LoRA (shipped)** | First model |
|---|---|---|---|
| [First sealed photos](../../experiments/vision/results/global_final.json), 25,862, 109 names, top-1 / top-5 (second look) | 91.7% / 98.9% | **94.0% / 99.2%** | 91.3% / 98.5% |
| [Malaysian sealed photos](../../experiments/vision/results/global_malaysian.json), 1,278, 109 names, top-1 (further look) | not run | **92.4%** | 91.8% |
| Dishes only the Malaysian set has, 1,161 photos, top-1 (further look) | not run | **92.0%** | 91.6% |
| [Validation](../../experiments/vision/results/global_compare.json), 14,252 photos of trained dishes, 686 names, top-1 / top-5 | 62.7% / 86.0% | **79.7% / 94.7%** | |
| [ISIA test, never trained](../../experiments/vision/results/global_unseen.json), 13,056 photos, 95 dishes, 777 names, top-1 / top-5 | **49.8% / 80.9%** | 35.5% / 71.0% | |
| ISIA test, trained under that name, 1,143 photos, 5 dishes, 777 names, top-1 / top-5 | **50.0% / 85.7%** | 40.5% / 65.2% | |

Say these plainly:
- **Fine-tuning is a trade.** Among the phone's 686 names it added 17 points on dishes it trained on, and it took 14 away from dishes it never saw. It shipped because the rule said so and most plates are trained dishes. But "a new food needs no retraining" is weaker after fine-tuning than before it. CLIP-style models are known for this gap between trained and new classes (CoCoOp, CVPR 2022).
- 282 of the 686 names have no training photo: 69 dataset dishes and the 213 hand-written ones. They are on the costly side of that trade.
- The five dishes that did have training photos also fell, from 50.0% to 40.5%. That is few dishes, and the cause is untested.
- 94.0% is a second look at photos already scored, against only 109 names. The fair number for the phone's full list is 79.7%, on validation.
- Validation chose the best epoch, so 79.7% is slightly flattering.
- My bug wasted the first ISIA sealed run. Those numbers stay in `global_final.json`, and the unseen stage replaced them with nothing tuned in between.
- A single photo can do worse: one validation roti canai read 95% on the first model and came back "Not sure" here, because many similar Malaysian names now compete.
- Confidence is a rough guide. Re-saving a photo as JPEG, changing pixels by about 2 out of 255, moved sushi from 75% to 52%.

The unsure line comes from [`global_bands.json`](../../experiments/vision/results/global_bands.json), on validation with all 686 names:

| First guess's confidence | under 0.2 | 0.2 | 0.3 | 0.4 | **0.5** | 0.6 | 0.7 | 0.8 and over |
|---|---|---|---|---|---|---|---|---|
| Right | 26% | 38% | 52% | 63% | **75%** | 87% | 96% | 99% |
| Photos | 780 | 1,032 | 1,125 | 1,199 | 1,260 | 1,644 | 2,696 | 4,516 |

From 0.5 up the first guess is right at least about two times in three, so below that the card says it is not sure.

Section 7 measures that trade on dishes held out of training, and how to make it smaller.

## 7. Which way of fine-tuning, on dishes held out of training

[`run_holdout.py`](../../experiments/vision/vision/run_holdout.py) asks what a fine-tune costs a dish it never saw, on validation photos only. 67 dishes are kept out of training altogether, photos and name: the 8 only the Malaysian set has, and 59 chosen at random. Every version is then scored against all 686 phone names.

FIT3181 gave two ideas to test. LoRA is in the Week 10 lecture, and we already use it. `freeze_backbone_batchnorm`, from Assignment 1, stops a CNN's BatchNorm overwriting its pretrained running statistics. SigLIP2 has 0 BatchNorm layers (counted in the record), so there is nothing to freeze. The nearest thing is to let its 36,864 LayerNorm weights learn, which is why "LayerNorm only" and "LoRA and LayerNorm" are here.

The rule is in the docstring, written before the run and committed a minute into it (`be20d9d`), before any version had finished training: the next full training uses the fine-tuned version with the highest average of top-1 on trained and held-out dishes, and LoRA at full strength stays unless another beats it by at least one point. Malaysian dishes are reported but do not count, because eight dishes are too few to choose by.

| Top-1, 686 names | Trained dishes, 11,659 photos | Held-out dishes, 1,882 photos | Malaysian-only dishes, held out, 711 photos | Average of the first two |
|---|---|---|---|---|
| SigLIP2 alone | 63.7% | 63.3% | 45.0% | 63.50 |
| LoRA at full strength, today's method | 80.3% | 51.2% | 42.3% | 65.79 |
| LoRA at 0.75 | 79.3% | 59.5% | 43.3% | 69.42 |
| **LoRA at 0.5, chosen by the rule** | 75.3% | 63.6% | 43.9% | **69.45** |
| LoRA at 0.25 | 70.1% | 63.9% | 45.7% | 67.02 |
| LayerNorm only | 68.2% | 64.8% | 48.5% | 66.51 |
| LoRA and LayerNorm | 80.6% | 52.4% | 41.4% | 66.51 |
| Shipped model, for reference: it did train on these dishes | 79.7% | 81.0% | 77.2% | not a candidate |

Strength is how much of each low-rank correction is applied (`set_lora_strength`). It needs no retraining, and merging keeps whichever strength was set.

Say these plainly:
- **Turning LoRA down is what worked.** At 0.75 it gives up 1 point on trained dishes and gains 8.3 on dishes it never saw. At 0.5 it gives up 5 and gains 12.4, which brings them level with SigLIP2 alone.
- 0.5 won by 0.03 of a point over 0.75. That is a tie, however the rule reads it, and 0.75 keeps 4 more points on trained dishes.
- **The normalisation idea did not earn its place.** Adding LayerNorm to LoRA gained 0.7 of a point on the average, under the one-point bar. LayerNorm alone improved every group over SigLIP2 alone, but only by 4.5 points on trained dishes against LoRA's 16.6.
- The average weighs the two groups equally, which is a choice. A plate is more often a trained dish.
- The 59 random dishes come from the datasets, so they resemble the phone's 282 names with no photos but are not the same foods.
- Nothing here has reached the phone, and no sealed photo was read.

What photos of a local dish are worth, top-1 on the same validation photos:

| Dish | Name only, SigLIP2 alone | With its photos, shipped model |
|---|---|---|
| Satay | 83.7% | 91.9% |
| Roti canai | 69.0% | 94.0% |
| Kaya toast | 67.1% | 89.4% |
| Nasi lemak | 64.7% | 91.8% |
| Popiah | 50.0% | 81.7% |
| Laksa | 28.4% | 25.0% |
| Mixed rice | 4.7% | 83.7% |
| Fried noodles | 0.0% | 79.3% |

Across all eight, photos took top-1 from 45.0% to 77.2%. Fried noodles and mixed rice are generic names, and without photos they probably lose to specific ones on the list, so the five dishes with distinctive names are the fairer figure: 67.1% to 89.8%. Laksa's top-5 is 95.7%, so its first guess is probably curry laksa or asam laksa, which the phone also lists; that was not checked.

## 8. The full retrain, and why the phone keeps its model

[prepare_full.py](../../experiments/vision/vision/prepare_full.py) `new_positions`, `fresh_splits` → [run_full.py](../../experiments/vision/vision/run_full.py) `train`, `final`, `replaces_phone`.

Yash approved fetching the rest of ISIA and retraining at half strength, the strength section 7 picked.

- `new_positions` adds only photos the first join does not hold: 318,472 of them, for 503,633 in total (`results/prepare_full.json`).
  - *Why leave the first join alone:* the phone's model was trained from it, so its photos must keep their split.
- `fresh_splits` cuts two sealed sets nobody had looked at: one new photo in ten of the trained dishes (23,132), and the new photos from ISIA's test files, of dishes known only by name (69,504, after dropping 1,961 copies).
  - *Why by fingerprint:* a photo and its copies always fall on the same side.
- `train` is the same LoRA as part 4 on about three times the photos. Three epochs took 133 minutes, and validation top-1 went 72.9%, 75.7%, 76.0% (`results/global_full_lora.json`).
- `replaces_phone` is the rule, written in the docstring before any fresh photo was read. The new model at half strength replaces the phone's only if both hold:
  1. On the fresh sealed photos, its average top-1 over trained and never-trained dishes beats the phone model's.
  2. On the Malaysian validation photos, its top-1 is no more than 5 points below the phone model's.

Scored once ([`global_full_final.json`](../../experiments/vision/results/global_full_final.json)). **Rule 1 passed, rule 2 failed, so nothing was exported.**

| Top-1 | SigLIP2 alone | Phone's model | **New, half strength** | New, full strength |
|---|---|---|---|---|
| Fresh trained dishes, 23,132 photos, 686 names | 51.7% | 53.9% | **63.1%** | 71.2% |
| Fresh never-trained dishes, 65,043 photos, 777 names | 51.8% | 39.0% | **49.7%** | 35.4% |
| Average of the two (rule 1) | 51.7% | 46.4% | **56.4%** | 53.3% |
| Malaysian validation, 936 photos (rule 2) | 54.5% | 83.2% | **64.2%** | 78.1% |
| Test-file dishes trained under that name, 4,461 photos | 55.5% | 44.6% | **51.0%** | 20.4% |

Say these plainly:
- **The rule did its job.** The new model is 10 points better on world food and 19 points worse on what Yash actually eats. Without rule 2 it would have shipped.
- The 5-point margin came from section 7, where half strength cost trained dishes 5 points. On Malaysian photos it cost 14 (78.1% at full strength, 64.2% at half). Why Malaysian dishes lose so much more is untested.
- Full strength was never a candidate. It would have missed rule 2 as well, by a tenth of a point (78.1% against the 78.2% needed).
- The retrain's Malaysian score at full strength is itself 5 points under the phone model's. The Malaysian photos are a smaller share of a join three times the size, which may be why. That is a guess.
- The Malaysian check is on validation photos, which chose the phone model's best epoch, so the phone's 83.2% is slightly flattering.
- The phone's model scores 53.9% on fresh photos of dishes it trained on, against 79.7% on validation. The fresh photos are all ISIA's, and validation is mostly Food-101, so these are different mixes of dishes.
- Fine-tuning at full strength still costs unseen dishes: 35.4% against SigLIP2's 51.8%. Half strength brings them back to 49.7%, as section 7 predicted.
- Both fresh sealed sets are spent. A different strength, or a retrain that weights Malaysian photos more, needs photos nobody has scored.

## Bugs found

| Bug | How it was caught, and what covers it |
|---|---|
| The join crashed on the last short step of photos | The real run. `test_joins_a_photo_count_that_is_not_a_multiple_of_the_copy_step` |
| ISIA's test files number 100 different dishes from zero, so every test photo was graded against a wrong name | The first sealed run's 0.04%. `test_each_split_keeps_its_own_numbers` and the whole-join test. The rejoin changed no training or validation label, so the trained weights stayed valid |
| The 8-bit phone copy disagreed with the full model on most photos | The export's own check. `HalvingTests`, and `export` now refuses below 98% |
| After a timeout, a late answer could be shown beside a later photo | Reading the code while changing the countdown. `drops a silent worker, so a late answer cannot be taken for a later photo` |

## Verified

- `npm run check`: typecheck, web tests, hook tests, coach 148, router 33, vision 71.
- Real training on the RTX 5060: 48 minutes (`results/global_lora.json`).
- Held-out comparison: three more trainings of 29 to 45 minutes each, after rehearsing the whole path on a few hundred photos (`results/global_holdout.json`).
- `final` and `unseen` each ran once. Their refusal to run twice is by the same guard as Milestone 6.
- The full retrain (section 8): `npm run check` with 92 vision tests, 133 minutes of training on the RTX 5060, and `run_full final` once. `export` was not run, because the rule said no.
- The relabelled join: `dishes.json`, `splits` and `origins` identical, and zero training or validation labels changed (a throwaway comparison of the old and new arrays).
- The export: 373.8 MB becomes 187.2 MB, same first guess on 223 of 223 photos (`results/global_export.json`).
- Browser pane, localhost:4173, through the real file input and worker, with validation photos only (`docs/test-log.md`):
  - The warning, then the download counting up, then a kept model and no more warning.
  - 16-bit `Cast` runs in `onnxruntime-web/wasm`.
  - About 2 seconds per photo on one thread, against 290 ms for the first model.
  - Server stopped and page reloaded: same answer, from the cache.
  - Browser and desktop ONNX agree to within rounding on the same JPEG.
  - No horizontal overflow at 375 px, and a picked dish only fills the entry box.

## Not verified

- **Real plates through the phone camera, and everything else on the phone.** The download, how long the first load takes, the time per photo, and whether a phone has the memory for it.
- Whether almonds, now one of the names, is recognised.
- Whether a lower LoRA strength helps on real plates. The phone still runs the first fine-tune at full strength. Half strength of the retrain failed its sealed rule (section 8), and those sealed photos are now spent.
- Why half strength costs Malaysian dishes 14 points when it cost held-out comparison dishes 5.
- SigLIP2 alone on the Malaysian photos.
- Licences: ISIA, like the first two datasets, does not grant clear reuse rights, so decide before publicly hosting the model.
- Hosting: a 187 MB file is larger than many free static hosts allow per file, so it may need to be split or kept elsewhere.
