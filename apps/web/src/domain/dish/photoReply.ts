import { isAnsweredBy } from '../coach/coachReply';

/** One food a vision model saw: its name, and how it would be typed in the diary. */
export interface PhotoFood {
  name: string;
  entry: string;
}

/** The checked foods in one photo, or an honest reason for none. */
export interface PhotoReply {
  mode: 'foods' | 'nothing';
  message: string;
  foods: PhotoFood[];
  answeredBy?: string | null;
}

// Every outcome this app knows how to display
const MODES: readonly string[] = ['foods', 'nothing'];

/** Return whether a value is one displayable food. */
function isPhotoFood(value: unknown): value is PhotoFood {
  const food = value as Partial<PhotoFood> | null;
  return food !== null && typeof food === 'object' && typeof food.name === 'string' && typeof food.entry === 'string' && food.entry.trim() !== '';
}

/** Return a validated reply, rejecting anything the service should never send. */
export function readPhotoReply(value: unknown): PhotoReply {
  const reply = value as Partial<PhotoReply> | null;
  if (reply === null || typeof reply !== 'object' || typeof reply.mode !== 'string' || !MODES.includes(reply.mode) || typeof reply.message !== 'string'
      || !Array.isArray(reply.foods) || !reply.foods.every(isPhotoFood) || !isAnsweredBy(reply.answeredBy)) {
    throw new Error('The photo reader sent a reply this app could not read. Type what you ate instead.');
  }
  return reply as PhotoReply;
}

/**
 * Return the foods joined as one entry, the way someone would type a meal.
 *
 * Commas are what the composer splits items on, so each food becomes its own draft item.
 */
export function photoEntry(foods: readonly PhotoFood[]): string {
  return foods.map((food) => food.entry).join(', ');
}
