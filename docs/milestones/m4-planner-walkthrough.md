# Milestone 4 (part 1): the workout planner (FIT3080)

"I have 12 minutes, dumbbells, and I can't do pull-ups. What should I do?" The planner answers with one checked session, or an honest "no plan".

## 1. A small, reviewed catalogue
[catalogue.ts](../../apps/web/src/domain/training/catalogue.ts) has eight cards. Each has a category, minutes, the equipment it needs, the abilities it requires, and a cue. A plan can only be made of these cards: nothing is generated, so nothing unsafe or invented can appear.

## 2. Hard filters first, never relaxed
[eligibility.ts](../../apps/web/src/domain/training/eligibility.ts) `ineligibleReason` checks each card from the firmest rule to the most changeable:
1. never suggest
2. an ability you can't do
3. missing equipment
4. longer than the whole session

Every left-out card keeps its reason, which the screen shows. No rule is ever loosened just to fill a session.

## 3. Search: depth-first include/skip
[planner.ts](../../apps/web/src/domain/training/planner.ts) `feasibleCandidates`:
- **State:** (next card index, cards chosen, minutes left).
- **Actions:** skip the card, or include it if it fits the time left and the session has room (at most 3 cards).
- **It always ends,** because every action moves to the next index. Over-time branches are pruned, never explored.
- **Why not A\*:** with 8 cards there are at most 92 sessions. Exhaustive search is cheap, and it lets the tests compare against a brute-force oracle.

## 4. Ranking (yours): `compareCandidates`
It returns a negative number if session `a` is better. The order:
1. more of your requested categories covered
2. then a higher preference total
3. then shorter
4. then the IDs alphabetically

`bestPlan` sorts every candidate with it and keeps the first. **This is the function you write.**

## 5. Why greedy is not enough (kit counterexample)
12 minutes, with A = 10 min push (preference 3), B = 6 min push (2), C = 6 min pull (2):
- **Greedy** takes the favourite, A. Nothing else then fits, so it covers push only.
- **The search** finds B + C, which covers push *and* pull.

`planner.test.ts` proves both.

## 6. Screen
[PlanSession.tsx](../../apps/web/src/ui/PlanSession.tsx), on the Gym tab: minutes, equipment, "you cannot do", and what to train. It shows the session with each cue, "Best of N possible sessions", or the "no plan" reason, plus why each exercise was left out. A plan is only a suggestion; you still log what you actually did on Today.

## Verified (7 Nov 2026)
- `npm run check`: the search matches the independent oracle on all 12 kit scenarios, with **zero rule violations**, and the greedy counterexample holds.
- **Browser pane:** 0 minutes shows "There is no time for a session today. Rest is a valid choice", with every exclusion's reason.

## Verified with your `compareCandidates` (7 Nov 2026)
- `npm run check`: all green, including your 6 ranking tests (now plain `it`) and the kit counterexample, where the plan is B + C rather than the favourite A.
- **Browser pane:** 20 min, dumbbells, push + pull gives one-arm dumbbell row + push-up: "14 of 20 min · covers 2 of 2 chosen areas", best of 34 possible sessions.

**Not verified yet:** the phone.

## Your task (done): write `compareCandidates`
1. Open `apps/web/src/domain/training/planner.ts` and replace the `throw` in `compareCandidates` with the four-step rule above. About 5–10 lines, in your FIT3080 style: a comment above each tie-break.
2. Run `npm run check`. Your 6 tests now report "Expect test to fail". Change each `it.fails(` to `it(` in `planner.test.ts`.
3. Run `npm run check` again until it's all green. Then try "Find a plan" on the Gym tab: 20 min, dumbbells, push + pull.
4. Commit with your own message. We then merge `feat/planner` into `main`.

Interview question to prepare: "Why does the search always terminate, and why does greedy fail on A/B/C?"
