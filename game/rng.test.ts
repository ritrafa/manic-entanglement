import { describe, expect, it } from "vitest";
import { createRng } from "@/game/rng";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, (_, i) => a.next() === b.next());
    expect(same.some((s) => !s)).toBe(true);
  });

  it("works with seed 0", () => {
    const rng = createRng(0);
    const values = Array.from({ length: 100 }, () => rng.next());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(90);
  });

  it("next() stays in [0, 1)", () => {
    const rng = createRng(42);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n) stays in [0, n) over 10,000 draws", () => {
    const rng = createRng(7);
    for (const n of [1, 2, 3, 4, 7, 13, 100]) {
      for (let i = 0; i < 10000; i++) {
        const v = rng.int(n);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
      }
    }
  });

  it("int(4) eventually hits every bucket", () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) seen.add(rng.int(4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it("pick returns one of the items", () => {
    const rng = createRng(2024);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 1000; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it("clone continues the sequence while the original is unaffected by the clone's draws", () => {
    const original = createRng(555);
    original.next();
    original.int(10);
    const clone = original.clone();

    // The clone continues exactly where the original stands.
    const fromOriginal = Array.from({ length: 50 }, () => original.next());
    const fromClone = Array.from({ length: 50 }, () => clone.next());
    expect(fromClone).toEqual(fromOriginal);
  });

  it("clone is independent: drawing from it does not move the original", () => {
    const original = createRng(31337);
    const clone = original.clone();
    for (let i = 0; i < 100; i++) clone.next();
    const fresh = createRng(31337);
    // The clone burned 100 draws, but the original still sits at the start of the seed's sequence.
    expect(original.next()).toBe(fresh.next());
  });
});
