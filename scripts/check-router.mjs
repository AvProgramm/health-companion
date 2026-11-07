import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Resolve the experiment folder independently of the invoking shell.
const root = fileURLToPath(new URL('../', import.meta.url));
const router = join(root, 'experiments', 'router');
const localPython = join(router, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3';

// Run the router tests; without PyTorch or scikit-learn (as in CI) only the plain-Python ones run.
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests'], {
  cwd: router, env: { ...process.env, PYTHONPATH: router }, stdio: 'inherit',
});
if (result.error) console.error('Create the router environment using experiments/router/README.md.');
process.exit(result.status ?? 1);
