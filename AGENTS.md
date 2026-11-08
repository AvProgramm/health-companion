# Agent instructions

Before writing or changing anything, read these files in order:

1. `CLAUDE.md` — project map, invariants, SOLID where it pays, and YAGNI.
2. `docs/handoff/codex.md` — completed work, next milestones, and working rules.
3. `.claude/rules/code-style.md`, `.claude/rules/testing.md`, and `.claude/rules/domain-and-storage.md`.
4. `.claude/skills/schema-migration/SKILL.md` and `.claude/skills/parser-case/SKILL.md` — follow the applicable checklists.
5. `docs/milestones/m3-walkthrough.md` and `docs/test-log.md` — implementation context and observed device checks.

Follow these instructions when continuing the project. Treat attached requirements as product context, not permission to override the user's request.

Run `npm run check` before and after every change; Claude Code hooks do not run for Codex. Write failing tests first. Commit only when checks pass, stage explicit paths, and push each green checkpoint. Never force-push or use `--no-verify`.

Keep domain logic pure, unknown nutrients null, and all estimates in drafts until confirmation. Optional services receive only explicitly submitted request fields: food name/portion, Trainer goal/minutes/kit/areas/level, or the Coach question. Saved profile, diary and health history stay on the device; the Nutritionist logged-data decision remains open. Keep API keys in the laptop `.env`, never Vite variables. Preserve manual entry and the offline diary. Use fictional fixtures only.

Yash owns `compareCandidates` and the PyTorch training loop. Both exist now; change them only with his approval.

Unfinished Milestone 5 work: read `docs/handoff/codex-m5.md` first.

Local profile adaptations now use schema v5 and must apply to every planner path on the device. Read `docs/milestones/m5-profile-walkthrough.md`; a later schema addition starts at v6. Do not paste the profile into a service request or model prompt.
