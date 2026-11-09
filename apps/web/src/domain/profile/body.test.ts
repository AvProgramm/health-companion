import { describe, expect, it } from 'vitest';
import { assertBodyFacts, bmiBand, bodyMassIndex, dailyEnergy, restingEnergy, type BodyFacts } from './body';
import { assertProfile, EMPTY_PROFILE } from './profile';

// A complete fictional person, changing only what a test cares about
const BODY: BodyFacts = { heightCm: 175, weightKg: 70, birthYear: 1996, sex: 'male', activity: 'moderate' };
// The year the fictional person is exactly 30
const YEAR = 2026;

describe('body mass index', () => {
  it('matches the value worked by hand', () => {
    // 70 / 1.75 / 1.75
    expect(bodyMassIndex(BODY)).toBeCloseTo(22.857142857, 9);
  });

  it.each([[18.4, 'below_range'], [18.5, 'in_range'], [22.9, 'in_range'], [23, 'overweight'], [27.4, 'overweight'], [27.5, 'obese']])('puts %d in the %s band', (bmi, band) => {
    expect(bmiBand(bmi as number)).toBe(band);
  });
});

describe('energy estimates', () => {
  it('matches the Mifflin-St Jeor value worked by hand for a man', () => {
    // 700 + 1093.75 - 150 + 5
    expect(restingEnergy(BODY, YEAR)).toBeCloseTo(1648.75, 9);
  });

  it('matches the Mifflin-St Jeor value worked by hand for a woman', () => {
    // 700 + 1093.75 - 150 - 161
    expect(restingEnergy({ ...BODY, sex: 'female' }, YEAR)).toBeCloseTo(1482.75, 9);
  });

  it('applies the activity multiplier', () => {
    // 1648.75 x 1.55
    expect(dailyEnergy(BODY, YEAR)).toBeCloseTo(2555.5625, 9);
  });

  it.each([[{ birthYear: null }], [{ sex: null }]])('stays unknown without age or sex: %j', (changes) => {
    expect(restingEnergy({ ...BODY, ...changes } as BodyFacts, YEAR)).toBeNull();
    expect(dailyEnergy({ ...BODY, ...changes } as BodyFacts, YEAR)).toBeNull();
  });

  it('gives resting energy but no daily estimate without an activity level', () => {
    expect(restingEnergy({ ...BODY, activity: null }, YEAR)).not.toBeNull();
    expect(dailyEnergy({ ...BODY, activity: null }, YEAR)).toBeNull();
  });

  it('gives no estimate for someone under 18', () => {
    expect(restingEnergy({ ...BODY, birthYear: 2009 }, YEAR)).toBeNull();
  });
});

describe('checking what was entered', () => {
  it('accepts complete facts and facts with the optional ones blank', () => {
    expect(() => assertBodyFacts(BODY)).not.toThrow();
    expect(() => assertBodyFacts({ ...BODY, birthYear: null, sex: null, activity: null })).not.toThrow();
  });

  it.each([[99], [251], [Number.NaN]])('refuses a height of %d', (heightCm) => {
    expect(() => assertBodyFacts({ ...BODY, heightCm })).toThrow(/[Hh]eight/);
  });

  it.each([[24], [351], [Number.POSITIVE_INFINITY]])('refuses a weight of %d', (weightKg) => {
    expect(() => assertBodyFacts({ ...BODY, weightKg })).toThrow(/[Ww]eight/);
  });

  // Pressing Save with the boxes empty should say what to do, not mention NaN
  it('asks for the height in plain words when the box is empty', () => {
    expect(() => assertBodyFacts({ ...BODY, heightCm: Number.NaN })).toThrow('Enter your height in centimetres, from 100 to 250.');
  });

  it('refuses an impossible birth year, an unlisted option and extra fields', () => {
    expect(() => assertBodyFacts({ ...BODY, birthYear: 96 })).toThrow(/birth year/);
    expect(() => assertBodyFacts({ ...BODY, sex: 'other' })).toThrow(/listed/);
    expect(() => assertBodyFacts({ ...BODY, activity: 'couch' })).toThrow(/activity/);
    expect(() => assertBodyFacts({ ...BODY, notes: 'free text' })).toThrow(/fields provided/);
  });
});

describe('profiles', () => {
  it('still accepts an older profile that has no body facts', () => {
    expect(() => assertProfile(EMPTY_PROFILE)).not.toThrow();
  });

  it('accepts body facts inside a profile', () => {
    expect(() => assertProfile({ ...EMPTY_PROFILE, body: BODY })).not.toThrow();
  });

  it('refuses unusable body facts inside a profile', () => {
    expect(() => assertProfile({ ...EMPTY_PROFILE, body: { ...BODY, heightCm: 5 } })).toThrow(/height/);
  });
});
