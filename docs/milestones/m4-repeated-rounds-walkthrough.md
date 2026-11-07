# M4: repeated rounds and the pigeonhole principle

7 Nov 2026, Codex. Yash explicitly requested repeated rounds of selected exercises and removal of the artificial input-duration cap. The AI trainer, nutritionist and ML experiments remain later work.

## What changed

The form defaults Repeat rounds to fill the target on, visibly and reversibly. Turning it off restores the distinct-exercise plan. The base planner still chooses up to twelve distinct eligible exercises using coverage, duration, preference and ordered IDs. A separate pure module, rounds.ts, fills the requested duration with full rounds and extra copies of those same reviewed blocks. No duration, rep count, source cue or stored diary entry is rewritten. The output has one row per distinct exercise, with block counts, total minutes, full rounds, extra blocks and any unfilled time. Nothing is logged automatically.

There is no 240-minute product cap. Targets are non-negative safe whole-minute numbers; fractions, non-finite values and unsafe integers are rejected rather than silently rounded. Actual base-search time is bounded by the pool and twelve-card cap, not by allocating a table the size of a huge input. Reviewed cards are at most sixty minutes, so a base round is at most 720 minutes.

## Why pigeonhole helps, and what it does not prove

A selected round lasts L minutes. Every tail total has one of L remainders modulo L. By the pigeonhole principle, a path visiting more than L distinct positions must revisit a remainder. That positive-length cycle costs a multiple of L, which can be represented by extra full rounds instead. We therefore keep only the shortest reachable tail for each remainder.

Dijkstra finds those shortest tails, using each selected block length as an edge weight. For each reachable remainder with shortest tail d, compute q = floor((target - d) / L). Keep q >= 1 so every selected exercise appears in at least one full round. The filled duration is d + qL. Choose the largest one not exceeding the target, reconstruct the short tail and store repetition counts, not an enormous list.

This is exact for filling a fixed selected round while preserving at least one complete round. It is a two-stage planner: base selection uses the existing distinct-exercise objective, and fill is then optimised for that selection. It does not claim a joint global optimum over every possible exercise selection and repetition count. Pigeonhole gives a finite representation; Dijkstra plus arithmetic finds the fill. Neither theorem makes an impossible combination possible.

Example: lengths 4, 5 and 6 make a fifteen-minute round. At 60, use four complete rounds. At 31, greedily taking two rounds leaves one minute; instead use one round plus 4 + 6 + 6 = 16 extra minutes. Lengths 5 and 10 cannot make 17, so show 15 with two minutes unfilled. Instructions and block durations remain unchanged.

## Bounds and interview explanation

There are L remainder nodes and at most twelve outgoing edges per node. The simple array-based Dijkstra costs O(L squared + L times K), with O(L + K) memory. L is at most 720 in the current product. Reconstruction visits at most L minus one tail edges; full rounds are a count. A billion-minute input therefore does not run a billion iterations or render a billion cards.

The base DP table is bounded by the largest feasible sum of twelve reviewed blocks (at most 720), sixteen category masks and thirteen counts. The number of input digits does not grow that table. The original hard filters run before selection; repeated blocks are drawn only from the selected, eligible round.

## Tests and checkpoint

Failing tests were run first. Tests cover 60/60, the non-greedy 31/31 case, unreachable 17/15, billion-minute compact output, malformed rounds and equipment/capability exclusions. An independent direct reachability oracle checks 405 small targets across five duration sets without using residues or shortest paths. UI tests cover repetition enabled by default, disabled-state partial plans and clearing stale results on toggle. Check and production build pass. Browser and phone verification of this update are pending at this checkpoint.

Explain back: Why are remainders finite? Why may a repeated-remainder cycle be replaced by full rounds? Why is taking the maximum full rounds first insufficient? Why does keeping one complete round preserve category coverage? Why can some targets still have an unfilled gap?
