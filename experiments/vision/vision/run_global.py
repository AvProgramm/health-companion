"""
Run the global food model one stage at a time.

From experiments/vision:  python -m vision.run_global zero | lora | final | export

The first stage needs no food training at all: it asks whether SigLIP2 can already name
food, on the same validation photos as the first model.

The rule, fixed before the sealed run. LoRA trains on Food-101, the Malaysian set and the ISIA
sample, against fixed text vectors of the dish names. The global model ships to the phone only
if its top-1 on the first experiment's sealed photos, against those 109 names, is at least
89.3%, within two points of the 91.3% it replaces; it is allowed to give up a little there
because it knows far more foods. That set was already scored once, so this is a second look
and is reported as one. ISIA's test sample is the new sealed set.
"""
import json
import sys
import tempfile
from pathlib import Path
import numpy as np
import torch
from .config import CHECKPOINTS, GLOBAL_PREPARED, GLOBAL_SETTINGS, PREPARED, RESULTS, Settings
from .data import make_loader, photo_transform
from .export import export_onnx, quantise, run_onnx, save_result, write_web_files
from .global_model import FoodMatcher
from .lora import add_lora, merge_lora
from .prepare import SEALED, TRAIN, VALIDATION
from .prepare_global import ISIA_ORIGIN
from .run import read_dishes
from .train import predict_top, seed_all, top_k_accuracy, train_lora
from .zero_shot import PROMPTS, food_names, load_siglip, match, name_vectors, photo_vectors, readable

# SigLIP2 expects each colour channel scaled to the range -1 to 1
SIGLIP_MEAN, SIGLIP_STD = [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
# The first experiment's sealed top-1, less the two points the global model may give up
SHIP_LINE = 0.893
# Where the trained corrections are kept
GLOBAL_CHECKPOINT = CHECKPOINTS / 'global_lora.pt'
# Photos used to confirm the phone's small model still agrees with the full one
EXPORT_CHECK_PHOTOS = 200


def scores(photos, names, labels, device):
    """Return top-1 and top-5 for photos matched against these name vectors."""
    top = match(photos, names, device)
    return {'top1': top_k_accuracy(top, labels, 1), 'top5': top_k_accuracy(top, labels, 5)}


def zero():
    """Measure SigLIP2 with no food training, first on the dishes and then among every food name."""
    settings, device, dishes = Settings(), 'cuda', read_dishes()
    model, tokenizer = load_siglip()
    loader = make_loader(PREPARED, VALIDATION, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)
    photos, labels = photo_vectors(model, loader, device)
    names = [readable(dish) for dish in dishes]

    # Compare each wording alone, then all of them averaged, on validation only
    wordings = {prompt: (prompt,) for prompt in PROMPTS}
    wordings['all wordings averaged'] = PROMPTS
    by_wording = {label: scores(photos, name_vectors(model, tokenizer, names, device, prompts), labels, device) for label, prompts in wordings.items()}
    best = max(wordings, key=lambda label: by_wording[label]['top1'])

    # Repeat among every known food; the dataset dishes come first, so the labels still line up
    wide = food_names(dishes)
    wide_scores = scores(photos, name_vectors(model, tokenizer, wide, device, wordings[best]), labels, device)
    save_result('zero_shot.json', {'split': 'validation', 'photos': len(labels), 'dishes': len(names), 'by_wording': by_wording, 'best_wording': best, 'wide_list': {'names': len(wide), **wide_scores}})
    print({'best': best, 'dishes_only': by_wording[best], 'wide_names': len(wide), 'wide': wide_scores}, flush=True)


def read_global_dishes():
    """Return the shared dish names of the joined photos."""
    return json.loads((GLOBAL_PREPARED / 'dishes.json').read_text(encoding='utf-8'))


def matcher_for(names, device, attention=None, prompts=PROMPTS):
    """Return a SigLIP2 food matcher for these names, with the text half freed afterwards."""
    model, tokenizer = load_siglip(attention)
    vectors = name_vectors(model, tokenizer, names, device, prompts)
    matcher = FoodMatcher(model.vision_model, vectors, model.logit_scale.exp().item())
    del model.text_model
    torch.cuda.empty_cache()
    return matcher


def lora():
    """Fine-tune SigLIP2 with LoRA on every photo, against the fixed text vectors of the dishes."""
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()
    seed_all()
    matcher = add_lora(matcher_for(dishes, device), settings.rank, settings.alpha, train_head=False)
    trainable = sum(parameter.numel() for parameter in matcher.parameters() if parameter.requires_grad)
    print('dishes', len(dishes), 'trainable', trainable, 'of', sum(parameter.numel() for parameter in matcher.parameters()), flush=True)

    # Train on random views, and measure on the centre view
    train_loader = make_loader(GLOBAL_PREPARED, TRAIN, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=True), settings, training=True)
    validation_loader = make_loader(GLOBAL_PREPARED, VALIDATION, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)
    result = train_lora(matcher, train_loader, validation_loader, settings, device, report=lambda line: print(line, flush=True))

    # Save the best weights and the record of how they were reached
    CHECKPOINTS.mkdir(parents=True, exist_ok=True)
    torch.save(result['state_dict'], GLOBAL_CHECKPOINT)
    save_result('global_lora.json', {'split': 'validation', 'dishes': len(dishes), 'trainable_parameters': trainable, 'best_epoch': result['best_epoch'], 'best_valid_top1': result['best_valid'], 'history': result['history']})


def trained_matcher(names, device, attention=None):
    """Return the fine-tuned ViT with a head for these names, as an ordinary model."""
    dishes = read_global_dishes()
    matcher = add_lora(matcher_for(dishes, device, attention), GLOBAL_SETTINGS.rank, GLOBAL_SETTINGS.alpha, train_head=False)
    matcher.load_state_dict(torch.load(GLOBAL_CHECKPOINT, weights_only=True))
    merge_lora(matcher)

    # Swap in the requested names, which is all it takes to change what it can recognise
    model, tokenizer = load_siglip()
    vectors = name_vectors(model, tokenizer, names, device, PROMPTS)
    fresh = FoodMatcher(matcher.vision, vectors, model.logit_scale.exp().item())
    del model
    torch.cuda.empty_cache()
    return fresh


def sealed_loader(settings):
    """Return a loader over every sealed photo, and each photo's origin in the same order."""
    splits, origins = np.load(GLOBAL_PREPARED / 'splits.npy'), np.load(GLOBAL_PREPARED / 'origins.npy')
    loader = make_loader(GLOBAL_PREPARED, SEALED, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)
    return loader, origins[splits == SEALED]


def old_sealed_scores(matcher, loader, is_old, old_positions, device):
    """Return top-1 and top-5 on the first experiment's sealed photos, against only its 109 names."""
    top, labels = predict_top(matcher, loader, device)
    top, wanted = top[is_old], torch.tensor([old_positions[value] for value in labels[is_old].tolist()])
    return {'photos': len(wanted), 'top1': top_k_accuracy(top, wanted, 1), 'top5': top_k_accuracy(top, wanted, 5)}


def final():
    """Score the sealed photos once, for SigLIP2 alone and with LoRA, and record whether it ships."""
    # Ignore a repeat run, because a second look would turn the sealed photos into tuning data
    if (RESULTS / 'global_final.json').exists():
        raise SystemExit('The global sealed test has already been run; see results/global_final.json.')

    # Read the names: the shared dishes, and the 109 the first model knew
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()
    old_names = [readable(dish) for dish in read_dishes()]
    loader, origins = sealed_loader(settings)
    is_old, is_isia = torch.from_numpy(origins != ISIA_ORIGIN), torch.from_numpy(origins == ISIA_ORIGIN)
    positions = {dishes.index(name): index for index, name in enumerate(old_names)}

    # Score both versions over the same photos
    report = {}
    for label, build in (('siglip2_alone', lambda names: matcher_for(names, device)), ('siglip2_lora', lambda names: trained_matcher(names, device))):
        # Against the 109 names on the first experiment's sealed photos
        first = old_sealed_scores(build(old_names), loader, is_old, positions, device)
        # Against every shared dish, on the ISIA sealed photos
        top, labels = predict_top(build(dishes), loader, device)
        report[label] = {'first_experiment_sealed_109_names': first, 'isia_sealed_all_dishes': {'photos': int(is_isia.sum()), 'top1': top_k_accuracy(top[is_isia], labels[is_isia], 1), 'top5': top_k_accuracy(top[is_isia], labels[is_isia], 5)}}
        torch.cuda.empty_cache()

    # Record the outcome, which also locks the sealed run
    ships = report['siglip2_lora']['first_experiment_sealed_109_names']['top1'] >= SHIP_LINE
    save_result('global_final.json', {'ship_line': SHIP_LINE, 'ships': ships, 'note': 'The first experiment sealed photos were already scored once, so this is a second look.', 'reports': report})
    print(json.dumps({'ships': ships, 'reports': report}, indent=2), flush=True)


def export():
    """Export the fine-tuned model with every known food name, and check the phone's copy agrees."""
    device, dishes = 'cuda', read_global_dishes()
    names = food_names(dishes)
    matcher = trained_matcher(names, device, attention='eager')
    settings = Settings(batch_size=EXPORT_CHECK_PHOTOS, workers=0)
    pixels, _labels = next(iter(make_loader(GLOBAL_PREPARED, VALIDATION, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)))
    matcher.cpu().eval()
    with torch.no_grad():
        expected = matcher(pixels).argmax(dim=1)
    with tempfile.TemporaryDirectory() as folder:
        full, small = Path(folder) / 'full.onnx', Path(folder) / 'small.onnx'
        export_onnx(matcher, full)
        quantise(full, small)
        same = (torch.from_numpy(run_onnx(small, pixels.numpy())).argmax(dim=1) == expected).float().mean().item()
        write_web_files(small, names, SIGLIP_MEAN, SIGLIP_STD)
        save_result('global_export.json', {'names': len(names), 'full_mb': round(full.stat().st_size / 1e6, 1), 'small_mb': round(small.stat().st_size / 1e6, 1), 'photos_checked': EXPORT_CHECK_PHOTOS, 'same_first_guess_as_pytorch': same})
    print(json.loads((RESULTS / 'global_export.json').read_text(encoding='utf-8')), flush=True)


# Every stage this script can run; a new one is one more entry here
STAGES = {'zero': zero, 'lora': lora, 'final': final, 'export': export}


if __name__ == '__main__':
    STAGES[sys.argv[1]](*sys.argv[2:])
