import type { ChangeAmountRequest, MealComponent, MealRevision, ReviseResult } from './types';
import { convertQuantity } from './units';
import { assertFraction, assertNonNegative } from './validate';

export interface StartMealInput {
  mealId: string;
  localDate: string;
  zone: string;
  savedAt: string;
  operationKey: string;
  components: readonly MealComponent[];
}

/**
 * Return the first revision of a new meal.
 *
 * Every component is checked here, before anything is saved, so a meal can never
 * start life with a negative serving or an eaten fraction outside [0, 1].
 */
export function startMeal(input: StartMealInput): MealRevision {
  // Check each component's serving and eaten fraction
  for (const component of input.components) {
    assertNonNegative(component.served.amount, `Served amount of ${component.id}`);
    assertFraction(component.eatenFraction, `Eaten fraction of ${component.id}`);
  }

  // Return revision 1, which supersedes nothing
  return {
    mealId: input.mealId,
    revision: 1,
    supersedes: null,
    operationKey: input.operationKey,
    localDate: input.localDate,
    zone: input.zone,
    savedAt: input.savedAt,
    components: input.components,
  };
}

/**
 * Return the result of changing one component's amount in a meal.
 *
 * The latest revision is never edited in place. A successful change returns a new
 * revision that keeps every other component unchanged, records which revision it
 * supersedes, and carries the operation key so a retried request can be recognised.
 * If the request was based on an older revision, a conflict is returned instead,
 * so a stale screen can never overwrite a newer correction.
 */
export function reviseAmount(latest: MealRevision, request: ChangeAmountRequest): ReviseResult {
  // A request for a different meal is a programming error, not a user conflict
  if (request.mealId !== latest.mealId) {
    throw new Error(`Request is for meal ${request.mealId}, but the latest revision is for ${latest.mealId}`);
  }

  // Ignore the change if it was based on an older revision,
  // and hand back the latest one so the screen can show a fresh preview
  if (request.expectedRevision !== latest.revision) {
    return { status: 'conflict', latest };
  }

  // Check the new amount before touching anything
  assertNonNegative(request.amount.amount, 'New amount');

  // Find the active component being corrected
  const target = latest.components.find((component) => component.id === request.componentId && component.active);
  if (target === undefined) {
    throw new Error(`Meal ${latest.mealId} has no active component ${request.componentId}`);
  }

  // Check the new unit can stand in for the old one
  // (throws UnitMismatchError for 250 g against a millilitre serving)
  convertQuantity(request.amount, target.served.unit);

  // Copy the components, replacing only the corrected amount;
  // the untouched components are shared as-is because snapshots are never mutated
  const components = latest.components.map((component) =>
    component === target ? { ...component, served: { ...request.amount } } : component,
  );

  // Return the next revision, linked back to the one it supersedes
  return {
    status: 'revised',
    next: {
      ...latest,
      revision: latest.revision + 1,
      supersedes: latest.revision,
      operationKey: request.operationKey,
      savedAt: request.savedAt,
      components,
    },
  };
}
