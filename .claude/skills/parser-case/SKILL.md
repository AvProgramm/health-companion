---
name: parser-case
description: Use when the composer misreads something Yash typed, for example a screenshot of a draft showing a food called "milk actually 300ml", or when adding a new phrasing the grammar should understand. Turns the exact phrase into a failing test, then fixes apps/web/src/domain/parse.ts without making the parser guess.
---

# Fixing a misread phrase

The parser is a deterministic grammar, not a model. It may understand more phrasings, but it must never guess a food or an amount.

1. **Copy the phrase exactly** as typed, including typos and missing spaces ("no actually250 ml"). Do not tidy it.
2. **Write the failing test first** in `apps/web/src/domain/parse.test.ts`. Add the comment `// Typed on the phone on <date>` and assert the full `itemsOf(...)` result: food, quantity and problem. Run `npm run check` and confirm it fails for the expected reason.
3. **Find the stage that misread it**:
   - `parseQuestion`: question words and nutrient words.
   - `parseCorrection`: the `CORRECTION_LEAD` / `CHANGE_TARGET` patterns at the start of the text.
   - `parseMeal`: `ITEM_SEPARATOR` splitting, and joining a split-off correction back onto its item.
   - `readCorrectedAmount` / `INLINE_CORRECTION`: "… actually 300ml" inside one item.
   - `readLeadingAmount`: numbers, number words and unit spellings.
   - `findFoods` in `foods.ts`: names, aliases and plurals.
4. **Make the smallest change** in that stage. Comment any new pattern with an example of what it matches and what it must not match.
5. **Add a "must not match" test** next to the fix, e.g. "nothing" is not "no", and "black coffee no sugar" is not a correction.
6. Run `npm run check`, rebuild, and tell Yash to reload the phone twice.

If a phrase needs real language understanding (typos in food names, "the usual", "same as yesterday"), say it belongs to the planned intent router or an AI draft-filler, and that whatever fills the draft, the user still confirms it before anything saves. Do not stretch the grammar to cover it.
