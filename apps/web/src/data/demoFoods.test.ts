import { describe, expect, it } from 'vitest';
import { fixtureFoods } from '../domain/goldenFixture';
import { DEMO_BISCUIT, DEMO_MILK } from './demoFoods';

describe('demo foods', () => {
  // The page and the tests must use the same numbers, or a passing test proves nothing
  it.each([DEMO_MILK, DEMO_BISCUIT])('$id matches the golden fixture', (food) => {
    const fromFixture = fixtureFoods().get(food.id);
    expect(food.basis).toEqual(fromFixture?.basis);
    expect(food.nutrients).toEqual(fromFixture?.nutrients);
  });
});
