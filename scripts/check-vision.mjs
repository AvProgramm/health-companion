import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Resolve the experiment folder independently of the invoking shell.
const root = fileURLToPath(new URL('../', import.meta.url));
const vision = join(root, 'experiments', 'vision');
const localPython = join(vision, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3';

// Run the vision tests on tiny fake data; without PyTorch (as in CI) they skip themselves.
const result = spawnSync(python, ['-W', 'ignore', '-m', 'unittest', 'discover', '-s', 'tests'], {
  cwd: vision, env: { ...process.env, PYTHONPATH: vision }, stdio: 'inherit',
});
if (result.error) console.error('Create the vision environment using experiments/vision/README.md.');
process.exit(result.status ?? 1);
