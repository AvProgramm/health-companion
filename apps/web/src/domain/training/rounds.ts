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

  // Reconstruct only the short tail and add its counts to the compact full-round counts.
  const counts = cards.map(() => fullRounds);
  let remainder = bestRemainder;
  let extraBlocks = 0;
  while (remainder !== 0) {
    counts[via[remainder]!]! += 1;
    extraBlocks += 1;
    remainder = previous[remainder]!;
  }
  return { blocks: cards.map((card, index) => ({ card, repeatCount: counts[index]!, minutes: card.minutes * counts[index]! })),
    minutes: bestMinutes, unfilledMinutes: target - bestMinutes, fullRounds, extraBlocks };
}
