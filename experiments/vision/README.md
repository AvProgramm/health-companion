# Dish photo model

Fine-tunes a small Vision Transformer on food photos, so the phone can suggest what is on a plate. It runs on the device: the photo never leaves it. The model only proposes dish names, and the person picks one before anything is estimated or saved.

Written by Claude Code at Yash's request on 9 Nov 2026, following his FIT3181 ViT fine-tuning lab, for him to cross-check. Real training ran on his RTX 5060 with his go-ahead.

## The rule, fixed before the sealed test

1. Two ViT-Small backbones are compared with a frozen head on the validation photos. The better top-1 is the backbone used from then on.
2. LoRA trains on that backbone, starting from its frozen head. The best validation epoch is the one kept.
3. The sealed photos are scored once, for both the frozen head and LoRA. **LoRA ships only if its sealed top-1 is higher than the frozen head's.** Otherwise the frozen head ships, and the result is reported as it is.
4. `run final` refuses a second run. `results/final.json` is the record.

Top-1 decides. Top-5 is reported too, because the phone shows five dishes to choose from. Results are also reported for the Malaysian photos and for the eight dishes only the Malaysian set covers, because a good overall score could hide a poor score on what Yash actually eats.

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

## Later

Yash's direction is one global food transformer, with regional or per-country fine-tunes on top. LoRA suits that: a region is a small set of corrections and extra dishes on a shared base. Nothing here builds that yet.
