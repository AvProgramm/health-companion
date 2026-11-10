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

Current priorities: read `docs/handoff/codex-11-nov.md`. Photo uploads need a per-photo tap or the explicitly enabled, device-only automatic-photo setting; its default is off. Never send diary or saved profile data.


## New cloud direction (Yash, 10 Nov)

Yash now requests Firebase cloud storage and AI access to his own saved diary/profile for analysis. This authorises a change from the earlier local-only direction; read `docs/handoff/firebase-diary.md` (from the repo root) before implementing it. The configuration template is prepared, but auth, migration, cloud repositories and diary-aware AI are not implemented yet. Existing local data and current request boundaries remain in place until that tested path ships. No existing records may be erased as an implicit part of setup.


## Latest MVP decision (Yash, 10 Nov)

Frontend hosting: Vercel; backend: Render, planned for 11 Nov. The redundant Me-page Google sign-in card is removed; general multi-user sign-in is later work. Developer Firebase ownership does not authenticate visitors. A later database migration may use Render PostgreSQL rather than Firestore/vector storage; no migration is implemented now. The single interview entry point is `docs/milestones/interview-walkthrough.md`, replacing the three separate M8 interview scripts. Historical milestone records remain as provenance. Original code uses MIT with third-party notices. Yash confirmed Gemini Free Tier: diary sharing stays blocked at UI, client and server boundaries. Render/Vercel examples are preparation only; no deployment or billing change is authorised today.


## Beginner-readable refactoring rules

Read CLAUDE.md first in every new chat. Its latest architecture rules place screens in ui/pages, shared UI in ui/components and saving/loading/API work in data (API now data/api; persistence now data/storage). Check existing components/data first. Suggest a Git save point, change one folder at a time without behaviour changes, and confirm checks/build before continuing. Start app explanations with a 10-year-old-friendly folder map. The shared seven-day loader is now in data/diary/loadWeek.ts. Further organisation changes need their own verified checkpoint.
