import type { Capability } from '../training/catalogue';

// Keep body-area choices finite so a misspelling cannot silently disable a filter.
export const BODY_AREAS = ['neck', 'shoulders', 'elbows', 'wrists', 'back', 'hips', 'knees', 'ankles'] as const;
export type BodyArea = (typeof BODY_AREAS)[number];
// Positions describe every position a movement requires, not alternative ways to do it.
export const POSITIONS = ['standing', 'seated', 'floor'] as const;
export type Position = (typeof POSITIONS)[number];

/** Describe opt-in local adaptations without clinical notes or inferred conditions. */
export interface Profile {
  readonly avoidAreas: readonly BodyArea[];
  readonly seatedOnly: boolean;
  readonly unableTo: readonly Capability[];
  readonly diabetes: boolean;
}

// No restriction or condition is inferred on a new device or from an older backup.
export const EMPTY_PROFILE: Profile = Object.freeze({ avoidAreas: Object.freeze([]), seatedOnly: false, unableTo: Object.freeze([]), diabetes: false });

/** Describe one confirmed, immutable profile version. */
export interface ProfileSnapshot {
  id: 'local';
  version: number;
  operationKey: string;
  savedAt: string;
  value: Profile;
}

/** Reject malformed adaptations before saving or restoring them. */
export function assertProfile(value: unknown): asserts value is Profile {
  // Ignore an unrecognised field because this profile never accepts clinical free text.
  const profile = value as Record<string, unknown> | null;
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile) ||
      Object.keys(profile).some(key => !['avoidAreas', 'seatedOnly', 'unableTo', 'diabetes'].includes(key)) ||
      !uniqueChoices(profile.avoidAreas, BODY_AREAS) || !uniqueChoices(profile.unableTo, ['pull_up', 'jumping']) ||
      typeof profile.seatedOnly !== 'boolean' || typeof profile.diabetes !== 'boolean') {
    throw new Error('Choose listed body areas and abilities, and use the condition switches explicitly.');
  }
}

/** Reject an incomplete immutable snapshot before any transaction writes it. */
export function assertProfileSnapshot(value: unknown): asserts value is ProfileSnapshot {
  const snapshot = value as Record<string, unknown> | null;
  // Ignore invalid identity or metadata because a backup must remain editable after restore.
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.id !== 'local' ||
      Object.keys(snapshot).some(key => !['id', 'version', 'operationKey', 'savedAt', 'value'].includes(key)) ||
      !Number.isSafeInteger(snapshot.version) || (snapshot.version as number) < 1 ||
      typeof snapshot.operationKey !== 'string' || snapshot.operationKey.trim() === '' || snapshot.operationKey.length > 160 ||
      typeof snapshot.savedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.savedAt))) {
    throw new Error('The profile has invalid identity, version, operation or saved time.');
  }
  assertProfile(snapshot.value);
}

/** Return whether a value contains only distinct, supported choices. */
function uniqueChoices(value: unknown, choices: readonly string[]): boolean {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && choices.includes(item)) && new Set(value).size === value.length;
}
