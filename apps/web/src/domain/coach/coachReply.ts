/** One checked sentence and the cards behind it. */
export interface CoachClaim {
  text: string;
  cites: number[];
}

/** One reviewed card, shown as plain text. */
export interface CoachSource {
  number: number;
  title: string;
  source: string;
  sourceDate: string;
  url: string;
  excerpt: string;
}

/** What the Coach decided to show, and why. */
export interface CoachReply {
  mode: 'answer' | 'excerpts' | 'no_evidence' | 'refused';
  message: string;
  claims: CoachClaim[];
  sources: CoachSource[];
}

// Every outcome this app knows how to display
const MODES: readonly string[] = ['answer', 'excerpts', 'no_evidence', 'refused'];

/** Return whether a value is one displayable source. */
function isSource(value: unknown): value is CoachSource {
  const source = value as Partial<CoachSource> | null;
  return source !== null && typeof source === 'object' && typeof source.number === 'number' && typeof source.title === 'string'
    && typeof source.source === 'string' && typeof source.sourceDate === 'string' && typeof source.url === 'string' && typeof source.excerpt === 'string';
}

/** Return whether a value is one displayable claim. */
function isClaim(value: unknown): value is CoachClaim {
  const claim = value as Partial<CoachClaim> | null;
  return claim !== null && typeof claim === 'object' && typeof claim.text === 'string' && Array.isArray(claim.cites) && claim.cites.every(cite => typeof cite === 'number');
}

/** Return a validated reply, rejecting anything the service should never send. */
export function readCoachReply(value: unknown): CoachReply {
  const reply = value as Partial<CoachReply> | null;
  if (reply === null || typeof reply !== 'object' || typeof reply.mode !== 'string' || !MODES.includes(reply.mode) || typeof reply.message !== 'string'
      || !Array.isArray(reply.claims) || !reply.claims.every(isClaim) || !Array.isArray(reply.sources) || !reply.sources.every(isSource)) {
    throw new Error('The Coach sent a reply this app could not read. Your diary still works.');
  }
  return reply as CoachReply;
}
