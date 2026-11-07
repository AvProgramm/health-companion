import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Resolve the service folder independently of the invoking shell.
const root = fileURLToPath(new URL('../', import.meta.url));
const coach = join(root, 'services', 'coach');
const localPython = join(coach, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3';

// Run the same fictional provider tests locally and in CI.
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests'], {
  cwd: coach, env: { ...process.env, PYTHONPATH: coach }, stdio: 'inherit',
});
if (result.error) console.error('Install the coach environment using services/coach/README.md.');
process.exit(result.status ?? 1);
