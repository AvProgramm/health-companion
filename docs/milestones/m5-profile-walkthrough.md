# M5 profile and adaptations walkthrough

8 Nov 2026, feat/ai-trainer. This is the B1/B2 implementation log; the rest of M5 remains separate.

## Storage and rule checkpoint

A profile holds only listed areas to avoid, seated-only, unable-to-pull-up/jump and an opt-in diabetes flag. Empty means nothing is inferred. Every confirmed change appends a snapshot. The profile store has a version key and unique operation-key index; the repository reads the latest version, checks the expected version and appends in one transaction. Retry returns the earlier operation; a key reused for different values is refused. Resetting later will append an empty profile rather than erase history.

Schema v5 appends one store/index step after v4. Export, erase and restore include every profile snapshot. Old backups without profiles receive an empty list. Validation checks every field, version continuity and unique operation keys before restore. The backup remains format 1 because old files still restore cleanly.

Adaptation checks happen in ineligibleReason, before search. Avoided areas require known load metadata; seated-only requires a known list containing only seated. Missing facts fail closed when a relevant adaptation is active. No filters are relaxed to fill a session. A tagged exercise is not a medical clearance.

Failing tests were run first. The profile/replay/conflict/restore tests, v4 meal upgrade and exhaustive body-area/seated sweeps pass with npm run check and the production build. The UI, importer metadata and client integration are not yet wired at this checkpoint; browser and phone verification remain pending.

Three original seated starter descriptions paraphrase basic movement facts from [NHS sitting exercises](https://www.nhs.uk/live-well/exercise/sitting-exercises/) (checked 8 Nov). No photos or weights were downloaded. Load tags are conservative project annotations, not NHS clinical approval. Their five-minute blocks are planning defaults, not exercise prescriptions.
