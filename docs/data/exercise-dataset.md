# Offline exercise dataset

Source: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db/tree/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5), revision `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` (licence checked 7 Nov 2026). Its [Unlicense](https://github.com/yuhonas/free-exercise-db/blob/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/LICENSE.md) dedicates the work to the public domain and permits copying, modifying and distributing it without warranty. The original licence is retained beside the vendored JSON. No source images are bundled; the app draws its own SVG target illustrations.

The 876 source records are vendored under `data/exercises/free-exercise-db/`. SHA-256:

- exercises.json: `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`
- LICENSE.md: `6b0382b16279f26ff69014300541967a356a666eb0b91b422f6862f6b7dad17e`

`node scripts/import-exercises.mjs` verifies both hashes and generates `apps/web/src/data/exercise-index.json`. The web prebuild runs it with no network access. Update the revision, hashes and this note together after reviewing a future source change.

Mapping is conservative. Explicit leg/core muscles map to those categories; recognised upper-body muscles use the source push/pull force. Body-only, dumbbell and bands map to existing planner equipment. Other equipment stays null and searchable but cannot be added yet. Capability requirements always remain null because the source does not encode them. The person must check equipment and capabilities before adding a card; unchecked requirements become an explicit reviewed empty list only after confirmation. This is not an injury assessment. The editable five-minute block is a planning default, not a duration measured by the dataset.

Search uses the local index only. The separate library chunk is included in the existing service-worker precache. No search text, chosen exercise or diary entry goes to a provider. Only the eight reviewed starter cards plus at most 24 explicitly chosen cards enter the exhaustive planner. Unsupported equipment support, safety-reviewed capability tags and injury/seated rules remain later work; Yash owns the latter rules.
