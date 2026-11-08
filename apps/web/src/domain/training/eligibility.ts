import type { BodyArea } from '../profile/profile';
/**
 * The planner's hard filters: what can never be in today's plan, and why.
 *
 * These run before any search and are never relaxed to fill a session, so a
 * card someone cannot do or does not want can never appear, however well it
 * would score. Each exclusion keeps its reason so the screen can explain it.
 */
import type { Capability, Category, Equipment, MovementCard } from './catalogue';

/**
 * What the person has today and what they want from the session.
 */
export interface PlanRequest {
  minutes: number;
  avoidAreas?: readonly BodyArea[];
  seatedOnly?: boolean;
  equipment: readonly Equipment[];
  unableTo: readonly Capability[];
  neverSuggest: readonly string[];
  categories: readonly Category[];
  // A higher number means the person likes that card more; unknown cards count as 0
  preferences: Readonly<Record<string, number>>;
}

// How each blocked ability reads in a sentence
const CAPABILITY_TEXT: Record<Capability, string> = { pull_up: 'a pull-up', jumping: 'jumping' };

// How each missing piece of equipment reads in a sentence
const EQUIPMENT_TEXT: Record<Equipment, string> = { dumbbells: 'dumbbells', band: 'a resistance band', pull_up_bar: 'a pull-up bar',
  kettlebells: 'kettlebells', barbell: 'a barbell', ez_curl_bar: 'an EZ curl bar', cable: 'a cable station', machine: 'a gym machine',
  medicine_ball: 'a medicine ball', exercise_ball: 'an exercise ball', foam_roll: 'a foam roller' };

/**
 * Return why a card cannot be in today's plan, or null if it can.
 *
 * The checks run from the firmest rule to the most changeable one, so the
 * reason shown is the one that would still apply with more time.
 */
export function ineligibleReason(card: MovementCard, request: PlanRequest): string | null {
  // Never suggest a card the person has ruled out
  if (request.neverSuggest.includes(card.id)) {
    return 'you asked never to suggest it';
  }

  // Ignore unknown loads because an avoided area cannot be checked from a missing fact.
  if ((request.avoidAreas?.length ?? 0) > 0) {
    if (card.loads == null) return 'its loaded areas are unknown';
    const avoided = card.loads.find(area => request.avoidAreas!.includes(area));
    if (avoided !== undefined) return `it loads your ${avoided}`;
  }

  // Ignore a non-seated or unknown position because seated-only requires every position to be seated.
  if (request.seatedOnly) {
    if (card.positions == null || card.positions.length === 0) return 'its required positions are unknown';
    if (card.positions.some(position => position !== 'seated')) return 'it needs a position other than seated';
  }

  // Ignore a card that needs something the person cannot do
  const blocked = card.requires.find((capability) => request.unableTo.includes(capability));
  if (blocked !== undefined) {
    return `it needs ${CAPABILITY_TEXT[blocked]}`;
  }

  // Ignore a card that needs equipment the person does not have
  const missing = card.equipment.find((item) => !request.equipment.includes(item));
  if (missing !== undefined) {
    return `it needs ${EQUIPMENT_TEXT[missing]}`;
  }

  // Ignore a card from an area the person did not choose, because filling time is not a reason to add it
  if (!request.categories.includes(card.category)) {
    return `it trains ${card.category}, which you did not choose today`;
  }

  // Ignore a card that is longer than the whole session on its own
  if (card.minutes > request.minutes) {
    return `it takes ${card.minutes} min and you have ${request.minutes}`;
  }

  return null;
}

/**
 * Return the cards that may be planned, in ID order, and the rest with their reasons.
 *
 * ID order makes the search, and so the result, the same every time.
 */
export function splitCards(request: PlanRequest, catalogue: readonly MovementCard[]) {
  const eligible: MovementCard[] = [];
  const excluded: { card: MovementCard; reason: string }[] = [];

  for (const card of [...catalogue].sort((a, b) => a.id.localeCompare(b.id))) {
    const reason = ineligibleReason(card, request);
    if (reason === null) {
      eligible.push(card);
    } else {
      excluded.push({ card, reason });
    }
  }

  // Return both lists so the screen can say why something was left out
  return { eligible, excluded };
}
