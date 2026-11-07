import library from './exercise-index.json';
import type { ExerciseEntry } from '../domain/training/exerciseSearch';

// The generated file is bundled and precached; exercise queries never call a service.
export const EXERCISE_ENTRIES = library.entries as readonly ExerciseEntry[];
// Keep the source revision beside saved choices for reproducible provenance.
export const EXERCISE_SOURCE = { dataset: 'free-exercise-db' as const, revision: library.source.revision };
