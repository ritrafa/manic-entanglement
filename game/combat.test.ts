import { describe, expect, it } from "vitest";
import { fightCost } from "@/game/combat";
import { CONFIG } from "@/game/config";

const ENEMY = CONFIG.enemy; // { hp: 3, power: 6 }

describe("fightCost", () => {
  it("costs 15 at default stats and config", () => {
    expect(fightCost({ attack: 1, defense: 1 }, ENEMY)).toBe(15);
  });

  it("stays a finite whole number between 1 and 999 for broken attacks", () => {
    for (const attack of [0, -3, NaN]) {
      const cost = fightCost({ attack, defense: 1 }, ENEMY);
      expect(Number.isFinite(cost)).toBe(true);
      expect(Number.isInteger(cost)).toBe(true);
      expect(cost).toBeGreaterThanOrEqual(1);
      expect(cost).toBeLessThanOrEqual(999);
    }
  });

  it("never drops below 1 for a huge defense", () => {
    const cost = fightCost({ attack: 1, defense: 50 }, ENEMY);
    expect(cost).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(cost)).toBe(true);
  });

  it("scales with attack and bottoms the power difference out at 1", () => {
    expect(fightCost({ attack: 3, defense: 1 }, ENEMY)).toBe(5); // 3 / 3 * (6 - 1)
    expect(fightCost({ attack: 1, defense: 5.5 }, ENEMY)).toBe(3); // 3 / 1 * max(1, 0.5)
  });

  it("treats a non-finite stat as its default", () => {
    expect(fightCost({ attack: NaN, defense: 1 }, ENEMY)).toBe(15);
    expect(fightCost({ attack: Infinity, defense: 1 }, ENEMY)).toBe(15);
    expect(fightCost({ attack: 1, defense: NaN }, ENEMY)).toBe(15);
    expect(fightCost({ attack: 1, defense: -Infinity }, ENEMY)).toBe(15);
  });

  it("always returns an integer", () => {
    const attacks = [0, 0.05, 0.1, 0.3, 1, 1.5, 2, 3, 7.77, 1000, -2, NaN];
    const defenses = [-10, 0, 1, 2.5, 5.5, 6, 50, NaN];
    for (const attack of attacks) {
      for (const defense of defenses) {
        const cost = fightCost({ attack, defense }, ENEMY);
        expect(Number.isInteger(cost)).toBe(true);
        expect(cost).toBeGreaterThanOrEqual(1);
        expect(cost).toBeLessThanOrEqual(999);
      }
    }
  });

  it("clamps extreme costs to 1..999", () => {
    expect(fightCost({ attack: 0.1, defense: 1 }, { hp: 100000, power: 100000 })).toBe(999);
    expect(fightCost({ attack: 100000, defense: 1 }, ENEMY)).toBe(1);
  });
});
