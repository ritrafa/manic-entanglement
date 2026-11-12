// The three enemy kinds: their table numbers, the base costs the fight formula
// gives at default stats, and the seeded depth draw of enemyFor.
import { describe, expect, it } from "vitest";
import { createRng } from "@/game/rng";
import { fightCost } from "@/game/combat";
import { ENEMY_KINDS, ENEMY_KIND_LIST, enemyFor, isHeavy, type EnemyKind } from "@/game/enemies";

const DEFAULT_STATS = { attack: 1, defense: 1 };

describe("ENEMY_KINDS", () => {
  it("carries the table numbers", () => {
    expect(ENEMY_KINDS.wisp).toEqual({ hp: 3, power: 6, fromDepth: 1, drops: 0, baseCost: 15 });
    expect(ENEMY_KINDS.brute).toEqual({ hp: 6, power: 6, fromDepth: 3, drops: 1, baseCost: 30 });
    expect(ENEMY_KINDS.warden).toEqual({ hp: 9, power: 7, fromDepth: 6, drops: 2, baseCost: 54 });
    expect(ENEMY_KINDS.stalker).toEqual({ hp: 3, power: 6, fromDepth: 4, drops: 0, baseCost: 15 });
  });

  it("the base cost is what fightCost gives at the default stats", () => {
    for (const kind of ENEMY_KIND_LIST) {
      expect(fightCost(DEFAULT_STATS, ENEMY_KINDS[kind])).toBe(ENEMY_KINDS[kind].baseCost);
    }
  });

  it("only the two heavy kinds are heavy", () => {
    expect(isHeavy("wisp")).toBe(false);
    expect(isHeavy("stalker")).toBe(false);
    expect(isHeavy("brute")).toBe(true);
    expect(isHeavy("warden")).toBe(true);
  });
});

describe("enemyFor", () => {
  it("depths 1 and 2 are always wisp over 500 draws each", () => {
    const rng = createRng(1234);
    for (const depth of [1, 2]) {
      for (let i = 0; i < 500; i++) {
        expect(enemyFor(depth, rng)).toBe("wisp");
      }
    }
  });

  it("depth 4 never draws a warden", () => {
    const rng = createRng(555);
    for (let i = 0; i < 500; i++) {
      expect(enemyFor(4, rng)).not.toBe("warden");
    }
  });

  it("depth 3 draws wisps and brutes but no warden", () => {
    const rng = createRng(321);
    const seen = new Set<EnemyKind>();
    for (let i = 0; i < 500; i++) seen.add(enemyFor(3, rng));
    expect(seen).toEqual(new Set(["wisp", "brute"]));
  });

  it("depth 8 draws the three table kinds within 10 points and never the stalker", () => {
    const drawn = ["wisp", "brute", "warden"] as const;
    type DrawnKind = (typeof drawn)[number];
    const rng = createRng(9);
    const draws = 3000;
    const counts: Record<DrawnKind, number> = { wisp: 0, brute: 0, warden: 0 };
    for (let i = 0; i < draws; i++) {
      const kind = enemyFor(8, rng);
      expect(kind, "enemyFor never draws the stalker").not.toBe("stalker");
      counts[kind as DrawnKind] += 1;
    }
    const table: Record<DrawnKind, number> = { wisp: 0.5, brute: 0.35, warden: 0.15 };
    for (const kind of drawn) {
      expect(counts[kind], `${kind} never appeared`).toBeGreaterThan(0);
      const share = counts[kind] / draws;
      expect(Math.abs(share - table[kind]), `${kind} share ${share}`).toBeLessThan(0.1);
    }
  });

  it("the same rng state gives the same kind", () => {
    const rng = createRng(77);
    for (const depth of [1, 4, 8]) {
      expect(enemyFor(depth, rng.clone())).toEqual(enemyFor(depth, rng.clone()));
    }
  });

  it("depths below 1 or not a number count as 1: always wisp", () => {
    const rng = createRng(5);
    for (const depth of [0, -3, NaN, -Infinity]) {
      for (let i = 0; i < 20; i++) expect(enemyFor(depth, rng)).toBe("wisp");
    }
  });
});
