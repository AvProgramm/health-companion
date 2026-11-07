/**
 * Shared shapes for foods, meals and revisions.
 *
 * Kept free of storage and UI imports, so the same types describe a saved
 * record, a test fixture and a backup file.
 */
import type { Quantity } from './units';

// A label can leave a nutrient blank; null keeps it unknown instead of becoming 0
export type NutrientValue = number | null;

export type NutrientKey = 'kcal' | 'protein_g' | 'fat_g' | 'satfat_g' | 'total_sugar_g' | 'added_sugar_g';

// Where a food's numbers came from, shown as a badge beside every row
export type SourceKind = 'label' | 'user_estimate' | 'fixture';

/**
 * One version of a food's label.
 *
 * Nutrients are given per basis quantity (e.g. per 250 mL). A missing key means
 * the label did not say, which is treated the same as null.
 */
export interface FoodVersion {
  id: string;
  version: number;
  name: string;
  basis: Quantity;
  nutrients: Partial<Record<NutrientKey, NutrientValue>>;
  source: { kind: SourceKind; reference?: string };
}

/**
 * One food inside a meal revision, with how much was served and how much was eaten.
 */
export interface MealComponent {
  id: string;
  foodId: string;
  foodVersion: number;
  served: Quantity;
  eatenFraction: number;
  active: boolean;
}

/**
 * An immutable snapshot of a meal.
 *
 * A correction never edits a snapshot. It adds a new one with the next revision
 * number and records which revision it supersedes, so history is never lost.
 */
export interface MealRevision {
  mealId: string;
  revision: number;
  supersedes: number | null;
  operationKey: string;
  localDate: string;
  zone: string;
  savedAt: string;
  components: readonly MealComponent[];
}

/**
 * A request to change the amount of one component.
 *
 * expectedRevision is the revision the user was looking at, so a change made
 * from a stale screen can be detected instead of overwriting a newer one.
 */
export interface ChangeAmountRequest {
  mealId: string;
  expectedRevision: number;
  componentId: string;
  amount: Quantity;
  operationKey: string;
  savedAt: string;
}

export type ReviseResult =
  | { status: 'revised'; next: MealRevision }
  | { status: 'conflict'; latest: MealRevision };
