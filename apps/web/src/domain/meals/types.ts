/**
 * Shapes for meals, their revisions and the edits that create new revisions.
 */
import type { Quantity } from '../shared/units';

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
  // A deleted meal keeps its history and can be restored; totals leave it out
  deleted?: boolean;
}

/**
 * One change a user can make to a saved meal.
 *
 * Every edit produces a new revision; none of them edits a snapshot in place.
 * "Actually 250 mL" and "leave half" are both update_component.
 */
export type MealEdit =
  | { kind: 'update_component'; componentId: string; served: Quantity; eatenFraction: number }
  | { kind: 'replace_food'; componentId: string; replacement: MealComponent }
  | { kind: 'remove_component'; componentId: string }
  | { kind: 'delete_meal' }
  | { kind: 'restore'; fromRevision: number; components: readonly MealComponent[]; deleted: boolean };

/**
 * A request to apply one edit, based on the revision the user was looking at.
 *
 * expectedRevision lets a change made from a stale screen be detected instead of
 * overwriting a newer one.
 */
export interface MealEditRequest {
  mealId: string;
  expectedRevision: number;
  edit: MealEdit;
  operationKey: string;
  savedAt: string;
}

export type ReviseResult =
  | { status: 'revised'; next: MealRevision }
  | { status: 'conflict'; latest: MealRevision };
