import type { CoachSource } from '../../../domain/coach/coachReply';

/**
 * Display one reviewed card as plain text, so its source can be read but not followed.
 */
export function SourceLine({ source }: { source: CoachSource }) {
  return <li className="hint"><strong>[{source.number}] {source.title}.</strong> {source.excerpt} {source.source}, {source.sourceDate}. {source.url}</li>;
}
