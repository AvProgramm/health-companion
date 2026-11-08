import { describe, expect, it } from 'vitest';
import { EXERCISE_ENTRIES } from '../../data/exerciseLibrary';
import { whyNotAddable } from './exerciseSearch';
import { DIFFICULTIES, PACKS, SETTINGS, buildPack, type Difficulty, type Setting } from './packs';

// Every pack, difficulty and setting, so each rule is checked across all of them
const PACK_IDS = PACKS.map(pack => pack.id);
const DIFFICULTY_IDS = Object.keys(DIFFICULTIES) as Difficulty[];
const SETTING_IDS = Object.keys(SETTINGS) as Setting[];

/** Return the names a pack chooses, for readable expectations. */
function names(packId: string, difficulty: Difficulty, setting: Setting): string[] {
  return buildPack(packId, difficulty, setting, EXERCISE_ENTRIES).exercises.map(item => item.entry.name);
}

describe('pack data', () => {
  it('lists only real, addable library exercises from the areas each pack trains', () => {
    const byId = new Map(EXERCISE_ENTRIES.map(entry => [entry.id, entry]));
    for (const pack of PACKS) {
      expect(new Set(pack.exerciseIds).size).toBe(pack.exerciseIds.length);
      for (const id of pack.exerciseIds) {
        const entry = byId.get(id);
        expect(entry, id).toBeDefined();
        expect(whyNotAddable(entry!), id).toBeNull();
        expect(pack.categories, id).toContain(entry!.category);
      }
    }
  });
});

describe('buildPack', () => {
  it('never uses equipment the setting does not have', () => {
    for (const packId of PACK_IDS) for (const difficulty of DIFFICULTY_IDS) for (const setting of SETTING_IDS) {
      for (const { entry } of buildPack(packId, difficulty, setting, EXERCISE_ENTRIES).exercises) {
        expect(entry.equipment!.every(item => SETTINGS[setting].equipment.includes(item)), `${packId} ${difficulty} ${setting} ${entry.name}`).toBe(true);
      }
    }
  });

  it('keeps Easy to beginner exercises that need no special ability', () => {
    for (const packId of PACK_IDS) for (const setting of SETTING_IDS) {
      for (const { entry } of buildPack(packId, 'easy', setting, EXERCISE_ENTRIES).exercises) {
        expect(entry.level, entry.name).toBe('beginner');
        expect(entry.requires, entry.name).toEqual([]);
      }
    }
  });

  it('scales the number of exercises, sets and minutes with difficulty, never above the limit', () => {
    for (const packId of PACK_IDS) for (const difficulty of DIFFICULTY_IDS) for (const setting of SETTING_IDS) {
      const session = buildPack(packId, difficulty, setting, EXERCISE_ENTRIES);
      const rule = DIFFICULTIES[difficulty];
      expect(session.exercises.length + session.missing).toBe(rule.exercises);
      expect(session.exercises.every(item => item.sets === rule.sets && item.minutes === rule.minutesPerExercise)).toBe(true);
      expect(session.minutes).toBe(session.exercises.length * rule.minutesPerExercise);
    }
  });

  // Worked by hand from the pack list: one exercise per leg muscle before any repeat
  it('spreads a leg day over different muscles first', () => {
    expect(names('legs', 'easy', 'gym')).toEqual(['Barbell Squat', 'Stiff-Legged Dumbbell Deadlift', 'Standing Calf Raises', 'Butt Lift (Bridge)']);
    expect(names('legs', 'easy', 'bodyweight')).toEqual(['Bodyweight Squat', 'Butt Lift (Bridge)', 'Single Leg Glute Bridge', 'Glute Kickback']);
  });

  it('puts the harder level first on Medium and Hard', () => {
    expect(names('legs', 'hard', 'gym')[0]).toBe('Kettlebell Pistol Squat');
    expect(names('legs', 'medium', 'gym').slice(0, 2)).toEqual(['Romanian Deadlift', 'Barbell Full Squat']);
  });

  it('covers every area once in a full-body day before repeating one', () => {
    const session = buildPack('full_body', 'easy', 'home', EXERCISE_ENTRIES);
    expect(session.exercises.map(item => item.entry.category)).toEqual(['legs', 'push', 'pull', 'core']);
    // Seen on 7 Nov: Hard at home gave three leg exercises; each area should differ by at most one
    for (const setting of ['home', 'gym'] as const) {
      const counts = new Map<string, number>();
      for (const { entry } of buildPack('full_body', 'hard', setting, EXERCISE_ENTRIES).exercises) counts.set(entry.category!, (counts.get(entry.category!) ?? 0) + 1);
      expect(Math.max(...counts.values()) - Math.min(...counts.values()), setting).toBeLessThanOrEqual(1);
      expect(counts.size, setting).toBe(4);
    }
  });

  it('answers honestly when nothing fits, instead of inventing an exercise', () => {
    // Every pull exercise in the pack needs a bar, a band or weights
    const session = buildPack('pull', 'easy', 'bodyweight', EXERCISE_ENTRIES);
    expect(session.exercises).toEqual([]);
    expect(session.missing).toBe(DIFFICULTIES.easy.exercises);
  });

  it('gives the same session for the same choices', () => {
    expect(names('full_body', 'hard', 'gym')).toEqual(names('full_body', 'hard', 'gym'));
  });
});


it('never relaxes saved adaptations to fill a ready-made day', () => {
  for (const packId of PACK_IDS) for (const difficulty of DIFFICULTY_IDS) for (const setting of SETTING_IDS) {
    const session = buildPack(packId, difficulty, setting, EXERCISE_ENTRIES, {
      seatedOnly: true, avoidAreas: ['shoulders'], unableTo: ['jumping', 'pull_up'], diabetes: false,
    });
    expect(session.exercises.every(({ entry }) => entry.positions?.length === 1 && entry.positions[0] === 'seated'
      && entry.loads != null && !entry.loads.includes('shoulders') && entry.requires.length === 0)).toBe(true);
  }
});
