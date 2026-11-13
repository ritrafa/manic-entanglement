import { describe, expect, it } from "vitest";
import { levelPlan } from "@/game/plan";
import { CONFIG } from "@/game/config";
import { MODE_IDS, MODES } from "@/game/modes";

describe("levelPlan depth curve", () => {
  it("depths 1 to 12 give the pinned sizes and shifts", () => {
    const sizes = [5, 5, 7, 7, 9, 9, 11, 11, 13, 13, 15, 15];
    const shifts = [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8];
    for (let depth = 1; depth <= 12; depth++) {
      const plan = levelPlan(depth);
      expect(plan.size, `size at depth ${depth}`).toBe(sizes[depth - 1]);
      expect(plan.shifts, `shifts at depth ${depth}`).toBe(shifts[depth - 1]);
    }
  });

  it("the maze keeps growing past the old 13 cap (E54)", () => {
    expect(levelPlan(13).size).toBe(17);
    expect(levelPlan(21).size).toBe(25);
    expect(levelPlan(41).size).toBe(45);
  });

  it("depth 40 still caps shifts at 9 and enemies at 6, but not the size", () => {
    const plan = levelPlan(40);
    expect(plan.size).toBe(43);
    expect(plan.shifts).toBe(9);
    expect(plan.enemies).toBe(6);
  });

  it("the size is always odd, never below the start and follows the curve up to depth 200", () => {
    for (let depth = 1; depth <= 200; depth++) {
      const plan = levelPlan(depth);
      expect(plan.size % 2).toBe(1);
      expect(plan.size).toBeGreaterThanOrEqual(CONFIG.startSize);
      expect(plan.size).toBe(CONFIG.startSize + CONFIG.sizeStep * Math.floor((depth - 1) / 2));
    }
  });

  it("no mode overrides the size: every mode plans the same maze at a depth", () => {
    const pinned: Record<number, number> = { 1: 5, 7: 11, 13: 17, 41: 45 };
    for (const id of MODE_IDS) {
      expect(Object.keys(MODES[id]).some((key) => key.toLowerCase().includes("size"))).toBe(false);
      for (const [depth, size] of Object.entries(pinned)) {
        expect(levelPlan(Number(depth)).size, `size at depth ${depth} in ${id}`).toBe(size);
      }
    }
  });

  it("the other fields follow the formula at every depth", () => {
    for (let depth = 1; depth <= 60; depth++) {
      const plan = levelPlan(depth);
      expect(plan.items).toEqual([2, 2 + Math.floor(plan.size / 3)]);
      expect(plan.energyShare).toBe(0.4);
      expect(plan.exitBonus).toBe(50);
      expect(plan.enemies).toBe(Math.min(6, 1 + Math.floor(depth / 2)));
      expect(plan.shifts).toBe(Math.min(9, 3 + Math.floor((depth - 1) / 2)));
    }
  });

  it("depth below 1 is treated as 1", () => {
    const first = levelPlan(1);
    expect(levelPlan(0)).toEqual(first);
    expect(levelPlan(-5)).toEqual(first);
    expect(levelPlan(-1000)).toEqual(first);
  });

  it("fractional depths use their whole part", () => {
    expect(levelPlan(3.9)).toEqual(levelPlan(3));
    expect(levelPlan(1.5)).toEqual(levelPlan(1));
  });

  it("the same depth always gives the same plan", () => {
    for (const depth of [1, 2, 5, 9, 13, 40]) {
      expect(levelPlan(depth)).toEqual(levelPlan(depth));
    }
  });
});
