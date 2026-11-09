# Milestone 6 walkthrough: a photo of your plate

Open each file beside this page. Part 1 follows one photo through the app. Part 2 is how the model was made. Yash chose the direction, a ViT fine-tuned with LoRA on his RTX 5060. Claude wrote the code in his FIT3181 style and ran the training with his go-ahead, for him to cross-check.

## 1. One photo, from the screen to a draft

[PlatePhoto.tsx](../../apps/web/src/ui/PlatePhoto.tsx) `handlePhoto` → [recogniseDish.ts](../../apps/web/src/vision/recogniseDish.ts) `recogniseDish` → [dishWorker.ts](../../apps/web/src/vision/dishWorker.ts) `preparePhoto`.

- *Why a worker:* the model takes a moment, and the screen must not freeze while it runs.
- *Why on the device:* invariant 5. The photo goes only to this worker, and nothing about it is uploaded.

[dishModel.ts](../../apps/web/src/domain/dish/dishModel.ts) holds the parts that must match training exactly:
- `photoPlacement` repeats the Python crop: short side to 256, centre square, then the centre 224.
- `pixelsToTensor` puts channels first, then scales and normalises with the model's mean and std.
- `topGuesses` turns raw scores into five dishes with probabilities.

*Why these are separate pure functions:* if the phone's crop drifts from training, accuracy falls with no error shown, so each is tested against values worked out by hand.

The card shows five chips, and says it is unsure when the first guess is under 40%. Tapping a chip calls `onPick`, and [TodayView.tsx](../../apps/web/src/ui/TodayView.tsx) fills the entry box with "nasi lemak 1 plate".
- *Why only fill the box:* invariant 4. The normal review, estimate and confirmation still decide what is saved, and only that text goes to the estimate.
- *Why it hides without a model:* `loadDishFacts` returns null, so a build with no model simply has no card.

## 2. How the model was made

**Data.** [download.py](../../experiments/vision/vision/download.py) fetches pinned revisions. [prepare.py](../../experiments/vision/vision/prepare.py) decodes all 112,000 photos once into one memory-mapped array, so training never waits on JPEG decoding, and stores them outside OneDrive.
- `merged_labels` makes one class per dish name, giving 109: Food-101 plus 8 Malaysian-only dishes.
- `assign_splits` removes any sealed photo whose 64-bit fingerprint matches a training photo. It dropped 1,038, including 372 of the 1,650 Malaysian test photos. Without this check the Malaysian score would have been inflated by copies.

**Baseline.** [train.py](../../experiments/vision/vision/train.py) `extract_features` and `fit_head` train only a new head on each frozen backbone. DINOv2-small beat AugReg on validation (84.7% against 82.0%), so it was used from then on.

**LoRA.** [lora.py](../../experiments/vision/vision/lora.py) `LoRALinear` keeps each frozen layer `W` and learns two thin matrices, so the layer computes `(W + (alpha / rank) U D) x`.
- `U` starts at zero, so the model starts exactly as it was, and gradients still reach `U`.
- Rank 16 on every linear layer in the blocks trains 1.2 million of 22.9 million weights, which is 5.3%.
- `add_lora` freezes everything first, so only the corrections and the head can learn.
- `merge_lora` folds each correction into `W`, because `W + (alpha / rank) U D` is just another matrix. The phone runs an ordinary ViT at no extra cost.

**Training.** `train_epoch` has the shape of the Week 10 lab: zero gradients, predict, adjust, gather. Differences to be ready to explain:
- AdamW instead of SGD, because the correction factors start at zero with very different scales, and AdamW adapts per weight.
- Half precision, to run faster on 8 GB.
- The cosine schedule steps every batch rather than every epoch.
- The best validation epoch is the one kept.

**Export.** [export.py](../../experiments/vision/vision/export.py) writes ONNX, then 8-bit weights: 86.8 MB becomes 23.0 MB.

## 3. Results

The rule was committed before training (`7c4a6d3`), and validation results before the sealed run (`787c315`). `final` ran once.

| [Sealed photos](../../experiments/vision/results/final.json) | Frozen head | **LoRA (shipped)** |
|---|---|---|
| All 25,862: top-1 | 88.3% | **91.3%** |
| All 25,862: top-5 | 97.9% | **98.5%** |
| 1,278 Malaysian photos: top-1 | 87.2% | **91.8%** |
| 1,161 on the 8 Malaysian-only dishes: top-1 | 86.7% | **91.6%** |

LoRA per dish:
- **Malaysian:** satay 96%, kaya toast 96%, laksa 94%, nasi lemak 92%, mixed rice 92%, roti canai 90%, fried noodles 89%, popiah 85%.
- **Weakest overall:** steak 70%, filet mignon 75%, pork chop 77%.

Say these plainly:
- Sealed scores are higher than validation (88.3%) because Food-101's test labels were cleaned by its authors, while its training labels, and so validation, contain deliberate noise.
- These are curated photos. A real plate in bad light will score lower.
- It always answers with one of 109 dishes. Chicken rice is not one of them, so it will guess something else, and only the "unsure" message helps.
- The 8-bit model costs a little accuracy: 86.0% against 86.8% for full PyTorch on 500 validation photos, with the same first guess on 95.8%.

## Bugs found

| Bug | How it was caught, and what covers it |
|---|---|
| timm tried to read one backbone's safetensors as an old `.npz` file | A smoke test on real weights before the run. No unit test, because it needs the real file; `build_backbone` now passes `custom_load: False` |
| 6 GB of the card's 8 GB at batch 128 | Same smoke test. Batch is now 96 in `config.py` |
| A test's fake head had fewer classes than the five guesses kept | `test_a_head_learns_separable_features` |

## Verified

- `npm run check`: 26 vision tests on tiny fake data, including LoRA and merge values worked out by hand.
- Throwaway mutant checks on the vision code: 9 of 9 caught, then deleted.
- Real training on the RTX 5060: eight epochs at about 4.7 minutes each (`results/lora_dinov2.json`).
- The sealed test ran once. Its second-run refusal is checked by a unit test, not by re-running it.
- ONNX export: `results/export.json`.
- Browser pane, localhost:4173, through the real file input and worker, with 5 validation photos:
  - Nasi lemak (81%), roti canai (95%) and laksa (99%) were correct, and within 1–2 points of desktop ONNX.
  - Satay and sushi came back unsure, with the order of the close guesses different from desktop ONNX.
  - About 290 ms per photo on one thread on the laptop.
  - A chip filled the Today box with nothing saved.
  - The model and WASM were in the service worker cache.
  - No horizontal overflow at 375 px.

## Not verified

- **Real plates through the phone camera.** This is the check that matters most, and Claude will act as validator on the photos Yash takes.
- Speed, memory and photo rotation on the phone, and offline use in airplane mode.
- Why desktop and browser differ slightly on close calls. The cause is untested; 8-bit arithmetic differing between the two runtimes is only a guess.
- Accuracy on dishes outside the 109.
- Licences: neither dataset grants clear reuse rights, so decide before publicly hosting the model.
