"""
Measure what fine-tuning costs the dishes it never saw, on validation photos only.

From experiments/vision:  python -m vision.run_holdout

Some dishes are kept out of training altogether, photos and name, so each one is known the
way a new food would be: by its name alone. Every Malaysian-only dish is among them, to show
what photos of a local dish are worth, along with a random share of the other dishes.

Three ways of fine-tuning are trained on the remaining dishes: LoRA as in the Week 10 lecture,
only the LayerNorms, and both. FIT3181's BatchNorm fix protected a CNN's running statistics
while it fine-tuned, but a vision transformer has no BatchNorm and no running statistics, so
the nearest thing to try is letting its normalisation layers learn.

The rule, fixed before the run. The next full training uses whichever fine-tuned version has
the highest average of top-1 on trained dishes and top-1 on held-out dishes. LoRA at full
strength stays unless another version beats it by at least one point, because a smaller gap
on validation does not justify changing method. Malaysian dishes are reported on their own
and do not count, because eight dishes are too few to choose by. No sealed photo is read here,
and nothing here reaches the phone.

Written by Claude Code at Yash's request on 9 Nov 2026, for him to cross-check.
"""
import json
import random
from dataclasses import replace
import numpy as np
import torch
from torch import nn
from .config import CHECKPOINTS, GLOBAL_PREPARED, GLOBAL_SETTINGS, SEED
from .data import loader_over, make_loader, photo_transform
from .export import save_result
from .lora import add_lora, set_lora_strength
from .prepare import TRAIN, VALIDATION
from .run import read_result
from .run_global import SIGLIP_MEAN, SIGLIP_STD, dishes_with_training_photos, group_scores, matcher_for, read_global_dishes, versions, with_names
from .train import predict_top, seed_all, train_lora
from .zero_shot import food_names, readable

# Share of the other trained dishes kept out of training, enough to score without starving it
HELD_OUT_SHARE = 0.15
# How far another version must beat LoRA at full strength to replace it
CLEARLY_BETTER = 0.01
# The method in use today, which stays unless something is clearly better
CURRENT_VERSION = 'lora at strength 1.0'
# Reported beside the rest but never chosen: one saw the held-out dishes, the other is not fine-tuned
REFERENCES = {'shipped_model', 'siglip2_alone'}
# Few workers for the loaders that only read centre crops, because many workers can exhaust the Windows page file
READING_WORKERS = 4


def free_norms(matcher):
    """Let every LayerNorm in the transformer blocks learn, and return the model."""
    for block in matcher.blocks:
        for module in block.modules():
            if isinstance(module, nn.LayerNorm):
                module.requires_grad_(True)
    return matcher


# Each way of fine-tuning compared: how it is applied to a fresh matcher
WAYS = {
    'lora': lambda matcher, settings: add_lora(matcher, settings.rank, settings.alpha, train_head=False),
    'norm': lambda matcher, settings: free_norms(matcher.requires_grad_(False)),
    'lora_and_norm': lambda matcher, settings: free_norms(add_lora(matcher, settings.rank, settings.alpha, train_head=False)),
}
# Strengths each way is measured at, where 1 is as trained; scaling needs no retraining, and only pure LoRA scales cleanly
STRENGTHS = {'lora': [1.0, 0.75, 0.5, 0.25], 'norm': [1.0], 'lora_and_norm': [1.0]}


def held_out_dishes(trained, always, share=HELD_OUT_SHARE, seed=SEED):
    """Return the dishes kept out of training: those always held out, and a random share of the rest."""
    others = sorted(set(trained) - set(always))
    return set(always) | set(random.Random(seed).sample(others, round(share * len(others))))


def kept_names_and_lookup(dishes, held_out):
    """Return the names still trained, and each dish's position among them, or -1 if held out."""
    kept = [dish for dish in dishes if dish not in held_out]
    position = {dish: index for index, dish in enumerate(kept)}
    return kept, np.array([position.get(dish, -1) for dish in dishes], dtype=np.int32)


def kept_positions(labels, splits, split, lookup):
    """Return which photos of one split show a dish that is still being trained."""
    return np.flatnonzero((splits == split) & (lookup[labels] >= 0))


def kept_loaders(lookup, settings):
    """Return the training and validation loaders over the kept dishes, labelled by their new positions."""
    labels, splits = np.load(GLOBAL_PREPARED / 'labels.npy'), np.load(GLOBAL_PREPARED / 'splits.npy')
    new_labels = lookup[labels]
    train = loader_over(GLOBAL_PREPARED, kept_positions(labels, splits, TRAIN, lookup), new_labels, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=True), settings, training=True)
    validation = loader_over(GLOBAL_PREPARED, kept_positions(labels, splits, VALIDATION, lookup), new_labels, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), replace(settings, workers=READING_WORKERS))
    return train, validation


def norm_counts(matcher):
    """Return how many BatchNorm layers the ViT has, and how many weights the LayerNorms in its blocks hold."""
    batch_norms = sum(isinstance(module, nn.modules.batchnorm._BatchNorm) for module in matcher.vision.modules())
    layer_norms = [module for block in matcher.blocks for module in block.modules() if isinstance(module, nn.LayerNorm)]
    return {'batch_norm_layers': batch_norms, 'block_layer_norm_weights': sum(parameter.numel() for module in layer_norms for parameter in module.parameters())}


def trained_way(way, kept, loaders, settings, device):
    """Return a matcher fine-tuned this way on the kept dishes and its record, reusing a finished run."""
    seed_all()
    matcher = WAYS[way](matcher_for(kept, device), settings)
    print(way, 'trainable', sum(parameter.numel() for parameter in matcher.parameters() if parameter.requires_grad), flush=True)

    # Keep each finished run, so a crash three hours in loses only the run it interrupted
    path = CHECKPOINTS / f'holdout_{way}.pt'
    if not path.exists():
        torch.save(train_lora(matcher, *loaders, settings, device, report=lambda line: print(way, line, flush=True)), path)
    record = torch.load(path, weights_only=True)
    matcher.load_state_dict(record.pop('state_dict'))
    return matcher, record


def photo_groups(labels, dishes, held_out, malaysian):
    """Return which photos belong to each group: by what happened to their dish, and each Malaysian dish alone."""
    photo_dishes = [dishes[value] for value in labels.tolist()]

    def showing(wanted):
        """Return which photos show one of these dishes."""
        return torch.tensor([dish in wanted for dish in photo_dishes])

    groups = {'trained': ~showing(held_out), 'held_out': showing(held_out - malaysian), 'malaysian_held_out': showing(malaysian)}
    return {**groups, **{f'dish: {dish}': showing({dish}) for dish in sorted(malaysian)}}


def average_top1(report):
    """Return the average of top-1 on trained dishes and on held-out dishes, the figure the rule reads."""
    return (report['trained']['top1'] + report['held_out']['top1']) / 2


def best_version(reports):
    """Return the version the next training should use, which is today's unless another is clearly better."""
    candidates = {label: average_top1(report) for label, report in reports.items() if label not in REFERENCES}
    winner = max(candidates, key=candidates.get)
    return winner if candidates[winner] >= candidates[CURRENT_VERSION] + CLEARLY_BETTER else CURRENT_VERSION


def main():
    """Train each way on the kept dishes, then score every version on every validation photo."""
    settings, device, dishes = GLOBAL_SETTINGS, 'cuda', read_global_dishes()

    # Decide what is held out, once, before anything trains
    malaysian = {readable(dish) for dish in read_result('prepare.json')['only_in_malaysian']}
    held_out = held_out_dishes(dishes_with_training_photos(dishes), malaysian)
    kept, lookup = kept_names_and_lookup(dishes, held_out)
    loaders = kept_loaders(lookup, settings)

    # Score against every name the phone knows, as the compare stage did
    names = food_names(dishes)
    photos = make_loader(GLOBAL_PREPARED, VALIDATION, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), replace(settings, workers=READING_WORKERS))

    def score(matcher):
        """Return the group scores of this matcher over every validation photo, and free the GPU after."""
        top, labels = predict_top(matcher, photos, device)
        torch.cuda.empty_cache()
        return group_scores(top, labels, photo_groups(labels, dishes, held_out, malaysian))

    def record(extra):
        """Write what is known so far, so a crash cannot lose a finished comparison."""
        save_result('global_holdout.json', {'split': 'validation', 'names': len(names), 'trained_dishes': len(kept), 'held_out_dishes': sorted(held_out - malaysian), 'malaysian_held_out': sorted(malaysian), **extra})

    # Score the references first: SigLIP2 alone, and the shipped model, which did train on these dishes
    builds = versions(device)
    reports = {'siglip2_alone': score(builds['siglip2_alone'](names)), 'shipped_model': score(builds['siglip2_lora'](names))}
    counts = norm_counts(matcher_for(kept[:1], device))
    print(counts, json.dumps(reports['shipped_model']['trained']), flush=True)

    # Train each way, then measure it at each strength
    training = {}
    for way, strengths in STRENGTHS.items():
        matcher, finished = trained_way(way, kept, loaders, settings, device)
        training[way] = {'trainable_weights': sum(parameter.numel() for parameter in matcher.parameters() if parameter.requires_grad), **finished}
        for strength in strengths:
            set_lora_strength(matcher, settings.alpha, strength)
            reports[f'{way} at strength {strength}'] = score(with_names(matcher.vision, names, device))
            record({'layers': counts, 'training': training, 'reports': reports})
        del matcher
        torch.cuda.empty_cache()

    # Apply the rule fixed before the run, and record which version it picked
    chosen = best_version(reports)
    record({'layers': counts, 'training': training, 'chosen_for_next_training': chosen, 'average_top1': {label: average_top1(report) for label, report in reports.items()}, 'reports': reports})
    print(json.dumps({'chosen': chosen, 'averages': {label: round(average_top1(report), 4) for label, report in reports.items()}}, indent=2), flush=True)


if __name__ == '__main__':
    main()
