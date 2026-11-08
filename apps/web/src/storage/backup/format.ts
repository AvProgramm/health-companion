import type { ProfileSnapshot } from '../../domain/profile/profile';
/**
 * The backup file format: what it contains and how its contents are counted.
 */
import type { CustomCardSelection } from '../../domain/training/customCards';
import type { MealRevision } from '../../domain/meals/types';
import type { FoodVersion } from '../../domain/nutrition/types';
import type { SleepEntry } from '../../domain/sleep/sleep';
import type { WorkoutEntry } from '../../domain/training/workouts';
import type { MealHeader, OperationRecord } from '../mealsRepo';

// Identifies our backup files, so a random JSON file is rejected straight away
export const BACKUP_FORMAT = 'health-companion-backup';
export const BACKUP_FORMAT_VERSION = 1;

// Lists added after the first backups were made; an older file without them restores them as empty
export const OPTIONAL_LISTS = ['workouts', 'sleep', 'customCards', 'profile'] as const;

export interface DiaryBackup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  foods: FoodVersion[];
  meals: MealHeader[];
  revisions: MealRevision[];
  operations: OperationRecord[];
  workouts: WorkoutEntry[];
  sleep: SleepEntry[];
  customCards: CustomCardSelection[];
  profile: ProfileSnapshot[];
}

export interface BackupCounts {
  foods: number;
  meals: number;
  revisions: number;
  workouts: number;
  sleep: number;
  customCards: number;
  profile: number;
}

export type BackupCheck =
  | { ok: true; backup: DiaryBackup; counts: BackupCounts }
  | { ok: false; errors: string[] };

/**
 * Return the counts of records in a backup, for the "this will restore…" message.
 */
export function countBackup(backup: DiaryBackup): BackupCounts {
  return {
    foods: backup.foods.length,
    meals: backup.meals.length,
    revisions: backup.revisions.length,
    workouts: backup.workouts.length,
    sleep: backup.sleep.length,
    customCards: backup.customCards.length,
    profile: backup.profile.length,
  };
}
