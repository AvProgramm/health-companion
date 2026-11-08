import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Pin the source revision so rebuilding never performs a live lookup or changes the catalogue.
const REVISION = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
// Verify the vendored bytes before converting third-party data.
const DATA_SHA256 = '5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf';
// Verify the licence independently of the data file.
const LICENCE_SHA256 = '6b0382b16279f26ff69014300541967a356a666eb0b91b422f6862f6b7dad17e';
// Only explicit source equipment with a planner counterpart is mapped; "other" and a missing value stay unknown.
const EQUIPMENT = { 'body only': [], dumbbell: ['dumbbells'], bands: ['band'], barbell: ['barbell'], kettlebells: ['kettlebells'],
  cable: ['cable'], machine: ['machine'], 'medicine ball': ['medicine_ball'], 'exercise ball': ['exercise_ball'],
  'e-z curl bar': ['ez_curl_bar'], 'foam roll': ['foam_roll'] };
// "Body only" can still mean hanging from a bar; the instructions say so explicitly.
const PULL_UP_BAR = /\b(pull-?up|chin-?up) bar\b/i;
// Apparatus or help the planner cannot check, named in the instructions, with how it reads on screen.
const UNTRACKED = [[/\bdecline bench\b/i, 'a decline bench'], [/\bpreacher bench\b/i, 'a preacher bench'], [/\bsmith machine\b/i, 'a Smith machine'],
  [/\blat pulldown machine\b/i, 'a lat pulldown machine'], [/\bin a rack\b/i, 'a rack'], [/\bv-bar\b/i, 'a V-bar'], [/\bpartner\b/i, 'a partner'],
  [/\b(parallel|dip) bars?\b|\babove the bars\b/i, 'dip bars']];
// A jump in the name, or a plyometric leg exercise, needs jumping.
const JUMP_NAME = /\b(jump|jumps|jumping|hop|hops|bound|skip|skipping)\b/i;
// Pulling the body up to a bar needs the ability to do a pull-up; only hanging from it does not.
const PULL_UP_NAME = /\bpull-?ups?\b|\bchin\b|\bchin-?ups?\b/i;
// Leg and core muscles take precedence over a generic push/pull force label.
const LEG_MUSCLES = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];

// Only these explicit upper-body muscles map through the source's force field.
const UPPER_MUSCLES = ['chest', 'shoulders', 'triceps', 'biceps', 'forearms', 'lats', 'middle back', 'traps'];
// The source's own difficulty levels, kept so packs can filter by them.
const LEVELS = ['beginner', 'intermediate', 'expert'];
// This is a reviewable planning block, never a duration claimed by the dataset.
const DEFAULT_MINUTES = 5;

/** Return a conservative mapping that keeps anything the source does not state unknown. */
export function convertExercise(source) {
  if (typeof source.id !== 'string' || typeof source.name !== 'string' || !Array.isArray(source.primaryMuscles) || !Array.isArray(source.instructions)) {
    throw new Error('The vendored exercise has an invalid ID, name, muscles or instructions.');
  }
  // Prefer explicit muscle groups; do not classify an unknown body area from its name.
  const muscles = source.primaryMuscles.filter(value => typeof value === 'string');
  const category = muscles.some(value => ['abdominals', 'lower back'].includes(value)) ? 'core' : muscles.some(value => LEG_MUSCLES.includes(value)) ? 'legs' :
    muscles.some(value => UPPER_MUSCLES.includes(value)) && ['push', 'pull'].includes(source.force) ? source.force : null;
  const cue = source.instructions.filter(value => typeof value === 'string').join(' ');
  const { equipment, untracked } = mapEquipment(source.equipment, cue);
  return { id: `free-exercise-db:${source.id}`, name: source.name, category, equipment, untracked,
    requires: requirements(source, category, equipment ?? []), minutes: DEFAULT_MINUTES, cue,
    primaryMuscles: muscles, imagePath: null, sourceEquipment: typeof source.equipment === 'string' ? source.equipment : null,
    level: LEVELS.includes(source.level) ? source.level : null,
    kind: typeof source.category === 'string' ? source.category : null,
    mechanic: typeof source.mechanic === 'string' ? source.mechanic : null };
}

/**
 * Return the planner equipment, or null with the apparatus that keeps it unknown.
 *
 * The source's "body only" means no weights, not no apparatus, so its instructions are read too.
 */
function mapEquipment(sourceEquipment, cue) {
  // Ignore source equipment without a planner counterpart because it cannot be checked
  if (!Object.hasOwn(EQUIPMENT, sourceEquipment)) return { equipment: null, untracked: null };

  // Keep an exercise unknown when its instructions need something the planner cannot check
  const found = UNTRACKED.find(([pattern]) => pattern.test(cue));
  if (found !== undefined) return { equipment: null, untracked: found[1] };

  // Add the bar a body-only exercise hangs from, which the source does not list
  const listed = EQUIPMENT[sourceEquipment];
  return { equipment: sourceEquipment === 'body only' && PULL_UP_BAR.test(cue) ? ['pull_up_bar'] : listed, untracked: null };
}

/** Return the abilities the source gives evidence for: a pull-up to a bar, or jumping. */
function requirements(source, category, equipment) {
  const needs = [];
  // Pulling up to a bar, as opposed to hanging from it, is named in the exercise itself
  if (equipment.includes('pull_up_bar') && PULL_UP_NAME.test(source.name)) needs.push('pull_up');
  // A jump in the name, or a plyometric leg exercise, lands on the legs
  if (JUMP_NAME.test(source.name) || (source.category === 'plyometrics' && category === 'legs')) needs.push('jumping');
  return needs;
}

/** Write a reproducible local index without downloading data or images at build time. */
function generateIndex() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sourcePath = resolve(root, 'data/exercises/free-exercise-db');
  const bytes = readFileSync(resolve(sourcePath, 'exercises.json'));
  const licence = readFileSync(resolve(sourcePath, 'LICENSE.md'));
  if (createHash('sha256').update(bytes).digest('hex') !== DATA_SHA256 || createHash('sha256').update(licence).digest('hex') !== LICENCE_SHA256) {
    throw new Error('The vendored data or licence changed. Review and record a new pinned revision first.');
  }
  const records = JSON.parse(bytes.toString('utf8'));
  const entries = records.map(convertExercise).sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Exercise IDs must be unique.');
  const target = resolve(root, 'apps/web/src/data/exercise-index.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify({ source: { dataset: 'free-exercise-db', revision: REVISION, licence: 'Unlicense', sha256: DATA_SHA256 }, entries }) + '\n');
  console.log(`Generated ${entries.length} offline exercise records from the pinned dataset.`);
}

// Run generation only as a command; importing conversion tests has no write side effects.
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) generateIndex();
