import type { ProfileSnapshot } from './profile';

/** One recorded weight. */
export interface WeightPoint {
  savedAt: string;
  weightKg: number;
}

/**
 * Return each change of weight, oldest first, from the profile's saved versions.
 *
 * A version that changed something else repeats the same weight, so it adds no point.
 */
export function weightTrend(snapshots: readonly ProfileSnapshot[]): WeightPoint[] {
  const points: WeightPoint[] = [];
  for (const snapshot of [...snapshots].sort((left, right) => left.version - right.version)) {
    const weightKg = snapshot.value.body?.weightKg;

    // Ignore a version with no weight, or the same weight, because nothing was recorded
    if (weightKg !== undefined && points.at(-1)?.weightKg !== weightKg) {
      points.push({ savedAt: snapshot.savedAt, weightKg });
    }
  }
  return points;
}
