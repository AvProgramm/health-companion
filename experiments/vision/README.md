# Dish photo model

Fine-tunes a small Vision Transformer on food photos, so the phone can suggest what is on a plate. It runs on the device: the photo never leaves it. The model only proposes dish names, and the person picks one before anything is estimated or saved.

Written by Claude Code at Yash's request on 9 Nov 2026, following his FIT3181 ViT fine-tuning lab, for him to cross-check. Real training ran on his RTX 5060 with his go-ahead.

## The rule, fixed before the sealed test

1. Two ViT-Small backbones are compared with a frozen head on the validation photos. The better top-1 is the backbone used from then on.
2. LoRA trains on that backbone, starting from its frozen head. The best validation epoch is the one kept.
3. The sealed photos are scored once, for both the frozen head and LoRA. **LoRA ships only if its sealed top-1 is higher than the frozen head's.** Otherwise the frozen head ships, and the result is reported as it is.
4. `run final` refuses a second run. `results/final.json` is the record.

Top-1 decides. Top-5 is reported too, because the phone shows five dishes to choose from. Results are also reported for the Malaysian photos and for the eight dishes only the Malaysian set covers, because a good overall score could hide a poor score on what Yash actually eats.

## Result

Scored once on 25,862 sealed photos, 9 Nov 2026 (`results/final.json`). LoRA on DINOv2-small ships.

| | Frozen head | LoRA |
|---|---|---|
| All photos, top-1 / top-5 | 88.3% / 97.9% | **91.3% / 98.5%** |
| Malaysian photos (1,278), top-1 | 87.2% | **91.8%** |
| Malaysian-only dishes (1,161), top-1 | 86.7% | **91.6%** |

The phone's 8-bit copy is 23.0 MB. On 500 validation photos it scored 86.0% against 86.8% for full PyTorch, with the same first guess on 95.8%. Real plates have not been tested. Walkthrough: `docs/milestones/m6-walkthrough.md`.

## Why LoRA

The lab froze a ViT and tuned prompts or adapters. LoRA is in the same family: the pretrained weights `W` stay frozen, and each linear layer learns a small correction `(alpha / rank) U D`, so it computes `(W + (alpha / rank) U D) x`. At rank 16 that is about 5% of the weights.

Because `W + (alpha / rank) U D` is itself just a matrix, the correction is folded back in after training (`merge_lora`), and the phone runs an ordinary ViT.

## Data

| Dataset | Revision | Photos | Licence |
|---|---|---|---|
| `ethz/food101` | `83488de` | 101,000, 101 dishes | Hugging Face lists it as unknown. The authors limit use beyond research to the picture owners' terms |
| `lowyisan/malaysian_food_images` | `f64a696` | 11,000, 11 dishes | None stated |

Duplicate dishes are merged by name, leaving 109. Each dataset's published test split is the sealed test. Food-101's held-out labels were cleaned by its authors, while its training labels contain deliberate noise, so validation scores can read slightly low.

Any photo with the same 64-bit difference hash as a training photo is removed from the sealed set, and copies inside the training pool move together into train or validation. This catches exact and near-exact copies only.

**Neither dataset grants clear reuse rights.** This is fine for a private prototype. Decide before publicly hosting the model.

## Weights

| Backbone | Repository | Revision | Licence |
|---|---|---|---|
| `dinov2` | `timm/vit_small_patch14_dinov2.lvd142m` | `4610ca1` | Apache-2.0 |
| `augreg` | `timm/vit_small_patch16_224.augreg_in21k_ft_in1k` | `7e2c556` | Apache-2.0 |

Downloaded as safetensors only, which cannot run code when loaded.

## Running it

Create the environment, reusing the `fit3181` packages read-only:

```bash
"C:/Users/User/anaconda3/envs/fit3181/python.exe" -m venv --system-site-packages experiments/vision/.venv
experiments/vision/.venv/Scripts/python.exe -m pip install -r experiments/vision/requirements-lock.txt
```

Then, from `experiments/vision`, with `PYTHONPATH=.`:

```bash
python -m vision.download
python -m vision.prepare
python -m vision.run probe
python -m vision.run lora
python -m vision.run final
python -m vision.run export
```

Photos, checkpoints and logs stay in `~/hc-vision`, outside OneDrive and Git. `export` writes to `apps/web/public/models/dish/`, which Git ignores.

## The global model

One food model for the world, in `vision/run_global.py`: SigLIP2 ViT-B/16 with LoRA, whose head is the fixed text vectors of food names, so a food is a name. The phone knows 686 names and fetches the 187 MB model once, on first use. Written and run by Claude Code on 9 Nov 2026 at Yash's request, for him to cross-check. Walkthrough: `docs/milestones/m7-walkthrough.md`.

The rule, fixed before the sealed run: it ships only if its top-1 on the first experiment's sealed photos, against those 109 names, is at least 89.3%. Those photos were already scored once, so this is a second look.

| | SigLIP2 alone | With LoRA (shipped) | First model |
|---|---|---|---|
| First sealed photos, 109 names, top-1 / top-5 | 91.7% / 98.9% | **94.0% / 99.2%** | 91.3% / 98.5% |
| Validation, trained dishes, 686 names, top-1 / top-5 | 62.7% / 86.0% | **79.7% / 94.7%** | |
| ISIA test, 95 dishes never trained, 777 names, top-1 / top-5 | **49.8% / 80.9%** | 35.5% / 71.0% | |

Fine-tuning buys 17 points on the dishes it saw and costs 14 on the ones it did not. The ISIA half of `results/global_final.json` is void: ISIA's test files number 100 dishes of their own, and that first run took them for the training dishes. `results/global_unseen.json` replaces it.

Weights are stored in 16 bits, because 8-bit weights changed the first guess on 18% of validation photos (`results/global_shrink.json`).

`vision/run_holdout.py` measures what fine-tuning costs on validation photos, with 67 dishes kept out of training altogether, names included. LoRA at half strength kept those names at SigLIP2's level for 5 points on the trained dishes. LayerNorm tuning, the nearest thing a ViT has to FIT3181's BatchNorm fix, was safe but weak. Nothing from it is on the phone yet. Walkthrough section 7; record `results/global_holdout.json`.

| Dataset or weights | Revision | Size used | Licence |
|---|---|---|---|
| ISIA Food-500, Hugging Face mirror, pinned in `config.py` | See `LARGE_DATASETS` | 71,701 photos, every fourth block of 93 of 131 files | None stated. Decide before publicly hosting |
| `google/siglip2-base-patch16-224` | Pinned in `config.py` | 1.5 GB | Apache-2.0 |

Then, from `experiments/vision`, with `PYTHONPATH=.`:

```bash
python -m vision.isia     # one block in four; add 1 for every block
python -m vision.prepare_global
python -m vision.run_global zero
python -m vision.run_global lora
python -m vision.run_global bands
python -m vision.run_global final
python -m vision.run_global unseen
python -m vision.run_global malaysian
python -m vision.run_global compare
python -m vision.run_global shrink
python -m vision.run_global export
python -m vision.run_holdout
```

## Later

Regional or per-country fine-tunes on the global model, as Yash intends: a region is a small set of corrections and extra names on a shared base. The first fine-tune cost the dishes it never saw, and `run_holdout.py` shows that applying LoRA at half strength removes that cost, so measure a regional fine-tune on held-out dishes the same way.
