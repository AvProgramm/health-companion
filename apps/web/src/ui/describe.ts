import { foodKey } from '../domain/aggregate';
import type { FoodVersion, MealComponent, MealRevision } from '../domain/types';
import { formatQuantity } from './format';

/**
 * Return a short description of what changed between two revisions of a meal,
 * e.g. "Milk 300 mL → 250 mL", for the history list.
 */
export function describeChange(previous: MealRevision | undefined, next: MealRevision, foods: ReadonlyMap<string, FoodVersion>): string {
  // The first revision has nothing to compare against
  if (previous === undefined) {
    return 'First saved';
  }

  // Whole-meal changes come first
  if (next.deleted === true && previous.deleted !== true) {
    return 'Meal deleted';
  }
  const changes: string[] = [];
  if (next.deleted !== true && previous.deleted === true) {
    changes.push('Meal restored');
  }

  // Then compare item by item
  const before = new Map(previous.components.map((component) => [component.id, component]));
  for (const component of next.components) {
    const name = nameOf(component, foods);
    const old = before.get(component.id);

    if (old === undefined) {
      changes.push(`Added ${name}`);
      continue;
    }
    if (old.active && !component.active) {
      changes.push(`Removed ${name}`);
      continue;
    }
    if (!old.active && component.active) {
      changes.push(`Brought back ${name}`);
    }
    if (old.served.amount !== component.served.amount || old.served.unit !== component.served.unit) {
      changes.push(`${name} ${formatQuantity(old.served)} → ${formatQuantity(component.served)}`);
    }
    if (old.eatenFraction !== component.eatenFraction) {
      changes.push(`${name} eaten ${Math.round(old.eatenFraction * 100)}% → ${Math.round(component.eatenFraction * 100)}%`);
    }
  }

  // Return the changes, or a plain note if nothing visible changed
  return changes.length === 0 ? 'No visible change' : changes.join('; ');
}

/**
 * Return a component's food name, or a placeholder if the food is missing.
 */
export function nameOf(component: MealComponent, foods: ReadonlyMap<string, FoodVersion>): string {
  return foods.get(foodKey(component.foodId, component.foodVersion))?.name ?? 'Unknown food';
}
