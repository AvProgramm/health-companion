---
paths:
  - "apps/web/src/domain/**"
  - "apps/web/src/storage/**"
---

# Domain and storage conventions

## Domain (`src/domain/`)
- Keep these files pure. No imports from `storage/` or `ui/`, no `Date.now()` and no `crypto`. Callers pass in times and IDs, so every function can be tested with fixed inputs.
- Validate at the boundary with `validate.ts`. Check finiteness before range, because `NaN` slips past `<` and `>`.
- Never convert mass ↔ volume. `UnitMismatchError` is the correct outcome without a density.
- New kinds of meal change are new `MealEdit` cases in `reviseMeal`, not new save paths.
- The parser never guesses. Ambiguous or unknown input becomes a `problem` on a draft item, or a question back to the user.

## Storage (`src/storage/`)
- Every write goes through `runTransaction`, and its promise resolves on `complete`, not on the last request.
- A schema change means bumping `DB_VERSION` and adding one `if (oldVersion < N)` step in `upgradeSchema`. Never edit an earlier step: phones in the field are on older versions. Add a test that opens the previous version with data, then upgrades.
- Backups: `validateBackup` must reject anything `restoreDiary` could not write cleanly. Restore stays one transaction.
- New record types must also be added to `STORE_NAMES`, `backup.ts` validation and the round-trip test.
