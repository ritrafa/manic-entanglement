import { describe, expect, it } from "vitest";
import { spawnLevel, startCell, exitCell, ITEM_TYPES } from "@/game/spawn";
import { createRng } from "@/game/rng";
import type { ItemType } from "@/game/events";

const SIZES = [3, 5, 9];
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7 + 1);

function cellKey(c: { x: number; y: number }): string {
  return `${c.x},${c.y}`;
}

describe("spawnLevel placement rules", () => {
  it("never uses the start or the exit, never shares a cell, keeps enemies >= 2 from the start", () => {
    for (const size of SIZES) {
      const start = startCell(size);
      const exit = exitCell(size);
      for (const seed of SEEDS) {
        const { items, enemies } = spawnLevel(createRng(seed), size, { items: 5, enemies: 3 });
        for (const spot of [start, exit]) {
          expect(items.some((i) => i.x === spot.x && i.y === spot.y)).toBe(false);
          expect(enemies.some((e) => e.x === spot.x && e.y === spot.y)).toBe(false);
        }
        const all = [...items, ...enemies].map(cellKey);
        expect(new Set(all).size).toBe(all.length);
        for (const enemy of enemies) {
          expect(Math.abs(enemy.x - start.x) + Math.abs(enemy.y - start.y)).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("places exactly the requested whole numbers when enough cells exist", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const { items, enemies } = spawnLevel(createRng(seed), size, { items: 4, enemies: 2 });
        expect(items).toHaveLength(4);
        expect(enemies).toHaveLength(2);
      }
    }
  });

  it("rolls a range once and stays within it", () => {
    for (const seed of SEEDS) {
      const { items, enemies } = spawnLevel(createRng(seed), 9, {
        items: { min: 2, max: 5 },
        enemies: { min: 1, max: 3 },
      });
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items.length).toBeLessThanOrEqual(5);
      expect(enemies.length).toBeGreaterThanOrEqual(1);
      expect(enemies.length).toBeLessThanOrEqual(3);
    }
  });

  it("size 3 with 20 pickups and 20 enemies requested returns at most 7 things and terminates", () => {
    // 3x3 has 9 cells; the start and the exit take two, so at most 7 things fit.
    for (const seed of SEEDS) {
      const { items, enemies } = spawnLevel(createRng(seed), 3, { items: 20, enemies: 20 });
      expect(items.length + enemies.length).toBeLessThanOrEqual(7);
    }
  });

  it("size 1 (start and exit coincide) returns empty lists", () => {
    for (const seed of SEEDS) {
      const { items, enemies } = spawnLevel(createRng(seed), 1, { items: 5, enemies: 5 });
      expect(items).toEqual([]);
      expect(enemies).toEqual([]);
    }
  });

  it("the same seed gives the same result", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const a = spawnLevel(createRng(seed), size, { items: { min: 2, max: 5 }, enemies: 3 });
        const b = spawnLevel(createRng(seed), size, { items: { min: 2, max: 5 }, enemies: 3 });
        expect(a).toEqual(b);
      }
    }
  });

  it("all six pickup types appear over 200 seeds", () => {
    const seen = new Set<ItemType>();
    for (const seed of SEEDS) {
      const { items } = spawnLevel(createRng(seed), 9, { items: 5, enemies: 0 });
      for (const item of items) seen.add(item.type);
    }
    expect(seen).toEqual(new Set(ITEM_TYPES));
  });

  it("every pickup has one of the six types", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const { items } = spawnLevel(createRng(seed), size, { items: 5, enemies: 1 });
        for (const item of items) expect(ITEM_TYPES).toContain(item.type);
      }
    }
  });
});
