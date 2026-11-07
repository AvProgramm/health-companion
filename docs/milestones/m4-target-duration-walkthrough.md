# M4: target-duration sessions

7 Nov 2026, Codex, explicitly authorised by Yash to update compareCandidates and the session limit. His original ranking was already complete. This change is AI-authored; Yash reviews the diff and explains it back.

## The problem and the new behaviour

The old three-card cap and shorter-is-better tie-break returned 15 minutes for a 60-minute target. The new cap is 12 distinct exercises. Ranking is lexicographic: more requested categories, then more minutes without exceeding the target, then higher preference, then ordered exercise IDs. Since every feasible plan is at most the target, maximising minutes minimises unfilled time. Coverage deliberately remains first: a shorter plan covering more requested areas can still win.

Each exercise keeps its reviewed planning duration and appears once. No reps, rest periods or durations are invented or multiplied. Twelve five-minute choices can make 60 minutes; the three bodyweight starter blocks still total just 15. The screen now says A partial session and 45 min unfilled for that case, with a prompt to add choices or shorten the target. An exact fit says Your target is covered. These are planning blocks, not measured training times.

## Explain the search

Increasing the old DFS limit to 12 would make enumerating every subset expensive. The replacement is dynamic programming, like a 0/1 knapsack with coverage:

1. Apply the unchanged hard filters first.
2. Process eligible cards in stable ID order. For each card, either skip it or append it to a previous state if both limits hold.
3. A state is (minutes used, category mask, number of cards). Four category bits encode 16 masks. The current card index is implicit in the outer loop.
4. For identical states at the same step, keep only the better preference/ID prefix. Both prefixes have the same time, coverage, count and remaining cards, so the discarded one cannot lead to a better final answer.
5. Iterate a snapshot of the previous states, so a newly added card cannot be used again during that pass.
6. Rank the final nonempty representatives and subtract their minutes from the target in the domain.

Do not merge different masks just because their coverage count agrees: a later card may add a missing area to only one. Do not merge different card counts: the smaller prefix has more slots left. Compare ID arrays one ID at a time, so appending the same future IDs preserves the tie order even when one ID prefixes another.

Targets are bounded whole minutes from 0 to 240, a product/performance limit rather than exercise guidance. The state table has at most (T + 1) * 16 * 13 keys: 12,688 at 60 minutes, 50,128 at 240. There are at most 32 pool cards in today's UI. State growth is bounded by time, coverage and count rather than 2^pool-size. Building a representative also copies/summarises up to 12 cards. Zero minutes still returns the existing rest message.

## Tests and verification

Tests failed before implementation. They cover exact 60 minutes from twelve unique choices, the screenshot's 15/60 partial plan, a 59/60 near fit, duration ahead of preference, deterministic prefix IDs, invalid/non-finite/fractional/over-limit targets, and a bounded 32-card pool. The independent brute-force oracle still enumerates every subset of the small catalogue and checks the optimal result across the twelve original scenarios. Existing hard-rule and greedy counterexample tests remain.

npm run check and the production build pass. Browser verification passes at 375 px and 1440 px. The starter-only bodyweight case shows 15/60 and 45 minutes unfilled. Adding nine temporary, reviewed five-minute choices through the normal confirmation UI produces 60/60 across twelve distinct blocks. Those browser test choices were then removed; no workout was logged. Physical phone verification of this update is pending. No schema or storage change. No exercise query or health data leaves the device. The injury/seated rules and training loop are unchanged.

## Explain-back questions

- Why does choosing the longer feasible plan minimise the gap without needing absolute differences?
- Why are category mask and card count part of the state?
- Why must each card read a snapshot of the preceding states?
- Why can three known bodyweight blocks still only produce 15 minutes?
- Why can a plan with better category coverage outrank one closer to the target?

## Later AI scope

Yash wants free-first agentic gym/nutrition assistants and DL/ML or BERT/transformer experiments later. No chatbot, model download, API call or training loop is added here. Later model choices need licence/access/cost checks, a baseline, held-out evaluation and measured latency. Suggestions must remain drafts, and deterministic planner constraints must still govern the final plan. Yash's training loop remains reserved.

Further oracle coverage checks twelve ten-card pools with mixed durations, category goals, positive/negative preferences, missing gear, blocked capabilities and excluded IDs, comparing full optimal candidates against exhaustive enumeration. A thirteen-block case confirms the twelve-card limit still applies.


Superseded follow-up: Yash explicitly requested repeated rounds and removal of the input cap. See `m4-repeated-rounds-walkthrough.md`; the distinct-only mode remains available by turning repetition off.
