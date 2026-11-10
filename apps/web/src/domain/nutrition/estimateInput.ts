import { readCorrectedAmount } from '../parsing/amounts';

// Match a named container, never a food such as "bowl noodles" without "of".
const CONTAINER_OF = /^(bowl|cup|plate|glass|can|slice|spoon|mug)s? of (.+)$/i;

/** Separate a typed food from its portion without guessing a mass or volume. */
export function estimateInput(text: string, portionText: string): { name: string; portionText: string } {
  // Reuse the grammar's number words and corrections, preserving a container's count.
  const read = readCorrectedAmount(text);
  const container = read.unit === null ? CONTAINER_OF.exec(read.rest) : null;
  if (container !== null) {
    return { name: container[2]!, portionText: portionText || `${read.amount ?? 1} ${container[1]}` };
  }

  // Keep an explicit review amount; a bare count still means pieces, never grams.
  const typedPortion = read.amount === null ? '' : `${read.amount} ${read.unit ?? 'piece'}`;
  return { name: read.rest, portionText: portionText || typedPortion };
}
