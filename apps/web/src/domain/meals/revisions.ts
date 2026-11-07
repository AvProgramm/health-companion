import { convertQuantity, type Quantity } from '../shared/units';
import { assertFraction, assertNonNegative } from '../shared/validate';
import type { MealComponent, MealEdit, MealEditRequest, MealRevision, ReviseResult } from './types';

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
  // A meal needs at least one food, otherwise there is nothing to save
  if (input.components.length === 0) {
    throw new Error('A meal needs at least one food');
  }

  // Check each component's serving and eaten fraction
  for (const component of input.components) {
    checkServing(component.served, component.eatenFraction, component.id);
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
 * Return the result of applying one edit to the latest revision of a meal.
 *
 * The latest revision is never edited in place. A successful edit returns a new
 * revision that records which revision it supersedes and carries the operation
 * key, so a retried request can be recognised. If the request was based on an
 * older revision, a conflict is returned instead, so a stale screen can never
 * overwrite a newer correction.
 */
export function reviseMeal(latest: MealRevision, request: MealEditRequest): ReviseResult {
  // A request for a different meal is a programming error, not a user conflict
  if (request.mealId !== latest.mealId) {
    throw new Error(`Request is for meal ${request.mealId}, but the latest revision is for ${latest.mealId}`);
  }

  // Ignore the edit if it was based on an older revision,
  // and hand back the latest one so the screen can show a fresh preview
  if (request.expectedRevision !== latest.revision) {
    return { status: 'conflict', latest };
  }

  // A deleted meal can only be restored, so a stale sheet cannot quietly edit it
  if (latest.deleted === true && request.edit.kind !== 'restore') {
    throw new Error(`Meal ${latest.mealId} is deleted; restore it before editing`);
  }

  // Work out the new components, then return the next revision linked to this one
  const changed = applyEdit(latest, request.edit);
  return {
    status: 'revised',
    next: {
      ...latest,
      revision: latest.revision + 1,
      supersedes: latest.revision,
      operationKey: request.operationKey,
      savedAt: request.savedAt,
      components: changed.components,
      deleted: changed.deleted,
    },
  };
}

/**
 * Return the components and deleted flag after one edit.
 *
 * Each case copies only what it changes. Untouched components are shared as-is,
 * because snapshots are never mutated.
 */
function applyEdit(latest: MealRevision, edit: MealEdit): { components: readonly MealComponent[]; deleted: boolean } {
  switch (edit.kind) {
    case 'update_component': {
      // "Actually 250 mL" and "leave half" both land here, checked like a new serving
      checkServing(edit.served, edit.eatenFraction, edit.componentId);
      const target = findActive(latest, edit.componentId);
      // Check the new unit can stand in for the old one (250 g cannot replace 300 mL)
      convertQuantity(edit.served, target.served.unit);
      const updated = { ...target, served: { ...edit.served }, eatenFraction: edit.eatenFraction };
      return { components: swap(latest, target, updated), deleted: false };
    }

    case 'replace_food': {
      // e.g. quinoa instead of rice: the old item stays in history but stops counting
      const target = findActive(latest, edit.componentId);
      checkServing(edit.replacement.served, edit.replacement.eatenFraction, edit.replacement.id);
      if (latest.components.some((component) => component.id === edit.replacement.id)) {
        throw new Error(`Component ${edit.replacement.id} already exists in meal ${latest.mealId}`);
      }
      const retired = swap(latest, target, { ...target, active: false });
      return { components: [...retired, { ...edit.replacement, active: true }], deleted: false };
    }

    case 'remove_component': {
      const target = findActive(latest, edit.componentId);
      return { components: swap(latest, target, { ...target, active: false }), deleted: false };
    }

    case 'delete_meal':
      return { components: latest.components, deleted: true };

    case 'restore': {
      // Only an earlier revision of this meal can be restored
      if (!Number.isInteger(edit.fromRevision) || edit.fromRevision < 1 || edit.fromRevision >= latest.revision) {
        throw new Error(`Cannot restore revision ${edit.fromRevision} of meal ${latest.mealId}`);
      }
      return { components: edit.components, deleted: edit.deleted };
    }
  }
}

/**
 * Return the active component with this ID, or throw if the meal has none.
 */
function findActive(latest: MealRevision, componentId: string): MealComponent {
  const target = latest.components.find((component) => component.id === componentId && component.active);
  if (target === undefined) {
    throw new Error(`Meal ${latest.mealId} has no active component ${componentId}`);
  }
  return target;
}

/**
 * Return the components with one of them replaced, keeping their order.
 */
function swap(latest: MealRevision, target: MealComponent, replacement: MealComponent): MealComponent[] {
  return latest.components.map((component) => (component === target ? replacement : component));
}

/**
 * Throw unless a serving amount and eaten fraction are valid.
 */
function checkServing(served: Quantity, eatenFraction: number, label: string): void {
  assertNonNegative(served.amount, `Served amount of ${label}`);
  assertFraction(eatenFraction, `Eaten fraction of ${label}`);
}
