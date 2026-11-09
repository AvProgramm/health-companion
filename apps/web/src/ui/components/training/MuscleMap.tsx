import type { Category } from '../../../domain/training/catalogue';

interface MuscleMapProps { category: Category | null; muscles?: readonly string[] }

/** Draw an offline target illustration without making an injury or safety assessment. */
export function MuscleMap({ category, muscles = [] }: MuscleMapProps) {
  // Use source muscle names when present; reviewed cards fall back to their broad category.
  const names = muscles.join(' ').toLowerCase();
  const push = muscles.length > 0 ? /chest|triceps|shoulders/.test(names) : category === 'push';
  const pull = muscles.length > 0 ? /back|lats|traps|biceps|forearms/.test(names) : category === 'pull';
  const legs = muscles.length > 0 ? /quadriceps|hamstrings|glutes|calves|adductors|abductors/.test(names) : category === 'legs';
  const core = muscles.length > 0 ? /abdominals/.test(names) : category === 'core';
  return <svg className="muscle-map" viewBox="0 0 120 160" role="img" aria-label={`Target illustration: ${muscles.join(', ') || category || 'not mapped'}`}>
    <g className="body-base"><circle cx="31" cy="20" r="10" /><path d="M20 36 Q31 30 42 36 L46 79 L40 91 L39 143 Q35 149 31 143 L28 99 L25 143 Q21 149 17 143 L18 91 L16 79 Z" /><path d="M17 38 L9 72 L10 99 M44 38 L52 72 L51 99" />
      <circle cx="89" cy="20" r="10" /><path d="M78 36 Q89 30 100 36 L104 79 L98 91 L97 143 Q93 149 89 143 L86 99 L83 143 Q79 149 75 143 L76 91 L74 79 Z" /><path d="M75 38 L67 72 L68 99 M102 38 L110 72 L109 99" /></g>
    <path className={push ? 'muscle-active' : 'muscle-rest'} d="M21 40 Q31 36 41 40 L40 57 L32 59 L30 59 L22 57 Z" />
    <path className={core ? 'muscle-active' : 'muscle-rest'} d="M23 63 L39 63 L37 85 L25 85 Z" />
    <path className={pull ? 'muscle-active' : 'muscle-rest'} d="M79 40 Q89 35 99 40 L97 67 L89 76 L81 67 Z" />
    <path className={legs ? 'muscle-active' : 'muscle-rest'} d="M20 94 L28 94 L25 126 L18 126 Z M33 94 L40 94 L39 126 L34 126 Z M78 94 L86 94 L83 126 L76 126 Z M91 94 L98 94 L97 126 L92 126 Z" />
    <text x="30" y="158" textAnchor="middle">FRONT</text><text x="89" y="158" textAnchor="middle">BACK</text>
  </svg>;
}
