/**
 * Saved food labels. A label is never overwritten: editing saves the next version.
 */
import type { FoodVersion } from '../domain/nutrition/types';
import { resultOf, runTransaction } from './connection';

/**
 * Save a new food version; fails if that exact version already exists.
 */
export function saveFoodVersion(db: IDBDatabase, food: FoodVersion): Promise<void> {
  return runTransaction<void>(db, ['foods'], (tx, finish) => {
    tx.objectStore('foods').add(food);
    finish(undefined);
  });
}

/**
 * Return every saved food version; meals point at exact versions, so old ones are kept.
 */
export function listFoods(db: IDBDatabase): Promise<FoodVersion[]> {
  return runTransaction(db, ['foods'], (tx, finish) => {
    tx.objectStore('foods').getAll().onsuccess = (event) => finish(resultOf(event) as FoodVersion[]);
  }, 'readonly');
}
