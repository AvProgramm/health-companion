"""Check the runner end to end on a stand-in split, without reading the sealed test families."""
import contextlib
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from router.data import LABELS, load_families, load_split

# The runner needs PyTorch and scikit-learn, which are only installed in the router environment
HAS_PACKAGES = all(importlib.util.find_spec(name) is not None for name in ('torch', 'sklearn'))


def text_seed(text):
    """Return a fixed integer for a message, so its fake vector is the same every run."""
    return int(hashlib.sha256(text.encode('utf-8')).hexdigest()[:8], 16)


def noise_vectors(texts, **_):
    """Return one fixed random unit vector per message, carrying no class information."""
    import torch
    rows = [torch.randn(384, generator=torch.Generator().manual_seed(text_seed(text))) for text in texts]
    return torch.nn.functional.normalize(torch.stack(rows), dim=1)


def label_vectors(texts, **_):
    """Return unit vectors clustered by each message's true label, so a head can learn them exactly."""
    import torch
    index = {text: LABELS.index(family['label']) for family in load_families() for text in family['utterances']}
    centres = torch.randn(len(LABELS), 384, generator=torch.Generator().manual_seed(0))
    rows = [centres[index[text]] + 0.01 * torch.randn(384, generator=torch.Generator().manual_seed(text_seed(text))) for text in texts]
    return torch.nn.functional.normalize(torch.stack(rows), dim=1)


@unittest.skipUnless(HAS_PACKAGES, 'PyTorch and scikit-learn are only installed in the router environment')
class RunnerTests(unittest.TestCase):
    """Run head and final with temporary result files and validation standing in for test."""

    def setUp(self):
        """Point the runner at a temporary folder and swap the sealed split for validation."""
        from router import run
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.folder = Path(folder.name)
        self.run = run
        self.requested = []

        def stand_in(name, final=False):
            """Record each request, and answer a request for test with the validation split."""
            self.requested.append((name, final))
            return load_split('validation' if name == 'test' else name)

        for patcher in (patch.object(run, 'RESULTS', self.folder), patch.object(run, 'CHECKPOINT', self.folder / 'head.pt'), patch.object(run, 'load_split', stand_in)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def steps(self, vectors, *names):
        """Run the named steps quietly, with fake sentence vectors."""
        with patch('router.encoder.cached_vectors', vectors), contextlib.redirect_stdout(io.StringIO()):
            for name in names:
                getattr(self.run, name)()

    def result(self, name):
        """Return one result file from the temporary folder."""
        return json.loads((self.folder / name).read_text(encoding='utf-8'))

    def test_a_head_that_wins_ships_and_final_runs_once(self):
        """Mark a perfect head to ship, report it fully, and refuse a second final run."""
        self.steps(label_vectors, 'head', 'final')
        final = self.result('final.json')
        self.assertTrue(final['ships'])
        self.assertEqual(final['head']['macro_f1'], 1.0)
        self.assertEqual(final['failures'], [])
        self.assertEqual(sum(final['head']['confusion_matrix'][row][row] for row in range(len(LABELS))), final['head']['messages'])
        self.assertGreater(final['head']['macro_f1'], final['keyword']['macro_f1'])
        self.assertEqual(self.result('validation-head.json')['trainable_parameters'], 2310)
        # The test split is only ever asked for by the final step, and only with final=True
        self.assertEqual([request for request in self.requested if request[0] == 'test'], [('test', True)])
        with self.assertRaises(SystemExit):
            self.steps(label_vectors, 'final')

    def test_a_head_with_no_signal_does_not_ship(self):
        """Keep the baseline when the head cannot beat it, and list what it got wrong."""
        self.steps(noise_vectors, 'head', 'final')
        final = self.result('final.json')
        self.assertFalse(final['ships'])
        self.assertGreater(len(final['failures']), 0)

    def test_final_refuses_a_head_trained_on_another_model_revision(self):
        """Stop when the saved head and the current vectors come from different weights."""
        import torch
        self.steps(noise_vectors, 'head')
        saved = torch.load(self.folder / 'head.pt')
        saved['model_revision'] = 'another-commit'
        torch.save(saved, self.folder / 'head.pt')
        with self.assertRaises(SystemExit):
            self.steps(noise_vectors, 'final')


if __name__ == '__main__':
    unittest.main()
