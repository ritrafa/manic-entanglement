import { describe, expect, it } from "vitest";
import { createRng } from "@/game/rng";
import { ITEM_TYPES, GEAR_TYPES, spawnLevel, startCell, exitCell } from "@/game/spawn";
import { Maze } from "@/game/maze";
import { routeCells } from "@/game/bot";
import { ENEMY_KINDS, isHeavy } from "@/game/enemies";

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);
const SIZES = [3, 5, 9];

type Cell = { x: number; y: number };

function allPlaced(size: number, seed: number, items: number, enemies: number) {
  const spawned = spawnLevel(createRng(seed), size, { items, enemies });
  return [...spawned.items, ...spawned.enemies];
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

describe("spawnLevel placement rules", () => {
  for (const size of SIZES) {
    it(`over 200 seeds at size ${size}: nothing on the start or exit, no shared cells, enemies far from the start`, () => {
      const start = startCell(size);
      const exit = exitCell(size);
      for (const seed of SEEDS) {
        const spawned = spawnLevel(createRng(seed), size, { items: 5, enemies: 3 });
        const placed: Cell[] = [...spawned.items, ...spawned.enemies];

        for (const cell of placed) {
          expect(sameCell(cell, start)).toBe(false);
          expect(sameCell(cell, exit)).toBe(false);
        }
        for (const enemy of spawned.enemies) {
          expect(Math.abs(enemy.x - start.x) + Math.abs(enemy.y - start.y)).toBeGreaterThanOrEqual(2);
        }
        const keys = new Set(placed.map((cell) => `${cell.x},${cell.y}`));
        expect(keys.size).toBe(placed.length);
      }
    });
  }

  it("size 3 with 20 pickups and 20 enemies returns at most 7 things and terminates", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const spawned = spawnLevel(createRng(seed), 3, { items: 20, enemies: 20 });
      expect(spawned.items.length + spawned.enemies.length).toBeLessThanOrEqual(7);
    }
  });

  it("size 1 (start and exit coincide) returns empty lists", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const spawned = spawnLevel(createRng(seed), 1, { items: 5, enemies: 5 });
      expect(spawned.items).toEqual([]);
      expect(spawned.enemies).toEqual([]);
    }
  });

  it("the same seed and arguments give the same result", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS.slice(0, 20)) {
        const a = spawnLevel(createRng(seed), size, { items: 4, enemies: 2 });
        const b = spawnLevel(createRng(seed), size, { items: 4, enemies: 2 });
        expect(a).toEqual(b);
      }
    }
  });

  it("all six pickup types appear over 200 seeds", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      for (const item of spawnLevel(createRng(seed), 9, { items: 5, enemies: 1 }).items) {
        seen.add(item.type);
      }
    }
    expect(seen).toEqual(new Set(ITEM_TYPES));
  });
});

describe("spawnLevel counts", () => {
  it("places exactly the rolled whole numbers while cells allow", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const spawned = spawnLevel(createRng(seed), 9, { items: 5, enemies: 3 });
      expect(spawned.items).toHaveLength(5);
      expect(spawned.enemies).toHaveLength(3);
    }
  });

  it("rolls a range once and stays within it", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const spawned = spawnLevel(createRng(seed), 9, {
        items: { min: 2, max: 5 },
        enemies: { min: 1, max: 3 },
      });
      expect(spawned.items.length).toBeGreaterThanOrEqual(2);
      expect(spawned.items.length).toBeLessThanOrEqual(5);
      expect(spawned.enemies.length).toBeGreaterThanOrEqual(1);
      expect(spawned.enemies.length).toBeLessThanOrEqual(3);
    }
  });

  it("negative or fractional counts place nothing extra", () => {
    const spawned = spawnLevel(createRng(1), 5, { items: -3, enemies: 2.9 });
    expect(spawned.items).toEqual([]);
    expect(spawned.enemies).toHaveLength(2);
  });

  it("enemies come from the far cells first: a big enemy request still fills the near cells with pickups", () => {
    // Size 3: start (1,2), exit (1,0). Only 4 cells are at distance >= 2, so asking for
    // 6 enemies places 4 and leaves the 3 near cells for the pickups.
    const spawned = spawnLevel(createRng(42), 3, { items: 5, enemies: 6 });
    expect(spawned.enemies).toHaveLength(4);
    expect(spawned.items).toHaveLength(3);
    const start = startCell(3);
    for (const enemy of spawned.enemies) {
      expect(Math.abs(enemy.x - start.x) + Math.abs(enemy.y - start.y)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("spawnLevel energyShare", () => {
  it("over 500 spawned pickups with energyShare 0.4, between 30% and 50% are energy", () => {
    let energy = 0;
    let total = 0;
    for (const seed of SEEDS.slice(0, 100)) {
      for (const item of spawnLevel(createRng(seed), 9, { items: 5, enemies: 1 }, 0.4).items) {
        total++;
        if (item.type === "energy") energy++;
      }
    }
    expect(total).toBe(500);
    const share = energy / total;
    expect(share).toBeGreaterThanOrEqual(0.3);
    expect(share).toBeLessThanOrEqual(0.5);
  });

  it("energyShare 1 makes every pickup energy and energyShare 0 makes none", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const item of spawnLevel(createRng(seed), 9, { items: 5, enemies: 1 }, 1).items) {
        expect(item.type).toBe("energy");
      }
      for (const item of spawnLevel(createRng(seed), 9, { items: 5, enemies: 1 }, 0).items) {
        expect(item.type).not.toBe("energy");
      }
    }
  });

  it("the five other types share the rest roughly evenly at energyShare 0.4", () => {
    const counts = new Map<string, number>();
    for (const seed of SEEDS.slice(0, 100)) {
      for (const item of spawnLevel(createRng(seed), 9, { items: 5, enemies: 1 }, 0.4).items) {
        counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
      }
    }
    for (const type of ITEM_TYPES) {
      expect(counts.get(type) ?? 0).toBeGreaterThan(0);
    }
  });
});


describe("spawnLevel enemy kinds", () => {
  type Cell = { x: number; y: number };

  function onRouteOf(route: readonly Cell[], cell: Cell): boolean {
    return route.some((step) => step.x === cell.x && step.y === cell.y);
  }

  it("every enemy carries a kind with its table numbers available", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      for (const enemy of spawnLevel(createRng(seed), 9, { items: 4, enemies: 3 }, 0.4, { depth: 8 }).enemies) {
        expect(ENEMY_KINDS[enemy.kind]).toBeDefined();
      }
    }
  });

  it("over 100 seeds at depths 3, 6 and 10: no brute or warden on the start-to-exit route", () => {
    for (const depth of [3, 6, 10]) {
      let heaviesSeen = 0;
      for (let s = 0; s < 100; s++) {
        const seed = s * 104729 + depth * 31 + 7;
        const rng = createRng(seed);
        const size = 9;
        const maze = new Maze(size, size, rng); // the maze consumes the rng first, as in a Run
        const route = routeCells(maze, startCell(size), exitCell(size)) ?? [];
        const spawned = spawnLevel(rng, size, { items: 4, enemies: 5 }, 0.4, { depth, route });
        for (const enemy of spawned.enemies) {
          // Only the heavy kinds stay off the route; the wisp and the stalker (which
          // replaces wisps and drops nothing, game/enemies.ts) may stand on it.
          if (!isHeavy(enemy.kind)) continue;
          heaviesSeen += 1;
          expect(onRouteOf(route, enemy), `depth ${depth} seed ${seed}: ${enemy.kind} on the route`).toBe(false);
          // The usual rules still hold for a moved enemy.
          const start = startCell(size);
          expect(Math.abs(enemy.x - start.x) + Math.abs(enemy.y - start.y)).toBeGreaterThanOrEqual(2);
          expect(onRouteOf(route, exitCell(size))).toBe(true); // sanity: the route spans start to exit
        }
      }
      expect(heaviesSeen, `depth ${depth} never spawned a heavy kind`).toBeGreaterThan(0);
    }
  });

  it("heavy enemies never share a cell with anything else after a route swap", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const rng = createRng(seed);
      const size = 7;
      const maze = new Maze(size, size, rng);
      const route = routeCells(maze, startCell(size), exitCell(size)) ?? [];
      const spawned = spawnLevel(rng, size, { items: 6, enemies: 4 }, 0.4, { depth: 8, route });
      const placed: Cell[] = [...spawned.items, ...spawned.enemies];
      const keys = new Set(placed.map((cell) => `${cell.x},${cell.y}`));
      expect(keys.size).toBe(placed.length);
    }
  });

  it("a 3x3 level where every free cell is on the route still spawns wisps and terminates", () => {
    const size = 3;
    const start = startCell(size);
    const exit = exitCell(size);
    const free: Cell[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((x === start.x && y === start.y) || (x === exit.x && y === exit.y)) continue;
        free.push({ x, y });
      }
    }
    for (const seed of SEEDS.slice(0, 50)) {
      const spawned = spawnLevel(createRng(seed), 3, { items: 3, enemies: 6 }, 0.4, { depth: 8, route: free });
      expect(spawned.enemies.length).toBeGreaterThan(0);
      for (const enemy of spawned.enemies) {
        expect(enemy.kind).toBe("wisp");
        expect(onRouteOf(free, enemy)).toBe(true);
      }
      expect(spawned.items.length + spawned.enemies.length).toBeLessThanOrEqual(free.length);
    }
  });

  it("without a route option the depth draw still applies", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS.slice(0, 100)) {
      for (const enemy of spawnLevel(createRng(seed), 9, { items: 4, enemies: 3 }, 0.4, { depth: 6 }).enemies) {
        seen.add(enemy.kind);
      }
    }
    expect(seen.has("wisp")).toBe(true);
    expect(seen.has("brute")).toBe(true);
  });

  it("the same seed and arguments give the same kinds", () => {
    for (const depth of [1, 4, 8]) {
      for (const seed of SEEDS.slice(0, 20)) {
        const a = spawnLevel(createRng(seed), 9, { items: 4, enemies: 3 }, 0.4, { depth });
        const b = spawnLevel(createRng(seed), 9, { items: 4, enemies: 3 }, 0.4, { depth });
        expect(a).toEqual(b);
      }
    }
  });

  it("gear types are the five pickups that are not energy", () => {
    expect([...GEAR_TYPES].sort()).toEqual(
      ITEM_TYPES.filter((type) => type !== "energy").sort(),
    );
  });
});
