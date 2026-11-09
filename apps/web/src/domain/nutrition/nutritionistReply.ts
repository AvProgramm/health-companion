import { isAnsweredBy, isClaim, isSource, type CoachClaim, type CoachSource } from '../coach/coachReply';

/** One idea to try: text for the entry box, and the checked reason behind it. */
export interface NutritionistSuggestion {
  title: string;
  entry: string;
  why: CoachClaim;
}

/** What the Nutritionist decided to show, and why. */
export interface NutritionistReply {
  mode: 'suggestions' | 'excerpts' | 'no_evidence' | 'refused';
  message: string;
  suggestions: NutritionistSuggestion[];
  sources: CoachSource[];
  answeredBy?: string | null;
}

// Every outcome this app knows how to display
const MODES: readonly string[] = ['suggestions', 'excerpts', 'no_evidence', 'refused'];

/** Return whether a value is one displayable suggestion. */
function isSuggestion(value: unknown): value is NutritionistSuggestion {
  const suggestion = value as Partial<NutritionistSuggestion> | null;
  return suggestion !== null && typeof suggestion === 'object' && typeof suggestion.title === 'string' && typeof suggestion.entry === 'string' && isClaim(suggestion.why);
}

/** Return a validated reply, rejecting anything the service should never send. */
export function readNutritionistReply(value: unknown): NutritionistReply {
  const reply = value as Partial<NutritionistReply> | null;
  if (reply === null || typeof reply !== 'object' || typeof reply.mode !== 'string' || !MODES.includes(reply.mode) || typeof reply.message !== 'string'
      || !Array.isArray(reply.suggestions) || !reply.suggestions.every(isSuggestion) || !Array.isArray(reply.sources) || !reply.sources.every(isSource) || !isAnsweredBy(reply.answeredBy)) {
    throw new Error('The Nutritionist sent a reply this app could not read. Your diary still works.');
  }
  return reply as NutritionistReply;
}
