import assert from 'node:assert/strict';
import test from 'node:test';
import { convertExercise } from './import-exercises.mjs';

test('preserves unmapped equipment and capability requirements as unknown', () => {
  const card = convertExercise({ id: 'Fictional_Pull_Up', name: 'Fictional pull up', force: 'pull', equipment: null, primaryMuscles: ['lats'], instructions: ['A fictional cue.'] });
  assert.equal(card.equipment, null);
  assert.equal(card.requires, null);
  assert.equal(card.category, 'pull');
  assert.equal(card.imagePath, null);
});

test('uses explicit muscle and equipment mappings and labels the default time', () => {
  const card = convertExercise({ id: 'Fictional_Squat', name: 'Fictional squat', force: 'push', equipment: 'dumbbell', primaryMuscles: ['quadriceps'], instructions: ['A fictional cue.'] });
  assert.equal(card.category, 'legs');
  assert.deepEqual(card.equipment, ['dumbbells']);
  assert.equal(card.minutes, 5);
  assert.equal(card.requires, null);
  assert.equal(convertExercise({ id: 'Unknown', name: 'Unknown', force: null, equipment: 'machine', primaryMuscles: ['unknown'], instructions: [] }).category, null);
});
test('does not classify an unmapped muscle from force alone', () => {
  assert.equal(convertExercise({ id: 'Unknown_Push', name: 'Unknown push', force: 'push', equipment: 'body only', primaryMuscles: ['unknown'], instructions: [] }).category, null);
});
