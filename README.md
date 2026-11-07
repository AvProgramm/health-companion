# Health Companion

A free, local-first diary for balancing food, exercise and sleep. It remembers what you logged, accepts corrections, and shows what it knows versus what it estimated.

Private pilot. Every fixture in `eval/fixtures/` is fictional. Yash will rewrite this README in his own words before the demo.

## Run
```bash
npm --prefix apps/web install
npm run check
npm --prefix apps/web run build
npm --prefix apps/web run preview
```
For phone setup and the offline test, see `docs/test-log.md`.

## How the repository is organised for AI-assisted work
Claude Code reads the files below, so project knowledge, rules and safety checks live in the repo instead of in one chat.

```
CLAUDE.md                     project overview, invariants, working rules (loaded every session)
CLAUDE.local.md               personal machine notes (git-ignored)
.claude/
├── settings.json             permissions (deny secrets) + hook wiring
├── rules/                    path-scoped guidance, loaded when matching files are touched
│   ├── code-style.md         Yash's FIT3080 comment voice
│   ├── testing.md            golden fixtures as the independent oracle
│   └── domain-and-storage.md purity, transactions, migrations
├── commands/                 repeatable workflows as slash commands
│   ├── phone-gate.md         /phone-gate N: build, serve, guide and log the phone test
│   └── walkthrough.md        /walkthrough N: write the milestone explain-back doc
├── skills/                   loaded automatically when the task matches
│   ├── parser-case/          misread phrase → exact failing test → smallest grammar fix
│   └── schema-migration/     DB version bump without losing data on the phone
├── agents/                   sub-agents with their own context and read-only tools
│   ├── invariant-reviewer.md checks diffs against the diary invariants
│   └── privacy-auditor.md    checks for personal data, secrets, network calls
└── hooks/
    ├── guard-commands.mjs    PreToolUse: blocks secret files, git add -A, force-push, --no-verify
    ├── check-changed.mjs     PostToolUse: typecheck + tests after edits to domain/storage/fixtures
    └── guard-commands.test.mjs
.github/workflows/check.yml   runs the same check-changed.mjs in CI, because local hooks can be bypassed
```
`.mcp.json` arrives with the coach milestone, when the MCP tools server (`search_evidence`, `get_demo_day`) exists. Configuring a server that doesn't exist yet would only produce startup errors.

## Who wrote what
See `docs/ai-log.md`. Milestone walkthroughs are in `docs/milestones/`.
