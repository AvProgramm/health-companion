# Milestone M3a: nutrition proposals with confirmation

## Explain the flow

The composer still uses the deterministic parser. An unknown food row offers an optional lookup with editable food name and portion text. `api/estimate.ts` explicitly constructs a two-field request; neither a diary object nor browser credentials are sent.

The laptop endpoint rejects extra fields. `providers.py` handles network calls, `databases.py` handles published records/averages, `models.py` checks shapes and ranges, and `pipeline.py` chooses database first, Groq second. Provider failures leave manual entry available. `.env` is read only by Python.

`domain/nutrition/estimates.ts` independently validates the response in the browser. It is pure: IDs come from the caller, and it imports no UI/storage code. `EstimateDraft` holds the proposal in React state. Only Use estimate calls the existing food-save path. That saves a versioned food, not a meal. Save meal remains the separate, explicit diary confirmation.

Edit seeds `FoodEditor`. Saving manual values clears the model/database attribution and range and marks the food as a user estimate. Editing a previously unknown saved food keeps its identity and creates its next version; earlier meals keep their exact food version.

Log with unknown values saves an all-null food after that explicit tap, then fills the draft with one piece. Adjust the serving before saving the meal. Later, compose that saved unknown food again to obtain an estimate. To apply the new version to an older meal, open Change → Replace and choose the updated food. Do not save a duplicate meal just to update its nutrition.

## Numbers and persistence

`FoodVersion` adds optional per-nutrient ranges and database/AI source kinds. Aggregation scales low/high with the same unit conversion and eaten fraction as the centre. Exact items contribute equally to both bounds. Unknown items remain a separate count; no rounding enters storage or domain logic. The display adds ≈ and the combined range. A spread describes variation among matches, not statistical confidence.

No new stores or indexes were needed. Schema version 3 and backup format remain unchanged: older foods omit the optional fields, and new ranges are validated and tested through export → wipe → restore. Meal revisions, transaction semantics, undo and conflicts keep their existing paths. The service worker already excludes `/api` and POSTs.

## Verification and remaining gates

Automated checks cover provider response parsing, database averages/spreads, incompatible units, malformed records, strict LLM output, database-first selection, timeouts, HTTP adapter fallback, food-only payloads, draft confirmation, edit/manual paths, hidden numbers, unavailable laptop behaviour, deferred unknown foods, range totals and backup compatibility.

The production build passes. A live Open Food Facts lookup was accepted in the browser, saved as a meal, and survived reload with its approximate day totals. A first provider timeout displayed the fallback; retry succeeded. The Groq HTTP path is tested with fictional transport responses; a live Groq request awaits Yash's key. Live USDA access awaits its optional key. Phone observations belong in `docs/test-log.md`, not inferred from browser tests.

Interview prompts: why are unknown nutrients null? Why does an estimate not save a meal? Why validate the same JSON on both sides? Why does the range scale when a portion changes? Why can the diary work with no Python service? Why are counts not automatically grams?

Visual redesign, signup/security, diet rules, photos, planner comparison and the training loop remain later milestones. Yash owns `compareCandidates` and the training loop.
