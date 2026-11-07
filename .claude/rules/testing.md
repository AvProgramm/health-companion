---
paths:
  - "apps/web/src/**/*.test.ts"
  - "eval/fixtures/**"
---

# Testing

- Golden totals come from `eval/fixtures/ledger_golden.json`, read through `src/domain/goldenFixture.ts`. Never recompute an expected value with the code under test; the fixture is the independent reference, like the oracle checks in Yash's FIT3080 `test_q1.py`.
- Compare floats with `toBeCloseTo(value, 9)`. Rounding belongs to the UI, so tests check unrounded values.
- Every bug fix starts with a failing test that uses the exact input that broke. Label phone-reported cases with a comment ("Typed on the phone on 7 Nov").
- Storage tests use `fake-indexeddb` with a fresh `IDBFactory` per test, so no test sees another's data.
- Test the failure paths as well as the happy path: non-finite numbers, incompatible units, stale revisions, replayed operation keys and rolled-back transactions.
- Fixtures are fictional. Never put Yash's real meals, weights or health notes in a test or fixture.
