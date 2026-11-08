import type { MovementCard } from './catalogue';

// Paraphrase basic seated movement facts from NHS sitting exercises, checked 8 Nov 2026.
// Tags are conservative project metadata, not clinical clearance; the five-minute block is editable planning time.
export const SEATED_CARDS: readonly MovementCard[] = [
  { id: 'seated_arm_raise', name: 'Seated arm raise', category: 'push', minutes: 5, equipment: [], requires: [],
    loads: ['neck', 'shoulders', 'elbows', 'wrists', 'back'], positions: ['seated'],
    cue: 'Use a stable seat. From arms by your sides, lift and lower them within a comfortable range. Check suitability with your care professional when unsure.' },
  { id: 'seated_march', name: 'Seated marching', category: 'legs', minutes: 5, equipment: [], requires: [],
    loads: ['neck', 'back', 'hips', 'knees', 'ankles', 'shoulders', 'elbows', 'wrists'], positions: ['seated'],
    cue: 'Stay supported in a stable seat. Raise one bent knee, lower it with control, then alternate. Use only a movement suitable for you.' },
  { id: 'seated_ankle', name: 'Seated ankle movement', category: 'legs', minutes: 5, equipment: [], requires: [],
    loads: ['neck', 'back', 'hips', 'knees', 'ankles', 'shoulders', 'elbows', 'wrists'], positions: ['seated'],
    cue: 'From a stable seat, support your position and gently point and draw back one foot. Use a comfortable range and alternate feet.' },
];
