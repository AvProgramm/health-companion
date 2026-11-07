/*
 * Tests for the PreToolUse guard; run with `node --test .claude/hooks`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockReason } from './guard-commands.mjs';

test('blocks reading secrets and private diary files', () => {
  assert.match(blockReason('Read', { file_path: 'C:/proj/.env' }), /API keys/);
  assert.match(blockReason('Read', { file_path: 'C:/Docs/github personal access token.txt' }), /credentials/);
  assert.match(blockReason('Read', { file_path: 'C:/Desktop/KEY.txt' }), /credentials/);
  assert.match(blockReason('Write', { file_path: 'private/export.json' }), /private/);
  assert.match(blockReason('Read', { file_path: 'Downloads/health-companion-backup-2026-11-09.json' }), /real diary/);
});

test('allows the documented example env file and ordinary source files', () => {
  assert.equal(blockReason('Read', { file_path: '.env.example' }), null);
  assert.equal(blockReason('Edit', { file_path: 'apps/web/src/domain/tokenise.ts' }), null);
  assert.equal(blockReason('Read', { file_path: 'docs/test-log.md' }), null);
});

test('blocks unsafe git commands', () => {
  assert.match(blockReason('Bash', { command: 'git add -A' }), /reviewed paths/);
  assert.match(blockReason('Bash', { command: 'git add .' }), /reviewed paths/);
  assert.match(blockReason('Bash', { command: 'git commit -a -m "x"' }), /staged-paths/);
  assert.match(blockReason('Bash', { command: 'git push --force origin main' }), /rewrites/);
  assert.match(blockReason('Bash', { command: 'git commit --no-verify -m "x"' }), /skipped/);
});

test('allows normal git and shell commands', () => {
  assert.equal(blockReason('Bash', { command: 'git add apps/web docs/test-log.md' }), null);
  assert.equal(blockReason('Bash', { command: 'git add .gitignore' }), null);
  assert.equal(blockReason('Bash', { command: 'git push -q' }), null);
  assert.equal(blockReason('Bash', { command: 'npm run check' }), null);
});

test('blocks shell commands that touch protected files', () => {
  assert.match(blockReason('Bash', { command: 'cat "C:/Users/User/Desktop/KEY.txt"' }), /protected file/);
  assert.match(blockReason('Bash', { command: 'type .env' }), /protected file/);
});
