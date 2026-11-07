/*
 * Block unsafe tool calls before they run (Claude Code PreToolUse hook).
 *
 * Reads the hook's JSON from stdin. Exit code 2 blocks the call and shows the
 * reason to Claude; exit 0 lets it run. The rules protect what this project
 * promises: private health data and secrets stay out of tools and out of Git,
 * and history is never rewritten.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Files that hold secrets or private data; .env.example is the one documented exception
const SECRET_PATHS = [
  { pattern: /(^|[\\/])\.env(\.(?!example$)[^\\/]*)?$/i, reason: 'environment files can hold API keys' },
  { pattern: /token[^\\/]*\.txt$/i, reason: 'token files hold credentials' },
  { pattern: /(^|[\\/])KEY\.txt$/i, reason: 'key files hold credentials' },
  { pattern: /(^|[\\/])private[\\/]/i, reason: 'private/ holds personal diary exports' },
  { pattern: /health-companion-backup-[^\\/]*\.json$/i, reason: 'backup files contain the real diary' },
];

// Shell commands that are never needed here and are hard to undo
const BLOCKED_COMMANDS = [
  { pattern: /\bgit\s+add\s+(-A|--all|\.(\s|$))/, reason: 'stage reviewed paths only (git add <paths>), so private files cannot slip in' },
  { pattern: /\bgit\s+commit\b[^\n]*\s-a\b/, reason: 'commit -a skips the staged-paths review' },
  { pattern: /\bgit\s+push\b[^\n]*\s(--force|-f)\b/, reason: 'force-pushing rewrites shared history' },
  { pattern: /--no-verify\b/, reason: 'checks must not be skipped' },
];

/**
 * Return the reason a tool call must be blocked, or null if it may run.
 */
export function blockReason(toolName, toolInput) {
  // Check file paths for the tools that read or write files
  const filePath = toolInput?.file_path ?? toolInput?.path ?? toolInput?.notebook_path;
  if (typeof filePath === 'string') {
    const secret = SECRET_PATHS.find((rule) => rule.pattern.test(filePath));
    if (secret !== undefined) {
      return `Blocked ${toolName} on ${filePath}: ${secret.reason}.`;
    }
  }

  // Check shell commands, including any secret paths they mention
  const command = toolInput?.command;
  if (typeof command === 'string') {
    const unsafe = BLOCKED_COMMANDS.find((rule) => rule.pattern.test(command));
    if (unsafe !== undefined) {
      return `Blocked command: ${unsafe.reason}.`;
    }
    const secret = SECRET_PATHS.find((rule) => command.split(/\s+/).some((word) => rule.pattern.test(word.replace(/^["']|["']$/g, ''))));
    if (secret !== undefined) {
      return `Blocked command: it touches a protected file (${secret.reason}).`;
    }
  }

  return null;
}

// Run as a hook only when executed directly, so the tests can import blockReason
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    // Ignore input that is not hook JSON; there is nothing to check
    process.exit(0);
  }

  const reason = blockReason(input.tool_name, input.tool_input);
  if (reason !== null) {
    console.error(reason);
    process.exit(2);
  }
}
