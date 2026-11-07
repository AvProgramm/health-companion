/*
 * Run the fast checks (typecheck and tests) after a code edit.
 *
 * Used two ways:
 * - As a Claude Code PostToolUse hook: the hook's JSON arrives on stdin, and the
 *   checks only run when the edited file can change a diary total.
 * - With --all, from a terminal or CI: the checks always run.
 * Exit code 2 tells Claude Code the check failed and shows it the message.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repository root, found from this file so the current directory never matters
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps', 'web');

// Edits under these folders can change a diary total, so they trigger the checks
const WATCHED = ['apps/web/src/domain/', 'apps/web/src/storage/', 'eval/fixtures/'];

// Keep the failure message short enough for Claude to read in one go
const MAX_OUTPUT_LINES = 40;

/**
 * Return the edited file path from the hook's JSON on stdin, or null if there is none.
 */
function editedPath() {
  // Ignore an interactive terminal, which has no hook JSON to read
  if (process.stdin.isTTY) {
    return null;
  }
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    return input?.tool_input?.file_path ?? null;
  } catch {
    return null;
  }
}

/**
 * Return true if the path is inside one of the watched folders.
 */
function isWatched(filePath) {
  // Compare with forward slashes, since Windows paths arrive with backslashes
  const fromRoot = relative(ROOT, resolve(filePath)).split('\\').join('/');
  return WATCHED.some((folder) => fromRoot.startsWith(folder));
}

/**
 * Run one Node script inside apps/web and return whether it passed, with its output.
 */
function runCheck(label, scriptAndArgs) {
  // Run the tools through Node itself, so no shell or .cmd wrapper is involved
  const result = spawnSync(process.execPath, scriptAndArgs, { cwd: WEB, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { label, passed: result.status === 0, output };
}

const runAll = process.argv.includes('--all');

// Skip quietly when the hook fired for a file that cannot change a total
if (!runAll) {
  const filePath = editedPath();
  if (filePath === null || !isWatched(filePath)) {
    process.exit(0);
  }
}

const checks = [
  runCheck('Typecheck', [join(WEB, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', WEB]),
  runCheck('Tests', [join(WEB, 'node_modules', 'vitest', 'vitest.mjs'), 'run']),
];

const failed = checks.filter((check) => !check.passed);

// Report every failing check with the tail of its output, then exit with 2
if (failed.length > 0) {
  for (const check of failed) {
    const tail = check.output.split('\n').slice(-MAX_OUTPUT_LINES).join('\n');
    console.error(`${check.label} failed:\n${tail}\n`);
  }
  process.exit(2);
}

console.log(`Checks passed: ${checks.map((check) => check.label).join(', ')}.`);
