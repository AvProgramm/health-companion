# Handover to Codex: finish the global food model (9 Nov 2026)

Branch `feat/ai-trainer`, pushed. Read `CLAUDE.md` and `.claude/rules/` first. Earlier rules and later ideas stay in `codex-m5.md`.

## What is done

- App: first-run setup, cardio, BMI, daily balance, barcode lookup, weight trend, seven-day view, Log again. `npm run check` is green and everything is pushed. Driven in the browser pane only, **not yet on the phone**.
- Vision: the first model (DINOv2-small with LoRA, 23 MB, 91.3% sealed) is on the phone and working.
- Global model (SigLIP2 with LoRA, a food is a name): pipeline written and tested on fake data, in `experiments/vision/vision/{zero_shot,global_model,isia,prepare_global,run_global}.py`. The decision rule is in the `run_global.py` docstring and was fixed before any sealed run.
- ISIA sample fetched: 737 blocks, up to about 73,700 photos. The fetch hit its time limit at 93 of 131 files. Each file holds only some dishes, so some dishes have few or no training photos.

## 1. Check the GPU run

A chain started at 13:08 on 9 Nov: join photos, then `run_global lora` (3 epochs, roughly 70 minutes), then `run_global bands`. Logs are in `~/hc-vision/logs/{prepare_global,global_lora,global_bands}.log`; results land in `experiments/vision/results/`.

- `nvidia-smi` shows the GPU busy: it is still running. Wait, and do not start a second copy.
- `results/global_lora.json` and `results/global_bands.json` both exist: it finished.
- It stopped with one missing: read the end of that log, then rerun only the missing stage below. Yash allowed this training. Do not change the training loop or its settings.

```bash
cd experiments/vision
export HF_HUB_OFFLINE=1 PYTHONPATH=.
PY=.venv/Scripts/python.exe
$PY -u -W ignore -m vision.prepare_global     # only if results/prepare_global.json is missing
$PY -u -W ignore -m vision.run_global lora    # only if results/global_lora.json is missing
$PY -u -W ignore -m vision.run_global bands   # only if results/global_bands.json is missing
```

Commit `prepare_global.json`, `global_lora.json` and `global_bands.json`.

## 2. Read validation before the sealed run

Report `best_valid_top1` and the history from `global_lora.json`, and the photo and dish counts from `prepare_global.json`. Count how many dishes have no training photo at all:

```bash
$PY -c "import json,numpy as n;d=json.load(open(r'C:/Users/User/hc-vision/prepared-global/dishes.json'));l=n.load(r'C:/Users/User/hc-vision/prepared-global/labels.npy');s=n.load(r'C:/Users/User/hc-vision/prepared-global/splits.npy');print(len(d),len(d)-len(n.unique(l[s==0])))"
```

For context only, since the name lists differ: SigLIP2 with no food training scored 88.15% top-1 on the first validation photos against 109 names and 81.2% against 333 names; the first model's best validation was 88.31%.

## 3. Sealed test, exactly once

```bash
$PY -u -W ignore -m vision.run_global final
```

It refuses a second run once `results/global_final.json` exists. Commit that file whatever it says. Never change `SHIP_LINE = 0.893` after seeing a result. The first experiment's sealed photos were already scored once, so that number is a **second look** and must be reported as one. The ISIA sealed sample is new.

## 4. Export, only if `"ships": true`

`export()` does not check this itself. The model files are git-ignored, so back up the working model first.

```bash
cp -r ../../apps/web/public/models/dish ~/hc-vision/dish-dinov2-backup
$PY -u -W ignore -m vision.run_global export
```

Expect about 96 MB. In `results/global_export.json`, `same_first_guess_as_pytorch` was 95.8% for the first model; a much lower value means the 8-bit copy is not safe to ship.

If `"ships": false`, keep the DINOv2 model, change nothing in the app, and write down why.

## 5. Set the unsure line (only if exported)

`UNSURE_BELOW` in `apps/web/src/ui/PlatePhoto.tsx` is 0.4, read from the first model, and does not carry over. In `results/global_bands.json`, take the lowest `from` where `right` is at least about two in three and stays there in the bands above it (the first model reached 66.4% at 0.4). Name the source file in the comment above the constant.

## 6. Build and check

```bash
npm run check
npm --prefix apps/web run build
```

Then check the photo card in a browser: a known plate, an unknown food, and the time per photo. The service worker precaches every model file with each build (`vite.config.ts`, `src/sw/service-worker.js`), so 96 MB is fetched at install and again after every build. Confirm the install completes. If it does not, or before public hosting, give the model its own cache named after a hash of the model and `labels.json`, because those two must always change together.

## 7. Phone, with Yash

Setup is in `docs/test-log.md`. adb is `C:\Users\User\platform-tools\adb.exe`; run `adb devices`, accept the prompt on the phone, then `adb reverse tcp:4173 tcp:4173`. Start the web preview and the coach only if they are not already on 4173 and 8000 (`docs/run-locally.md`).

Still untested on the phone: checks 1 and 3–10 in `docs/test-log.md`, sign-up, cardio, balance, barcode (the camera path needs Android Chrome's `BarcodeDetector`), weight trend, seven-day view, Log again, and plate photos on the new model. Expect a photo to take a few seconds, against 560–780 ms for the smaller model, and report what is measured. Write only what Yash observes into `docs/test-log.md`, and never put test data into his real phone diary.

## 8. Docs

- Add `docs/milestones/m7-walkthrough.md`, shaped like `m6-walkthrough.md`, with Verified and Not verified sections listing only checks that ran.
- Update `experiments/vision/README.md`, `CLAUDE.md`, `docs/ai-log.md` and `docs/test-log.md`.
- In `docs/market-comparison.md`, replace point 7's "(in progress)" with the real result.

## Rules that still apply

- FIT3080 comment voice, SOLID, YAGNI, British spelling. A bug fix starts with a failing test from the exact input.
- Run `npm run check` before saying anything works, and say what was verified and where.
- Stage explicit paths only. Never force-push or skip hooks. Push at each green checkpoint.
- Never open `.env` or any key or token file, and never print a secret. No diary history leaves the device. Fixtures stay fictional. Never commit the private research packet or course code.
- `compareCandidates` and the PyTorch training loop need Yash's sign-off.
- Any new download needs his approval first, with the file name, source and size.

## Still open for Yash

- Licences: neither Food-101-style sets nor ISIA grant clear reuse, so decide before public hosting. Hosting was planned for Wed 11 Nov.
- Whether and when to merge `feat/ai-trainer` into `main`.
- On-device rep counting needs a pose model download, so it needs his approval.
- The Code Tour artifact (https://claude.ai/artifact/SzGW7M2CVTo6GGdnuHo76P) has a `#globalStatus` box awaiting final numbers. Only Claude can republish it.
