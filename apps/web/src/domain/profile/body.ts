/**
 * Height, weight and the numbers worked out from them.
 *
 * Height and weight are required at setup, because nutrition and training cannot be
 * balanced for a person without them. Everything else may stay unknown, and an estimate
 * that needs an unknown fact is unknown too, never a guess.
 */
export const SEXES = ['female', 'male'] as const;
export type Sex = (typeof SEXES)[number];
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** What the person tells the app about their body, kept only on this device. */
export interface BodyFacts {
  readonly heightCm: number;
  readonly weightKg: number;
  readonly birthYear: number | null;
  readonly sex: Sex | null;
  readonly activity: ActivityLevel | null;
}

// Wide enough for any teenager or adult, narrow enough to catch a slip or the wrong unit
const HEIGHT_RANGE_CM = [100, 250] as const;
const WEIGHT_RANGE_KG = [25, 350] as const;
const BIRTH_YEAR_RANGE = [1900, 2100] as const;
// The Mifflin-St Jeor equation was built on adults, so a younger person gets no estimate
const ADULT_AGE = 18;
// The Malaysian adult guideline's cut-offs, lower than WHO's because risk rises at a lower BMI
const BMI_BELOW_RANGE = 18.5;
const BMI_OVERWEIGHT = 23;
const BMI_OBESE = 27.5;
// How much daily life adds to resting energy, using the standard Mifflin-St Jeor multipliers
const ACTIVITY_FACTORS: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };

export type BmiBand = 'below_range' | 'in_range' | 'overweight' | 'obese';

/** Throw a message the person can act on unless the facts are complete and believable. */
export function assertBodyFacts(value: unknown): asserts value is BodyFacts {
  const body = value as Record<string, unknown> | null;

  // Ignore an unrecognised field, because this record never accepts free text
  if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['heightCm', 'weightKg', 'birthYear', 'sex', 'activity'].includes(key))) {
    throw new Error('Enter your height and weight using the fields provided.');
  }

  // Check the two required numbers, finite first because NaN slips past both comparisons
  if (!Number.isFinite(body.heightCm) || (body.heightCm as number) < HEIGHT_RANGE_CM[0] || (body.heightCm as number) > HEIGHT_RANGE_CM[1]) {
    throw new RangeError(`Enter your height in centimetres, from ${HEIGHT_RANGE_CM[0]} to ${HEIGHT_RANGE_CM[1]}.`);
  }
  if (!Number.isFinite(body.weightKg) || (body.weightKg as number) < WEIGHT_RANGE_KG[0] || (body.weightKg as number) > WEIGHT_RANGE_KG[1]) {
    throw new RangeError(`Enter your weight in kilograms, from ${WEIGHT_RANGE_KG[0]} to ${WEIGHT_RANGE_KG[1]}.`);
  }

  // Check the optional facts, each of which may stay unknown
  if (body.birthYear !== null && (!Number.isInteger(body.birthYear) || (body.birthYear as number) < BIRTH_YEAR_RANGE[0] || (body.birthYear as number) > BIRTH_YEAR_RANGE[1])) {
    throw new RangeError('Enter your birth year as four digits, or leave it blank.');
  }
  if (body.sex !== null && !SEXES.includes(body.sex as Sex)) throw new Error('Choose one of the listed options, or leave it blank.');
  if (body.activity !== null && !ACTIVITY_LEVELS.includes(body.activity as ActivityLevel)) throw new Error('Choose one of the listed activity levels, or leave it blank.');
}

/** Return body mass index: kilograms divided by height in metres, squared. */
export function bodyMassIndex(body: Pick<BodyFacts, 'heightCm' | 'weightKg'>): number {
  const metres = body.heightCm / 100;
  return body.weightKg / (metres * metres);
}

/** Return which band of the Malaysian adult guideline a BMI falls in. */
export function bmiBand(bmi: number): BmiBand {
  if (bmi < BMI_BELOW_RANGE) return 'below_range';
  if (bmi < BMI_OVERWEIGHT) return 'in_range';
  return bmi < BMI_OBESE ? 'overweight' : 'obese';
}

/**
 * Return resting energy in kcal a day by the Mifflin-St Jeor equation, or null if it cannot be worked out.
 *
 * The year is passed in so the same facts always give the same answer under test.
 */
export function restingEnergy(body: BodyFacts, currentYear: number): number | null {
  // Ignore a missing fact, because the equation has no honest default for age or sex
  if (body.birthYear === null || body.sex === null || currentYear - body.birthYear < ADULT_AGE) {
    return null;
  }
  return 10 * body.weightKg + 6.25 * body.heightCm - 5 * (currentYear - body.birthYear) + (body.sex === 'male' ? 5 : -161);
}

/** Return the estimated daily energy need in kcal, or null if any fact it needs is unknown. */
export function dailyEnergy(body: BodyFacts, currentYear: number): number | null {
  const resting = restingEnergy(body, currentYear);
  return resting === null || body.activity === null ? null : resting * ACTIVITY_FACTORS[body.activity];
}
