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


## Final B1/B2 verification (8 Nov)

- Full npm run check passes: web/type/hook checks, 120 coach tests, 33 router tests and nine importer tests. Production build passes; the existing large exercise-chunk warning remains. No sealed evaluation, real training, weight download or photo download was run.
- Schema checklist: fresh upgrades from v1/v2/v3/v4 preserve meals; v3/v4 workout/sleep records and the v4 legacy exercise choice are preserved exactly. The main backup fixture now includes a profile alongside meals, revisions, foods, exercise choices, workout and sleep. Export/wipe/restore preserves them together; older backups receive no inferred profile.
- Profile tests cover retries, stale writes, operation-key collisions, competing confirmations, corrupt persisted facts and complete version histories. A bad stored profile is rejected, never silently converted to unrestricted settings.
- The independent body-area/seated sweep checks 1,536 combinations. A throwaway mutant disabling seated-only made those assertions fail; the original file was restored in a finally block and no mutant remains.
- Browser on localhost:4173: draft toggles did not affect Gym before Save; a confirmed seated-only/avoid-knees synthetic profile yielded only the seated arm movement. A reload retained the profile. The original three diary meals remained. Diabetes view showed carbs, added sugar and fibre first, preserving Unknown carbs/fibre and real-zero added sugar plus unknown coverage.
- At 375 px, the map, labelled controls and bottom dock render without horizontal overflow. Laptop layout also checked. With the preview server stopped, a cold reload still loaded the profile and generated the same seated plan. Preview was restarted. Synthetic test settings were cleared via a confirmed new empty version, without deleting history or changing meals.
- Trainer privacy and profile-change races were verified with mocked service requests in UI tests, not a new live model call. Packs retain hard filters and can honestly have no reviewed match. Physical phone gate for this change is NOT TESTED.

## Explain it back

Why is the profile a versioned list rather than one overwritten object? Why is the operation replay checked before the expected version? Why does unknown metadata fail only when the active restriction needs that fact? Why must every required position be seated, rather than accepting any list which contains seated? Why is the profile checked after the Trainer reply rather than copied into its prompt? Why must a late reply be discarded after a profile change?

## Phone check

Reload twice on the same localhost:4173 origin and confirm the old diary first. In Me, toggle a draft and leave without saving: Gym must stay unchanged. Save a test seated/avoid-area profile, then check manual plans and ready-made days. A blocked or unknown movement must not appear to fill time. Verify the Trainer reply is adapted on-device, including an honest no-plan if needed. Enable diabetes priorities and check Unknown values and hidden-number mode. Close/reopen in airplane mode after caching. Download a private backup; use a separate test browser for restore. Clear test settings with Save afterwards.

B1/B2 are implemented. B5 Nutritionist, C1–C6 dish-photo work and the remaining M5/M6 documentation are still separate outstanding work in codex-m5.md. The logged-data-sharing decision remains Yash's; no diary/profile sharing was added. This does not claim all of Milestone 5 is complete.
