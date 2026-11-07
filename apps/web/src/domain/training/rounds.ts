import type { MovementCard } from './catalogue';

/** Describe repeated reviewed blocks without expanding a long exercise list. */
export interface RoundSchedule {
  blocks: { card: MovementCard; repeatCount: number; minutes: number }[];
  minutes: number;
  unfilledMinutes: number;
  fullRounds: number;
  extraBlocks: number;
}

/**
 * Fill a target with complete selected rounds and extra blocks, without going over.
 *
 * A round of L minutes has L remainder classes. Keep the shortest reachable tail
 * for each remainder; adding whole rounds preserves that remainder. A shortest
 * positive-weight path never revisits a remainder, so search size depends on L,
 * not the requested target. The caller supplies a filtered round of at most twelve
 * reviewed blocks, each at most sixty minutes.
 */
export function fillRepeatedRound(cards: readonly MovementCard[], target: number): RoundSchedule {
  // Ignore malformed input because zero or fractional block lengths break the finite remainder graph.
  const roundMinutes = cards.reduce((sum, card) => sum + card.minutes, 0);
  if (!Number.isSafeInteger(target) || target < 0 || cards.length === 0 ||
      cards.some(card => !Number.isSafeInteger(card.minutes) || card.minutes < 1 || card.minutes > 60) ||
      cards.length > 12 || target < roundMinutes) {
    throw new Error('Choose a fitting round of up to twelve reviewed whole-minute blocks.');
  }

  // Seed remainder zero with no extra blocks; all other tails start unreachable.
  const distance = Array<number>(roundMinutes).fill(Number.POSITIVE_INFINITY);
  const steps = Array<number>(roundMinutes).fill(Number.POSITIVE_INFINITY);
  const visited = Array<boolean>(roundMinutes).fill(false);
  const previous = Array<number>(roundMinutes).fill(-1);
  const via = Array<number>(roundMinutes).fill(-1);
  distance[0] = 0;
  steps[0] = 0;

  // Run a small Dijkstra search over remainders, preferring fewer blocks on equal distances.
  for (let pass = 0; pass < roundMinutes; pass += 1) {
    let current = -1;
    for (let remainder = 0; remainder < roundMinutes; remainder += 1) {
      if (!visited[remainder] && Number.isFinite(distance[remainder]) &&
          (current === -1 || distance[remainder]! < distance[current]! ||
          (distance[remainder] === distance[current] && steps[remainder]! < steps[current]!))) current = remainder;
    }
    // Ignore an unreachable remainder because none of the selected lengths can produce it.
    if (current === -1) break;
    visited[current] = true;
    for (let index = 0; index < cards.length; index += 1) {
      const minutes = distance[current]! + cards[index]!.minutes;
      const next = minutes % roundMinutes;
      const count = steps[current]! + 1;
      if (minutes < distance[next]! || (minutes === distance[next] && count < steps[next]!)) {
        distance[next] = minutes;
        steps[next] = count;
        previous[next] = current;
        via[next] = index;
      }
    }
  }

  // Choose the largest reachable total, keeping at least one full round to preserve its coverage.
  let bestMinutes = roundMinutes;
  let bestRemainder = 0;
  let fullRounds = Math.floor(target / roundMinutes);
  bestMinutes = fullRounds * roundMinutes;
  for (let remainder = 1; remainder < roundMinutes; remainder += 1) {
    if (!Number.isFinite(distance[remainder])) continue;
    const rounds = Math.floor((target - distance[remainder]!) / roundMinutes);
    if (rounds < 1) continue;
    const minutes = distance[remainder]! + rounds * roundMinutes;
    if (minutes > bestMinutes) {
      bestMinutes = minutes;
      bestRemainder = remainder;
      fullRounds = rounds;
    }
  }

  // Reconstruct the shortest tail, which proves its minutes can be made from these blocks.
  const shortest = cards.map(() => 0);
  let remainder = bestRemainder;
  while (remainder !== 0) {
    shortest[via[remainder]!]! += 1;
    remainder = previous[remainder]!;
  }

  // Spread the same tail minutes over different blocks, so no exercise repeats more than it must.
  const tailMinutes = bestMinutes - fullRounds * roundMinutes;
  const extras = evenTail(cards, tailMinutes, Math.max(...shortest)) ?? shortest;
  const counts = extras.map(extra => fullRounds + extra);
  return { blocks: cards.map((card, index) => ({ card, repeatCount: counts[index]!, minutes: card.minutes * counts[index]! })),
    minutes: bestMinutes, unfilledMinutes: target - bestMinutes, fullRounds, extraBlocks: extras.reduce((sum, extra) => sum + extra, 0) };
}

/**
 * Return extra blocks per card that add up to the tail minutes, repeating no card more than needed.
 *
 * Try at most one extra of each card, then two, and so on: the first limit that reaches the
 * tail exactly is the most even spread. The shortest tail's largest count bounds the search.
 */
function evenTail(cards: readonly MovementCard[], tailMinutes: number, maxExtra: number): number[] | null {
  for (let limit = 1; limit <= maxExtra; limit += 1) {
    const extras = boundedExtras(cards, tailMinutes, limit);
    if (extras !== null) return extras;
  }
  // Ignore a tail of zero minutes because no extra block is needed
  return tailMinutes === 0 ? cards.map(() => 0) : null;
}

/**
 * Return extra counts, each at most limit, whose minutes add up to exactly tailMinutes, or null.
 *
 * A bounded subset-sum table: reach[minutes] keeps the first counts found for that total,
 * card by card, so the result is the same every time.
 */
function boundedExtras(cards: readonly MovementCard[], tailMinutes: number, limit: number): number[] | null {
  let reach: (number[] | null)[] = Array<number[] | null>(tailMinutes + 1).fill(null);
  reach[0] = cards.map(() => 0);
  for (let index = 0; index < cards.length; index += 1) {
    const next = [...reach];
    for (let minutes = 0; minutes <= tailMinutes; minutes += 1) {
      const counts = reach[minutes];
      // Ignore a total no earlier card could make, because it cannot be extended
      if (counts === null || counts === undefined) continue;
      for (let copies = 1; copies <= limit && minutes + copies * cards[index]!.minutes <= tailMinutes; copies += 1) {
        const total = minutes + copies * cards[index]!.minutes;
        if (next[total] === null) next[total] = counts.map((count, position) => (position === index ? copies : count));
      }
    }
    reach = next;
  }
  return reach[tailMinutes] ?? null;
}
