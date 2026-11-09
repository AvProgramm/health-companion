"""
Run the dish-photo experiment one stage at a time.

From experiments/vision:  python -m vision.run probe | lora [backbone] | final | export

The rule, fixed before the sealed test is run (see README.md). Validation chooses the
backbone by the frozen head's top-1. LoRA then trains on that backbone. The sealed photos are
scored once, for both the frozen head and LoRA, and LoRA ships only if its sealed top-1 is
higher; otherwise the frozen head ships, and the result is reported as it is.
"""
import json
import sys
import tempfile
import time
from pathlib import Path
import numpy as np
import torch
from .backbones import build_backbone, colour_settings
from .config import BACKBONES, CHECKPOINTS, PREPARED, RESULTS, Settings
from .data import make_loader, photo_transform
from .export import export_onnx, quantise, run_onnx, save_result, write_web_files
from .lora import add_lora, merge_lora
from .prepare import SEALED, TRAIN, VALIDATION
from .train import extract_features, fit_head, predict_top, seed_all, top_k_accuracy, train_lora

# Learning rates compared for the frozen head, on validation only
HEAD_RATES = (0.001, 0.003, 0.01)
# Photos used to confirm the phone's small model still agrees with the full one
EXPORT_CHECK_PHOTOS = 500
# The origin code of the Malaysian photos, in the order DATASETS lists them
MALAYSIAN = 1


def read_dishes():
    """Return the dish names in label-index order."""
    return json.loads((PREPARED / 'dishes.json').read_text(encoding='utf-8'))


def read_result(name):
    """Return one saved result."""
    return json.loads((RESULTS / name).read_text(encoding='utf-8'))


def probe():
    """Train a head on each frozen backbone, and record which backbone does best on validation."""
    settings, device, dishes, record = Settings(), 'cuda', read_dishes(), {}
    CHECKPOINTS.mkdir(parents=True, exist_ok=True)

    for name in BACKBONES:
        # Cache one centre view of every photo through the frozen ViT
        seed_all()
        started = time.perf_counter()
        model = build_backbone(name, len(dishes))
        mean, std = colour_settings(model)
        centre = photo_transform(mean, std, training=False)
        train = extract_features(model, make_loader(PREPARED, TRAIN, centre, settings), device)
        validation = extract_features(model, make_loader(PREPARED, VALIDATION, centre, settings), device)

        # Compare learning rates on validation; the smaller rate wins a tie
        runs = [fit_head(train, validation, len(dishes), rate, settings, device) for rate in HEAD_RATES]
        best = max(runs, key=lambda run: (run['top1'], -run['learning_rate']))
        torch.save(best['state_dict'], CHECKPOINTS / f'head_{name}.pt')
        record[name] = {'top1': best['top1'], 'top5': best['top5'], 'learning_rate': best['learning_rate'], 'best_epoch': best['best_epoch'],
                        'by_rate': {str(run['learning_rate']): run['top1'] for run in runs}, 'seconds': round(time.perf_counter() - started, 1)}
        print(name, record[name], flush=True)

        # Free the GPU before the next backbone
        del model
        torch.cuda.empty_cache()

    # Record the winner, which the later stages read
    save_result('probe.json', {'split': 'validation', 'chosen': max(record, key=lambda name: record[name]['top1']), 'backbones': record})


def lora_model(name, dishes, settings):
    """Return a backbone with its frozen head loaded and low-rank corrections added."""
    model = build_backbone(name, len(dishes))
    model.head.load_state_dict(torch.load(CHECKPOINTS / f'head_{name}.pt', weights_only=True))
    return add_lora(model, settings.rank, settings.alpha)


def lora(name=None):
    """Train the low-rank corrections on the chosen backbone, starting from its frozen head."""
    settings, device, dishes = Settings(), 'cuda', read_dishes()
    name = name or read_result('probe.json')['chosen']

    # Build the model, starting from the head that already works
    seed_all()
    model = lora_model(name, dishes, settings)
    mean, std = colour_settings(model)
    trainable = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
    print(name, 'trainable', trainable, 'of', sum(parameter.numel() for parameter in model.parameters()), flush=True)

    # Train on random views, and measure on the centre view
    train_loader = make_loader(PREPARED, TRAIN, photo_transform(mean, std, training=True), settings, training=True)
    validation_loader = make_loader(PREPARED, VALIDATION, photo_transform(mean, std, training=False), settings)
    result = train_lora(model, train_loader, validation_loader, settings, device, report=lambda line: print(line, flush=True))

    # Save the best weights and the record of how they were reached
    torch.save(result['state_dict'], CHECKPOINTS / f'lora_{name}.pt')
    save_result(f'lora_{name}.json', {'split': 'validation', 'backbone': name, 'trainable_parameters': trainable, 'best_epoch': result['best_epoch'], 'best_valid_top1': result['best_valid'], 'history': result['history']})


def frozen_model(name, dishes):
    """Return a backbone with only its frozen head loaded."""
    model = build_backbone(name, len(dishes))
    model.head.load_state_dict(torch.load(CHECKPOINTS / f'head_{name}.pt', weights_only=True))
    return model


def trained_lora_model(name, dishes, settings):
    """Return a backbone with its best trained corrections loaded."""
    model = lora_model(name, dishes, settings)
    model.load_state_dict(torch.load(CHECKPOINTS / f'lora_{name}.pt', weights_only=True))
    return model


def sealed_report(top, labels, is_malaysian, only_malaysian):
    """Return top-1 and top-5 overall, on the Malaysian photos and on the dishes only they cover."""
    slices = {'all_photos': torch.ones(len(labels), dtype=torch.bool), 'malaysian_photos': is_malaysian, 'malaysian_only_dishes': only_malaysian}
    return {name: {'photos': int(mask.sum()), 'top1': top_k_accuracy(top[mask], labels[mask], 1), 'top5': top_k_accuracy(top[mask], labels[mask], 5)} for name, mask in slices.items()}


def final():
    """Score the sealed photos once, for the frozen head and for LoRA, and record which ships."""
    # Ignore a repeat run, because a second look would turn the sealed photos into tuning data
    if (RESULTS / 'final.json').exists():
        raise SystemExit('The sealed test has already been run; its result is in results/final.json.')

    # Read what validation chose, and which sealed photos are the Malaysian ones
    settings, device, dishes = Settings(), 'cuda', read_dishes()
    name = read_result('probe.json')['chosen']
    only = read_result('prepare.json')['only_in_malaysian']
    splits, origins = np.load(PREPARED / 'splits.npy'), np.load(PREPARED / 'origins.npy')
    is_malaysian = torch.from_numpy(origins[splits == SEALED] == MALAYSIAN)

    # Score both models over the same sealed photos in the same order
    reports = {}
    for label, model in (('frozen_head', frozen_model(name, dishes)), ('lora', trained_lora_model(name, dishes, settings))):
        mean, std = colour_settings(model)
        top, labels = predict_top(model, make_loader(PREPARED, SEALED, photo_transform(mean, std, training=False), settings), device)
        only_malaysian = torch.tensor([dishes[index] in only for index in labels.tolist()])
        reports[label] = sealed_report(top, labels, is_malaysian, only_malaysian)
        if label == 'lora':
            per_dish = {dish: top_k_accuracy(top[labels == index], labels[labels == index], 1) for index, dish in enumerate(dishes) if (labels == index).any()}
        del model
        torch.cuda.empty_cache()

    # Record the outcome, which also locks the sealed photos
    ships = 'lora' if reports['lora']['all_photos']['top1'] > reports['frozen_head']['all_photos']['top1'] else 'frozen_head'
    save_result('final.json', {'split': 'sealed', 'backbone': name, 'ships': ships, 'reports': reports, 'lora_top1_per_dish': dict(sorted(per_dish.items(), key=lambda item: item[1]))})
    print(json.dumps({'ships': ships, 'reports': reports}, indent=2), flush=True)


def export():
    """Export the model the sealed test chose, and check the phone's copy still agrees with it."""
    # Rebuild the shipped model as an ordinary ViT
    settings, dishes, outcome = Settings(), read_dishes(), read_result('final.json')
    name = outcome['backbone']
    model = merge_lora(trained_lora_model(name, dishes, settings)) if outcome['ships'] == 'lora' else frozen_model(name, dishes)
    mean, std = colour_settings(model)

    # Take validation photos, in a fixed order, for the agreement check
    loader = make_loader(PREPARED, VALIDATION, photo_transform(mean, std, training=False), Settings(batch_size=EXPORT_CHECK_PHOTOS, workers=0))
    pixels, labels = next(iter(loader))
    model.cpu().eval()
    with torch.no_grad():
        expected = model(pixels).topk(5, dim=1).indices

    # Write the full and small copies, and compare the small one against PyTorch
    with tempfile.TemporaryDirectory() as folder:
        full, small = Path(folder) / 'full.onnx', Path(folder) / 'small.onnx'
        export_onnx(model, full)
        quantise(full, small)
        top_one = torch.from_numpy(run_onnx(small, pixels.numpy())).topk(5, dim=1).indices
        write_web_files(small, dishes, mean, std)
        record = {'photos': EXPORT_CHECK_PHOTOS, 'full_mb': round(full.stat().st_size / 1e6, 1), 'small_mb': round(small.stat().st_size / 1e6, 1), 'same_first_guess': (top_one[:, 0] == expected[:, 0]).float().mean().item(),
                  'pytorch_top1': top_k_accuracy(expected, labels, 1), 'small_model_top1': top_k_accuracy(top_one, labels, 1), 'ships': outcome['ships']}
    save_result('export.json', record)
    print(record, flush=True)


# Every stage this script can run; a new one is one more entry here
STAGES = {'probe': probe, 'lora': lora, 'final': final, 'export': export}


if __name__ == '__main__':
    STAGES[sys.argv[1]](*sys.argv[2:])
