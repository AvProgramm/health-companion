import { describe, expect, it } from 'vitest';
import { searchExercises, reviewExercise, whyNotAddable, type ExerciseEntry } from './exerciseSearch';

// Fictional source text keeps selection tests separate from a real person's history.
const entry: ExerciseEntry = { id: 'free-exercise-db:fictional_row', name: 'Fictional dumbbell row', category: 'pull',
  equipment: ['dumbbells'], untracked: null, requires: [], minutes: 5, cue: 'Fictional cue.', primaryMuscles: ['middle back'],
  imagePath: null, sourceEquipment: 'dumbbell', level: 'beginner' };

describe('offline exercise search and review', () => {
  it('matches all words, muscle names and punctuation deterministically', () => {
    expect(searchExercises([entry], 'DUMBBELL row').map(item => item.id)).toEqual([entry.id]);
    expect(searchExercises([entry], 'middle-back')).toEqual([entry]);
    expect(searchExercises([entry], 'row squat')).toEqual([]);
    expect(searchExercises([entry], '')).toEqual([]);
  });

  // Asked for on 8 Nov: the source says this row needs dumbbells, so the person cannot change that
  it('keeps the source equipment and needs, and takes only the planning block from the person', () => {
    expect(reviewExercise(entry, 6)).toMatchObject({ id: entry.id, category: 'pull', equipment: ['dumbbells'], requires: [], minutes: 6 });
    expect(() => reviewExercise(entry, Number.NaN)).toThrow();
    expect(() => reviewExercise(entry, 0)).toThrow();
  });

  it('says why an exercise cannot be added, and refuses to add it', () => {
    expect(whyNotAddable(entry)).toBeNull();
    const cases: [Partial<ExerciseEntry>, RegExp][] = [
      [{ category: null }, /push, pull, legs or core/],
      [{ equipment: null, untracked: 'a decline bench' }, /needs a decline bench/],
      [{ equipment: null, sourceEquipment: 'other' }, /does not say what equipment/],
    ];
    for (const [change, reason] of cases) {
      const blocked = { ...entry, ...change };
      expect(whyNotAddable(blocked)).toMatch(reason);
      expect(() => reviewExercise(blocked, 5)).toThrow();
    }
  });
});
