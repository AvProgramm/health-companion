import { describe, expect, it } from 'vitest';
import { searchExercises, reviewExercise, type ExerciseEntry } from './exerciseSearch';

// Fictional source text keeps selection tests separate from a real person's history.
const entry: ExerciseEntry = { id: 'free-exercise-db:fictional_row', name: 'Fictional dumbbell row', category: 'pull',
  equipment: ['dumbbells'], requires: null, minutes: 5, cue: 'Fictional cue.', primaryMuscles: ['middle back'], imagePath: null, sourceEquipment: 'dumbbell' };

describe('offline exercise search and review', () => {
  it('matches all words, muscle names and punctuation deterministically', () => {
    expect(searchExercises([entry], 'DUMBBELL row').map(item => item.id)).toEqual([entry.id]);
    expect(searchExercises([entry], 'middle-back')).toEqual([entry]);
    expect(searchExercises([entry], 'row squat')).toEqual([]);
    expect(searchExercises([entry], '')).toEqual([]);
  });

  it('keeps unknown capability requirements unknown until explicitly reviewed', () => {
    expect(() => reviewExercise(entry, { category: 'pull', equipment: ['dumbbells'], requires: null, minutes: 5 })).toThrow('Review');
    expect(reviewExercise(entry, { category: 'pull', equipment: ['dumbbells'], requires: [], minutes: 6 })).toMatchObject({ id: entry.id, requires: [], minutes: 6 });
  });

  it('rejects incomplete categories, unknown equipment and invalid time', () => {
    for (const review of [
      { category: null, equipment: [], requires: [], minutes: 5 },
      { category: 'pull', equipment: null, requires: [], minutes: 5 },
      { category: 'pull', equipment: [], requires: [], minutes: Number.NaN },
    ]) expect(() => reviewExercise(entry, review as Parameters<typeof reviewExercise>[1])).toThrow();
  });
});
