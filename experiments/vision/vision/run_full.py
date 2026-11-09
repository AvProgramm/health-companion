"""
Train the global model on every ISIA photo, and let fresh sealed photos decide if it replaces the phone's.

From experiments/vision:  python -m vision.run_full lora | final | export

LoRA trains exactly as the phone's model did, on about three times the photos, and is then
applied at half strength. The held-out comparison picked that strength (global_holdout.json),
and Yash confirmed it on 9 Nov.

The rule, fixed before any of these photos are read. The new model replaces the phone's only
if both of these hold; otherwise the phone keeps the model it has.

1. On the fresh sealed photos, the average of its top-1 on trained dishes and its top-1 on
   dishes no model trained on is higher than the phone model's, because that is the measure
   the strength was chosen by.
2. On the Malaysian validation photos, its top-1 is no more than five points below the phone
   model's, because that is what Yash actually eats, and five points is what half strength
   cost trained dishes in the held-out comparison.

The fresh photos cover ISIA's dishes only, because Food-101 and the Malaysian set have no
photos left that nobody has looked at, which is why the Malaysian check is on validation.
SigLIP2 alone and the new model at full strength are reported beside these and cannot ship.

Written by Claude Code at Yash's request on 9 Nov 2026, for him to cross-check.
"""
import json
import sys
from dataclasses import replace
import numpy as np
import torch
from .config import CHECKPOINTS, FULL_PREPARED, GLOBAL_SETTINGS, RESULTS
from .data import loader_over, make_loader, photo_transform
from .export import save_result
from .prepare import VALIDATION
from .prepare_full import FRESH_TRAINED, FRESH_UNSEEN
from .run import MALAYSIAN, read_result
from .run_global import READING_WORKERS, SIGLIP_MEAN, SIGLIP_STD, dishes_with_training_photos, group_scores, install_checked, lora as fine_tune, matcher_for, names_with_unseen, read_global_dishes, trained_matcher, unseen_report
from .train import predict_top
from .zero_shot import food_names

# The strength the held-out comparison picked, which Yash confirmed on 9 Nov
CHOSEN_STRENGTH = 0.5
# How far the new model may fall on Malaysian validation photos: what half strength cost trained dishes in the held-out comparison
MALAYSIAN_MARGIN = 0.05
# Where the corrections trained on every photo are kept
FULL_CHECKPOINT = CHECKPOINTS / 'global_full_lora.pt'
# The record of the fresh sealed test, which also locks it
FINAL_RECORD = 'global_full_final.json'
# The two versions the rule compares
NEW_MODEL, PHONE_MODEL = 'new_model_at_half_strength', 'phone_model'


def train():
    """Fine-tune on every photo of the full join, exactly as the phone's model was fine-tuned."""
    fine_tune(FULL_PREPARED, FULL_CHECKPOINT, 'global_full_lora.json')


def versions(device):
    """Return how to build every version compared, for any list of names."""
    return {'siglip2_alone': lambda names: matcher_for(names, device),
            PHONE_MODEL: lambda names: trained_matcher(names, device),
            NEW_MODEL: lambda names: trained_matcher(names, device, checkpoint=FULL_CHECKPOINT, strength=CHOSEN_STRENGTH),
            'new_model_at_full_strength': lambda names: trained_matcher(names, device, checkpoint=FULL_CHECKPOINT)}


def average_top1(report):
    """Return the measure the strength was chosen by, on the fresh sealed photos."""
    return (report['fresh_trained']['top1'] + report['never_trained']['top1']) / 2


def replaces_phone(new, phone, margin=MALAYSIAN_MARGIN):
    """Return whether the new model passes both halves of the rule."""
    return average_top1(new) > average_top1(phone) and new['malaysian_validation']['top1'] >= phone['malaysian_validation']['top1'] - margin


def centre_loader(split, settings):
    """Return a loader over the centre view of one split of the full join."""
    return make_loader(FULL_PREPARED, split, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)


def malaysian_loader(settings):
    """Return a loader over the centre view of the Malaysian validation photos."""
    labels, origins, splits = (np.load(FULL_PREPARED / f'{name}.npy') for name in ('labels', 'origins', 'splits'))
    positions = np.flatnonzero((splits == VALIDATION) & (origins == MALAYSIAN))
    return loader_over(FULL_PREPARED, positions, labels, photo_transform(SIGLIP_MEAN, SIGLIP_STD, training=False), settings)


def all_photos(name, top, labels):
    """Return the scores of one named group holding every photo given."""
    return group_scores(top, labels, {name: torch.ones_like(labels, dtype=torch.bool)})


def final():
    """Score the fresh sealed photos once, for every version, and record whether the new model replaces the phone's."""
    # Ignore a repeat run, because a second look would turn the fresh photos into tuning data
    if (RESULTS / FINAL_RECORD).exists():
        raise SystemExit('The fresh sealed test has already been run; see results/global_full_final.json.')

    # Read the names on offer: the phone's list, and the same list with the test dishes added
    settings, device, dishes = replace(GLOBAL_SETTINGS, workers=READING_WORKERS), 'cuda', read_global_dishes()
    test_dishes = json.loads((FULL_PREPARED / 'test_dishes.json').read_text(encoding='utf-8'))
    names = food_names(dishes)
    wide_names = names_with_unseen(names, test_dishes)
    position, trained = {name: index for index, name in enumerate(wide_names)}, dishes_with_training_photos(dishes, FULL_PREPARED)
    trained_photos, unseen_photos, malaysian_photos = centre_loader(FRESH_TRAINED, settings), centre_loader(FRESH_UNSEEN, settings), malaysian_loader(settings)

    # Score every version over the same photos
    reports = {}
    for label, build in versions(device).items():
        # Trained and Malaysian photos choose among the phone's names
        matcher = build(names)
        report = all_photos('fresh_trained', *predict_top(matcher, trained_photos, device)) | all_photos('malaysian_validation', *predict_top(matcher, malaysian_photos, device))

        # A dish known only by name must be on the list to be chosen
        top, labels = predict_top(build(wide_names), unseen_photos, device)
        reports[label] = report | unseen_report(top, labels, test_dishes, position, trained)
        print(label, reports[label], flush=True)
        torch.cuda.empty_cache()

    # Record the outcome, which also locks this test
    ships = replaces_phone(reports[NEW_MODEL], reports[PHONE_MODEL])
    averages = {label: average_top1(report) for label, report in reports.items()}
    save_result(FINAL_RECORD, {'names_on_offer': {'phone': len(names), 'with_test_dishes': len(wide_names)}, 'strength': CHOSEN_STRENGTH, 'malaysian_margin': MALAYSIAN_MARGIN, 'averages': averages, 'ships': ships, 'reports': reports})
    print(json.dumps({'ships': ships, 'averages': averages}, indent=2), flush=True)


def export():
    """Install the new model for the next web build, if it passed, and check the phone's copy agrees."""
    # Ignore a model that did not pass, because that decision was fixed before the sealed run
    if not read_result(FINAL_RECORD)['ships']:
        raise SystemExit('The fresh sealed test did not pass, so the phone keeps its current model.')

    device, names = 'cuda', food_names(read_global_dishes())
    install_checked(trained_matcher(names, device, attention='eager', checkpoint=FULL_CHECKPOINT, strength=CHOSEN_STRENGTH), names, FULL_PREPARED, 'global_full_export.json')


# Every stage this script can run; a new one is one more entry here
STAGES = {'lora': train, 'final': final, 'export': export}


if __name__ == '__main__':
    STAGES[sys.argv[1]]()
