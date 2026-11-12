import { describe, expect, it } from "vitest";
import { fightCost } from "@/game/combat";
import { CONFIG } from "@/game/config";

const ENEMY = CONFIG.enemy;

describe("fightCost", () => {
  it("costs 15 at default stats and the config enemy", () => {
    expect(fightCost({ attack: 1, defense: 1 }, ENEMY)).toBe(15);
  });

  it("stays a whole number between 1 and 999 for broken attacks", () => {
    for (const attack of [0, -3, NaN]) {
      const cost = fightCost({ attack, defense: 1 }, ENEMY);
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThanOrEqual(1);
      expect(cost).toBeLessThanOrEqual(999);
    }
  });

  it("never drops below 1 for a defense above the power", () => {
    const cost = fightCost({ attack: 1, defense: 50 }, ENEMY);
    expect(cost).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it("costs 5 with attack 3 and defense 1", () => {
    expect(fightCost({ attack: 3, defense: 1 }, ENEMY)).toBe(5);
  });

  it("costs 3 with attack 1 and defense 5.5 (the difference bottoms out at 1)", () => {
    expect(fightCost({ attack: 1, defense: 5.5 }, ENEMY)).toBe(3);
  });

  it("is always an integer", () => {
    for (const attack of [0.7, 1, 1.3, 2, 3.5, 7]) {
      for (const defense of [-2, 0, 1, 2.5, 5.5, 50]) {
        expect(Number.isInteger(fightCost({ attack, defense }, ENEMY))).toBe(true);
      }
    }
  });

  it("treats a non-finite stat as its default", () => {
    const defaults = fightCost({ attack: 1, defense: 1 }, ENEMY);
    expect(fightCost({ attack: NaN, defense: 1 }, ENEMY)).toBe(defaults);
    expect(fightCost({ attack: 1, defense: NaN }, ENEMY)).toBe(defaults);
    expect(fightCost({ attack: Infinity, defense: -Infinity }, ENEMY)).toBe(defaults);
  });

  it("clamps to 1..999", () => {
    expect(fightCost({ attack: 1, defense: 1 }, { hp: 0, power: 0 })).toBe(1);
    expect(fightCost({ attack: 0.1, defense: 1 }, { hp: 1000, power: 1000 })).toBe(999);
  });

  it("is never negative nor NaN for any stat", () => {
    for (const attack of [NaN, -Infinity, -10, 0, 0.05, 1, 100]) {
      for (const defense of [NaN, -Infinity, 0, 1, 100, Infinity]) {
        const cost = fightCost({ attack, defense }, ENEMY);
        expect(Number.isFinite(cost)).toBe(true);
        expect(cost).toBeGreaterThanOrEqual(1);
        expect(cost).toBeLessThanOrEqual(999);
      }
    }
  });
});
