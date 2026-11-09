"""
Run the global food model one stage at a time.

From experiments/vision:  python -m vision.run_global zero | lora | bands | final | unseen | malaysian | shrink | export

The first stage needs no food training at all: it asks whether SigLIP2 can already name
food, on the same validation photos as the first model.

The rule, fixed before the sealed run. LoRA trains on Food-101, the Malaysian set and the ISIA
sample, against fixed text vectors of the dish names. The global model ships to the phone only
if its top-1 on the first experiment's sealed photos, against those 109 names, is at least
89.3%, within two points of the 91.3% it replaces; it is allowed to give up a little there
because it knows far more foods. That set was already scored once, so this is a second look
and is reported as one.

ISIA's test files turned out to hold 100 dishes of their own, numbered from zero separately.
The first sealed run took those numbers for the training dishes, so the ISIA half of
global_final.json is void. The unseen stage scores those photos with the right names, once,
with nothing tuned in between: a dish with no training photo is known only by its name.
"""
import copy
import json
import sys
import tempfile
from pathlib import Path
import numpy as np
import torch
from .config import CHECKPOINTS, GLOBAL_PREPARED, GLOBAL_SETTINGS, PREPARED, RESULTS, Settings
from .data import make_loader, photo_transform
from .export import SMALLEST_HALVED, export_onnx, halve_weights, run_onnx, save_result, write_web_files
from .global_model import FoodMatcher
from .lora import add_lora, merge_lora
from .prepare import SEALED, TRAIN, VALIDATION
from .prepare_global import ISIA_ORIGIN
from .run import MALAYSIAN, read_dishes, read_result
from .train import half_precision, predict_top, seed_all, top_k_accuracy, train_lora
from .zero_shot import PROMPTS, food_names, load_siglip, match, name_vectors, photo_vectors, readable

# SigLIP2 expects each colour channel scaled to the range -1 to 1
SIGLIP_MEAN, SIGLIP_STD = [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
# The first experiment's sealed top-1, less the two points the global model may give up
SHIP_LINE = 0.893
# Where the trained corrections are kept
GLOBAL_CHECKPOINT = CHECKPOINTS / 'global_lora.pt'
# The phone's copy must give the full model's first guess at least this often to be installed
SAME_FIRST_GUESS_LINE = 0.98
# How many values an 8-bit weight can take
EIGHT_BIT_LEVELS = 256
# Where each confidence band ends, for deciding when the photo card should say it is unsure
BAND_EDGES = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]


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


def versions(device):
    """Return how to build SigLIP2 alone and with LoRA, for any list of names."""
    return {'siglip2_alone': lambda names: matcher_for(names, device), 'siglip2_lora': lambda names: trained_matcher(names, device)}


def group_scores(top, wanted, groups):
    """Return the photo count, top-1 and top-5 of each named group of photos."""
    return {name: {'photos': int(chosen.sum()), 'top1': top_k_accuracy(top[chosen], wanted[chosen], 1), 'top5': top_k_accuracy(top[chosen], wanted[chosen], 5)} for name, chosen in groups.items()}


def final():
    """Score the first experiment's sealed photos once, for SigLIP2 alone and with LoRA, and record whether it ships."""
    # Ignore a repeat run, because a second look would turn the sealed photos into tuning data
    if (RESULTS / 'global_final.json').exists():
        raise SystemExit('The global sealed test has already been run; see results/global_final.json.')

    # Read the names: the shared dishes, and the 109 the first model knew
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()
    old_names = [readable(dish) for dish in read_dishes()]
    loader, origins = sealed_loader(settings)
    is_old = torch.from_numpy(origins != ISIA_ORIGIN)
    positions = {dishes.index(name): index for index, name in enumerate(old_names)}

    # Score both versions over the same photos, against those 109 names
    report = {label: {'first_experiment_sealed_109_names': old_sealed_scores(build(old_names), loader, is_old, positions, device)} for label, build in versions(device).items()}

    # Record the outcome, which also locks the sealed run
    ships = report['siglip2_lora']['first_experiment_sealed_109_names']['top1'] >= SHIP_LINE
    save_result('global_final.json', {'ship_line': SHIP_LINE, 'ships': ships, 'note': 'The first experiment sealed photos were already scored once, so this is a second look.', 'reports': report})
    print(json.dumps({'ships': ships, 'reports': report}, indent=2), flush=True)


def names_with_unseen(known, test_dishes):
    """Return every name to choose from: the ones the phone knows, then any test dish it does not."""
    return known + [name for name in test_dishes if name not in known]


def dishes_with_training_photos(dishes):
    """Return the names of the dishes that had at least one training photo."""
    labels, splits = np.load(GLOBAL_PREPARED / 'labels.npy'), np.load(GLOBAL_PREPARED / 'splits.npy')
    return {dishes[index] for index in np.unique(labels[splits == TRAIN]).tolist()}


def unseen():
    """
    Score ISIA's test photos once, each one picked out of every name the phone knows.

    SigLIP2 alone is reported beside the fine-tuned model, because fine-tuning could help
    the dishes it saw while hurting the ones it did not.
    """
    # Ignore a repeat run, because a second look would turn the sealed photos into tuning data
    if (RESULTS / 'global_unseen.json').exists():
        raise SystemExit('The unseen-dish test has already been run; see results/global_unseen.json.')

    # Read every name on offer, and which dishes truly had training photos
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()
    test_dishes = json.loads((GLOBAL_PREPARED / 'test_dishes.json').read_text(encoding='utf-8'))
    names, trained = names_with_unseen(food_names(dishes), test_dishes), dishes_with_training_photos(dishes)
    position = {name: index for index, name in enumerate(names)}
    loader, origins = sealed_loader(settings)
    is_isia = torch.from_numpy(origins == ISIA_ORIGIN)

    # Score both versions, keeping the dishes that never had a training photo apart
    report = {}
    for label, build in versions(device).items():
        top, labels = predict_top(build(names), loader, device)
        photo_dishes = [test_dishes[value] for value in labels[is_isia].tolist()]
        wanted = torch.tensor([position[name] for name in photo_dishes])
        never_trained = torch.tensor([name not in trained for name in photo_dishes])
        report[label] = group_scores(top[is_isia], wanted, {'never_trained': never_trained, 'trained_under_that_name': ~never_trained})
        torch.cuda.empty_cache()

    # Record the outcome, which also locks this test
    save_result('global_unseen.json', {'names_on_offer': len(names), 'test_dishes': len(test_dishes), 'test_dishes_never_trained': len(set(test_dishes) - trained), 'note': 'Replaces the void ISIA half of global_final.json, which used the wrong labels. Nothing was tuned between the two.', 'reports': report})
    print(json.dumps(report, indent=2), flush=True)


def malaysian():
    """
    Report the fine-tuned model on the Malaysian sealed photos, against the first model's 109 names.

    These photos were already scored, and no decision depends on this, so it is for reporting only.
    """
    # Read the 109 names and which of them only the Malaysian set has
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()
    old_dishes = read_dishes()
    old_names = [readable(dish) for dish in old_dishes]
    positions = {dishes.index(name): index for index, name in enumerate(old_names)}
    only_in_malaysian = set(read_result('prepare.json')['only_in_malaysian'])
    loader, origins = sealed_loader(settings)
    is_malaysian = torch.from_numpy(origins == MALAYSIAN)

    # Score against those names, so the two models answer the same question
    top, labels = predict_top(trained_matcher(old_names, device), loader, device)
    wanted = torch.tensor([positions[value] for value in labels[is_malaysian].tolist()])
    malaysian_only = torch.tensor([old_dishes[value] in only_in_malaysian for value in wanted.tolist()])
    report = group_scores(top[is_malaysian], wanted, {'malaysian_photos': torch.ones_like(malaysian_only), 'malaysian_only_dishes': malaysian_only})
    save_result('global_malaysian.json', {'note': 'A further look at sealed photos already scored, for reporting only.', **report})
    print(json.dumps(report, indent=2), flush=True)


def rounded_evenly(weight):
    """Return a weight as 8-bit storage would give it back, with one even scale for the whole tensor."""
    low, high = weight.min(), weight.max()
    step = (high - low) / (EIGHT_BIT_LEVELS - 1)
    return low + ((weight - low) / step).round() * step


def rounded_per_row(weight):
    """Return a weight as per-channel 8-bit storage would give it back, with an even scale for each row."""
    # Ignore a one-dimensional weight, because it has no rows to scale apart
    if weight.ndim < 2:
        return rounded_evenly(weight)

    axes = tuple(range(1, weight.ndim))
    low, high = weight.amin(dim=axes, keepdim=True), weight.amax(dim=axes, keepdim=True)
    step = (high - low).clamp(min=1e-12) / (EIGHT_BIT_LEVELS - 1)
    return low + ((weight - low) / step).round() * step


def rounded_to_half(weight):
    """Return a weight as 16-bit storage would give it back."""
    return weight.half().float()


def in_blocks(key, numbers):
    """Return whether a weight belongs to one of these transformer blocks."""
    return any(f'layers.{number}.' in key for number in numbers)


# Every way of shrinking the weights that was measured: how a weight is rounded, and which weights are
SHRINK_VARIANTS = {
    '16-bit, every weight': (rounded_to_half, lambda key: True),
    '8-bit, every weight': (rounded_evenly, lambda key: True),
    '8-bit per row, every weight': (rounded_per_row, lambda key: True),
    '8-bit, feed-forward layers only': (rounded_evenly, lambda key: '.mlp.fc' in key and 'encoder' in key),
    '8-bit, attention only': (rounded_evenly, lambda key: '_proj' in key and 'encoder' in key),
    '8-bit, blocks 0 to 5 only': (rounded_evenly, lambda key: in_blocks(key, range(6))),
    '8-bit, blocks 6 to 11 only': (rounded_evenly, lambda key: in_blocks(key, range(6, 12))),
}


def shrink():
    """
    Record what each way of shrinking the weights does to the answers, on validation, with every food name.

    Rounding happens in PyTorch, so this measures only what storing fewer bits costs, on
    every validation photo. The exported file is then checked against PyTorch separately.
    """
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()
    names = food_names(dishes)
    matcher = trained_matcher(names, device)
    loader = make_loader(GLOBAL_PREPARED, VALIDATION, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)
    top, labels = predict_top(matcher, loader, device)
    expected = top[:, 0]

    # Only large weights are stored differently, as in the export
    original = copy.deepcopy(matcher.state_dict())
    large = [key for key, value in original.items() if value.is_floating_point() and value.numel() >= SMALLEST_HALVED]
    total = sum(original[key].numel() for key in large)

    # Measure each way from the same starting weights
    report = {}
    for name, (rounded, chosen) in SHRINK_VARIANTS.items():
        picked = {key for key in large if chosen(key)}
        matcher.load_state_dict({key: (rounded(value) if key in picked else value) for key, value in original.items()})
        guesses = predict_top(matcher, loader, device)[0][:, 0]
        report[name] = {'same_first_guess': (guesses == expected).float().mean().item(), 'top1': (guesses == labels).float().mean().item(), 'share_of_weights': sum(original[key].numel() for key in picked) / total}
        print(name, report[name], flush=True)

    # Record the table the 16-bit decision is read from
    save_result('global_shrink.json', {'split': 'validation', 'photos': len(labels), 'names': len(names), 'top1_before_shrinking': (expected == labels).float().mean().item(), 'variants': report})


def export():
    """Export the fine-tuned model with every known food name, if it passed, and check the phone's copy agrees."""
    # Ignore a model that did not pass, because that decision was fixed before the sealed run
    if not read_result('global_final.json')['ships']:
        raise SystemExit('The sealed test did not pass, so the phone keeps its current model.')

    device, dishes = 'cuda', read_global_dishes()
    names = food_names(dishes)
    matcher = trained_matcher(names, device, attention='eager')

    # Take one photo from each batch, so the check covers every part of the dataset
    loader = make_loader(GLOBAL_PREPARED, VALIDATION, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), GLOBAL_SETTINGS)
    pixels = torch.cat([batch[:1] for batch, _labels in loader])
    matcher.cpu().eval()
    with torch.no_grad():
        expected = matcher(pixels).argmax(dim=1)
    with tempfile.TemporaryDirectory() as folder:
        full, small = Path(folder) / 'full.onnx', Path(folder) / 'small.onnx'
        export_onnx(matcher, full)
        halve_weights(full, small)
        same = (torch.from_numpy(run_onnx(small, pixels.numpy())).argmax(dim=1) == expected).float().mean().item()
        save_result('global_export.json', {'names': len(names), 'weights': '16-bit', 'full_mb': round(full.stat().st_size / 1e6, 1), 'small_mb': round(small.stat().st_size / 1e6, 1), 'photos_checked': len(pixels), 'same_first_guess_as_pytorch': same})

        # Ignore a copy that answers differently, because it would not be the model that was tested
        if same < SAME_FIRST_GUESS_LINE:
            raise SystemExit(f'The phone copy gave the same first guess on only {same:.1%} of photos, so it was not installed.')
        write_web_files(small, names, SIGLIP_MEAN, SIGLIP_STD)
    print(read_result('global_export.json'), flush=True)


def confidence_bands(confidence, correct):
    """Return, for each confidence band, how many first guesses fell in it and how often they were right."""
    bucket = torch.bucketize(confidence, torch.tensor(BAND_EDGES), right=True)

    # Report an empty band as having no rate, because nothing measured is not zero
    report = []
    for index, start in enumerate([0.0, *BAND_EDGES]):
        inside = bucket == index
        count = int(inside.sum())
        report.append({'from': start, 'photos': count, 'right': None if count == 0 else correct[inside].float().mean().item()})
    return report


def bands():
    """Record how often the model is right at each confidence, on validation, with every food name."""
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()
    names = food_names(dishes)
    matcher = trained_matcher(names, device)
    matcher.to(device)
    matcher.eval()
    loader = make_loader(GLOBAL_PREPARED, VALIDATION, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)

    # Take each photo's first guess and its probability, computed as the phone computes them
    confidence, correct = [], []
    with torch.no_grad():
        for pictures, targets in loader:
            with half_precision(device):
                outputs = matcher(pictures.to(device, non_blocking=True))
            best, guesses = outputs.float().softmax(dim=1).max(dim=1)
            confidence.append(best.cpu())
            correct.append(guesses.cpu() == targets)

    # Record the table the unsure line is read from
    report = confidence_bands(torch.cat(confidence), torch.cat(correct))
    save_result('global_bands.json', {'split': 'validation', 'names': len(names), 'bands': report})
    print(report, flush=True)


# Every stage this script can run; a new one is one more entry here
STAGES = {'zero': zero, 'lora': lora, 'bands': bands, 'final': final, 'unseen': unseen, 'malaysian': malaysian, 'shrink': shrink, 'export': export}


if __name__ == '__main__':
    STAGES[sys.argv[1]](*sys.argv[2:])
