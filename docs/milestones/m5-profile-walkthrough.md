# M5 profile and adaptations walkthrough

8 Nov 2026, feat/ai-trainer. This is the B1/B2 implementation log; the rest of M5 remains separate.

## Storage and rule checkpoint

A profile holds only listed areas to avoid, seated-only, unable-to-pull-up/jump and an opt-in diabetes flag. Empty means nothing is inferred. Every confirmed change appends a snapshot. The profile store has a version key and unique operation-key index; the repository reads the latest version, checks the expected version and appends in one transaction. Retry returns the earlier operation; a key reused for different values is refused. Resetting later will append an empty profile rather than erase history.

Schema v5 appends one store/index step after v4. Export, erase and restore include every profile snapshot. Old backups without profiles receive an empty list. Validation checks every field, version continuity and unique operation keys before restore. The backup remains format 1 because old files still restore cleanly.

Adaptation checks happen in ineligibleReason, before search. Avoided areas require known load metadata; seated-only requires a known list containing only seated. Missing facts fail closed when a relevant adaptation is active. No filters are relaxed to fill a session. A tagged exercise is not a medical clearance.

Failing tests were run first. The profile/replay/conflict/restore tests, v4 meal upgrade and exhaustive body-area/seated sweeps pass with npm run check and the production build. The UI, importer metadata and client integration are not yet wired at this checkpoint; browser and phone verification remain pending.

Three original seated starter descriptions paraphrase basic movement facts from [NHS sitting exercises](https://www.nhs.uk/live-well/exercise/sitting-exercises/) (checked 8 Nov). No photos or weights were downloaded. Load tags are conservative project annotations, not NHS clinical approval. Their five-minute blocks are planning defaults, not exercise prescriptions.


## UI and metadata checkpoint

Me has an explicitly saved local profile draft, with both a keyboard-accessible body map and labelled area checkboxes. Nothing saves while toggling a control. Save appends a version; Clear draft still needs Save. The shell reloads confirmed settings after restore/erase and on window focus. A profile revision remounts Gym; Trainer also ignores stale in-flight replies when its profile changes.

Only typed Trainer form fields are sent; profile fields are never added to the request. The device checks proposed IDs against the profile. If a seated-only proposal contains no eligible movement, reviewed local seated starter cards are checked through the same rules. A service refusal is never replaced by that fallback. Ready-made days use the same ineligibleReason checks; an empty day stays empty and explains the filters.

The importer copies explicit annotations from data/exercises/adaptations.json; unlisted IDs retain null load/position facts. Starter tags use the same file. Saved exercise versions are not rewritten: old unknown tags cause exclusion only when a relevant adaptation needs them. Tags are conservative project metadata and do not certify medical suitability. Seated library positions do not imply that a wheelchair or a particular seat is suitable.

Opt-in diabetes display promotes carbohydrate, added sugar and fibre without hiding the original nutrients or changing totals. Meal rows keep unknown values null and show unknown, never zero; Gym has the care-team glucose-check note and no dosing or targets.

Tests cover explicit confirmation, local-only Trainer request fields, stale-reply rejection, body-area/seated combinations and profile-aware pack filtering. Browser and physical phone checks are still pending at this checkpoint.
