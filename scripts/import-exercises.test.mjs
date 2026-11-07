import assert from 'node:assert/strict';
import test from 'node:test';
import { convertExercise } from './import-exercises.mjs';

test('keeps unmapped equipment unknown', () => {
  const card = convertExercise({ id: 'Fictional_Pull_Up', name: 'Fictional pull up', force: 'pull', equipment: null, primaryMuscles: ['lats'], instructions: ['A fictional cue.'] });
  assert.equal(card.equipment, null);
  assert.equal(card.category, 'pull');
  assert.equal(card.imagePath, null);
  assert.equal(convertExercise({ id: 'Other', name: 'Other', force: 'pull', equipment: 'other', primaryMuscles: ['lats'], instructions: [] }).equipment, null);
});

test('uses explicit muscle and equipment mappings and labels the default time', () => {
  const card = convertExercise({ id: 'Fictional_Squat', name: 'Fictional squat', force: 'push', equipment: 'dumbbell', level: 'beginner', primaryMuscles: ['quadriceps'], instructions: ['A fictional cue.'] });
  assert.equal(card.category, 'legs');
  assert.deepEqual(card.equipment, ['dumbbells']);
  assert.equal(card.minutes, 5);
  assert.deepEqual(card.requires, []);
  assert.equal(card.level, 'beginner');
  assert.equal(convertExercise({ id: 'Unknown', name: 'Unknown', force: null, equipment: 'machine', primaryMuscles: ['unknown'], instructions: [] }).category, null);
});

test('does not classify an unmapped muscle from force alone', () => {
  assert.equal(convertExercise({ id: 'Unknown_Push', name: 'Unknown push', force: 'push', equipment: 'body only', primaryMuscles: ['unknown'], instructions: [] }).category, null);
});

// Seen on 7 Nov: "Pullups" is listed as "body only", so it was planned without a bar
test('reads a pull-up bar from the instructions of a body-only exercise', () => {
  const card = convertExercise({ id: 'Pullups', name: 'Pullups', force: 'pull', equipment: 'body only', level: 'beginner', primaryMuscles: ['lats'],
    instructions: ['Grab the pull-up bar with the palms facing forward using the prescribed grip.'] });
  assert.deepEqual(card.equipment, ['pull_up_bar']);
  assert.deepEqual(card.requires, ['pull_up']);
  // Hanging from the bar needs the bar, not the ability to pull up
  const hang = convertExercise({ id: 'Hanging_Leg_Raise', name: 'Hanging Leg Raise', force: 'pull', equipment: 'body only', primaryMuscles: ['abdominals'],
    instructions: ['Hang from a chin-up bar with both arms extended.'] });
  assert.deepEqual(hang.equipment, ['pull_up_bar']);
  assert.deepEqual(hang.requires, []);
});

test('keeps apparatus the planner cannot check unknown, and says what it is', () => {
  for (const [instruction, untracked] of [['Secure your legs at the end of the decline bench.', 'a decline bench'], ['Your partner will stand behind you.', 'a partner'],
    ['Hold your body at arms length above the bars.', 'dip bars']]) {
    const card = convertExercise({ id: 'Fictional', name: 'Fictional', force: 'push', equipment: 'body only', primaryMuscles: ['chest'], instructions: [instruction] });
    assert.equal(card.equipment, null);
    assert.equal(card.untracked, untracked);
  }
});

test('maps gym equipment the source names explicitly', () => {
  const card = convertExercise({ id: 'Barbell_Squat', name: 'Barbell Squat', force: 'push', equipment: 'barbell', primaryMuscles: ['quadriceps'], instructions: ['A fictional cue.'] });
  assert.deepEqual(card.equipment, ['barbell']);
  assert.deepEqual(convertExercise({ id: 'Swing', name: 'Swing', force: 'pull', equipment: 'kettlebells', primaryMuscles: ['hamstrings'], instructions: [] }).equipment, ['kettlebells']);
  assert.deepEqual(convertExercise({ id: 'Curl', name: 'Curl', force: 'pull', equipment: 'e-z curl bar', primaryMuscles: ['biceps'], instructions: [] }).equipment, ['ez_curl_bar']);
});

test('needs jumping for a jump in the name or a plyometric leg exercise', () => {
  const jump = convertExercise({ id: 'Freehand_Jump_Squat', name: 'Freehand Jump Squat', force: 'push', equipment: 'body only', category: 'strength', primaryMuscles: ['quadriceps'], instructions: [] });
  assert.deepEqual(jump.requires, ['jumping']);
  const bound = convertExercise({ id: 'Lateral_Bound', name: 'Lateral Bound', force: 'push', equipment: 'body only', category: 'plyometrics', primaryMuscles: ['adductors'], instructions: [] });
  assert.deepEqual(bound.requires, ['jumping']);
  // An explosive push-up is plyometric but does not jump on the legs
  const push = convertExercise({ id: 'Plyo_Push-up', name: 'Plyo Push-up', force: 'push', equipment: 'body only', category: 'plyometrics', primaryMuscles: ['chest'], instructions: [] });
  assert.deepEqual(push.requires, []);
});
