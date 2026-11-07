"""
Run the router experiment one step at a time, writing every number to results/.

    python -m router.run baselines   majority, keyword and TF-IDF on validation
    python -m router.run embed       cache frozen MiniLM vectors for train and validation
    python -m router.run head        train Yash's head at each learning rate, pick on validation
    python -m router.run final       the one sealed test run, then the ship decision
"""
import argparse
import json
import time
from pathlib import Path
from .baselines import fit_tfidf, keyword_rules, majority_label
from .data import LABELS, load_split
from .metrics import choose_threshold, macro_f1, report

# Every result is written here, so no number in the README is typed by hand
RESULTS = Path(__file__).resolve().parents[1] / 'results'
# The trained head's checkpoint stays outside Git (artifacts/checkpoints/ is ignored)
CHECKPOINT = Path(__file__).resolve().parents[3] / 'artifacts' / 'checkpoints' / 'router-head.pt'
# Messages per training batch for the head
BATCH_SIZE = 32


def save(name, result):
    """Write one result file and print it, so the console and the file always agree."""
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / name).write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))


def tfidf_with_threshold(train, validation):
    """Return the TF-IDF model, its strength and the confidence threshold chosen on validation."""
    model, strength = fit_tfidf(train, validation)
    probabilities = model.predict_proba(validation.texts)
    predicted = [model.classes_[row.argmax()] for row in probabilities]
    correct = [guess == label for guess, label in zip(predicted, validation.labels)]
    return model, strength, choose_threshold([float(row.max()) for row in probabilities], correct)


def tfidf_report(model, threshold, split):
    """Return the TF-IDF report on a split, abstaining below the threshold."""
    probabilities = model.predict_proba(split.texts)
    predicted = [model.classes_[row.argmax()] for row in probabilities]
    return report(split.labels, predicted, [float(row.max()) >= threshold for row in probabilities])


def baselines():
    """Report every baseline on validation; the test split stays sealed."""
    train, validation = load_split('train'), load_split('validation')
    majority = majority_label(train.labels)
    keyword = [keyword_rules(text) for text in validation.texts]
    model, strength, threshold = tfidf_with_threshold(train, validation)
    save('validation-baselines.json', {
        'split': 'validation', 'note': 'C and the threshold were chosen on this split, so these numbers are optimistic; the sealed test run is the fair one.',
        'majority': {'label': majority, **report(validation.labels, [majority] * len(validation.labels))},
        'keyword': report(validation.labels, [label for label, _ in keyword], [accepted for _, accepted in keyword]),
        'tfidf': {'C': strength, 'threshold': threshold, **tfidf_report(model, threshold, validation)},
    })


def embed():
    """Cache frozen MiniLM vectors for the training and validation messages."""
    import torch
    from .encoder import MODEL_REVISION, cached_vectors
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    texts = load_split('train').texts + load_split('validation').texts
    started = time.perf_counter()
    vectors = cached_vectors(texts, device=device)
    print(f'{len(texts)} messages, vectors {tuple(vectors.shape)}, revision {MODEL_REVISION}, {device}, {time.perf_counter() - started:.1f} s')


def loaders(train, validation):
    """Return training and validation loaders over cached vectors, using Yash's Dataset."""
    import torch
    from torch.utils.data import DataLoader
    from .encoder import cached_vectors
    from .train import VectorDataset, SEED
    indices = lambda split: [LABELS.index(label) for label in split.labels]
    shuffle = torch.Generator().manual_seed(SEED)
    return (DataLoader(VectorDataset(cached_vectors(train.texts), indices(train)), batch_size=BATCH_SIZE, shuffle=True, generator=shuffle),
            DataLoader(VectorDataset(cached_vectors(validation.texts), indices(validation)), batch_size=BATCH_SIZE))


def head():
    """Train the head at each learning rate, keep the best on validation, and save its checkpoint."""
    import torch
    from .encoder import MODEL_REVISION
    from .train import IntentHead, LEARNING_RATES, checkpoint, score, seed_all, train_model
    train, validation = load_split('train'), load_split('validation')
    runs = {}
    for learning_rate in LEARNING_RATES:
        # Start each learning rate from the same seed, so only the rate differs
        seed_all()
        train_loader, validation_loader = loaders(train, validation)
        model, started = IntentHead(), time.perf_counter()
        result = train_model(model, train_loader, validation_loader, learning_rate)
        model.load_state_dict(result['state_dict'])
        probabilities, labels = score(model, validation_loader)
        runs[learning_rate] = {'model': model, 'probabilities': probabilities, 'labels': labels, 'epochs': len(result['history']),
                               'seconds': time.perf_counter() - started, 'macro_f1': macro_f1(labels.tolist(), probabilities.argmax(dim=1).tolist())}

    # Keep the better learning rate on validation macro-F1; the smaller rate wins a tie
    best_rate = max(LEARNING_RATES, key=lambda rate: (runs[rate]['macro_f1'], -rate))
    best = runs[best_rate]
    predicted = best['probabilities'].argmax(dim=1).tolist()
    confidences = best['probabilities'].max(dim=1).values.tolist()
    threshold = choose_threshold(confidences, [guess == label for guess, label in zip(predicted, best['labels'].tolist())])
    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    torch.save(checkpoint(best['model'], best_rate, threshold, MODEL_REVISION), CHECKPOINT)
    save('validation-head.json', {
        'split': 'validation', 'chosen_learning_rate': best_rate, 'threshold': threshold,
        'trainable_parameters': sum(parameter.numel() for parameter in best['model'].parameters() if parameter.requires_grad),
        'by_learning_rate': {str(rate): {'macro_f1': run['macro_f1'], 'epochs': run['epochs'], 'seconds': round(run['seconds'], 2)} for rate, run in runs.items()},
        **report([LABELS[index] for index in best['labels'].tolist()], [LABELS[index] for index in predicted], [value >= threshold for value in confidences]),
    })


def final():
    """
    Run the sealed test split once for every model, with settings frozen on validation.

    The router ships only if the head beats both baselines on test macro-F1 with no
    critical error; otherwise the keyword rules stay, and the result is reported as it is.
    """
    import torch
    from .encoder import MODEL_REVISION, cached_vectors
    from .train import IntentHead, confusion_matrix, score, VectorDataset
    from torch.utils.data import DataLoader
    if (RESULTS / 'final.json').exists():
        raise SystemExit('The final test run already happened; its result is in results/final.json.')
    train, validation, test = load_split('train'), load_split('validation'), load_split('test', final=True)

    # Score the baselines with their validation settings
    keyword = [keyword_rules(text) for text in test.texts]
    model, strength, threshold = tfidf_with_threshold(train, validation)
    tfidf_predicted = list(model.predict(test.texts))

    # Score the saved head with its validation threshold
    saved = torch.load(CHECKPOINT)
    if saved['model_revision'] != MODEL_REVISION:
        raise SystemExit('The checkpoint was trained on vectors from a different model revision.')
    head_model = IntentHead()
    head_model.load_state_dict(saved['state_dict'])
    loader = DataLoader(VectorDataset(cached_vectors(test.texts), [LABELS.index(label) for label in test.labels]), batch_size=BATCH_SIZE)
    probabilities, labels = score(head_model, loader)
    head_predicted = [LABELS[index] for index in probabilities.argmax(dim=1).tolist()]
    head_report = report(test.labels, head_predicted, [value >= saved['threshold'] for value in probabilities.max(dim=1).values.tolist()])

    keyword_report = report(test.labels, [label for label, _ in keyword], [accepted for _, accepted in keyword])
    tfidf_test = tfidf_report(model, threshold, test)
    ships = head_report['macro_f1'] > max(keyword_report['macro_f1'], tfidf_test['macro_f1']) and head_report['critical_errors'] == 0
    save('final.json', {
        'split': 'test', 'labels': LABELS,
        'keyword': keyword_report, 'tfidf': {'C': strength, 'threshold': threshold, **tfidf_test},
        'head': {'learning_rate': saved['learning_rate'], 'threshold': saved['threshold'], **head_report,
                 'confusion_matrix': confusion_matrix(labels.tolist(), probabilities.argmax(dim=1).tolist())},
        'failures': [{'text': text, 'label': label, 'head': guess} for text, label, guess in zip(test.texts, test.labels, head_predicted) if guess != label],
        'ships': ships,
    })


# Run one named step from the command line
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Run one step of the router experiment.')
    parser.add_argument('step', choices=['baselines', 'embed', 'head', 'final'])
    {'baselines': baselines, 'embed': embed, 'head': head, 'final': final}[parser.parse_args().step]()
