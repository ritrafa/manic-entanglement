import { describe, expect, it } from "vitest";
import { clampDt, MAX_DT_MS } from "@/game/clock";
import { Run } from "@/game/run";
import { CONFIG } from "@/game/config";

describe("clampDt", () => {
  it("passes a normal frame time through", () => {
    expect(clampDt(16)).toBe(16);
  });

  it("caps a long gap at the default max", () => {
    expect(clampDt(5000)).toBe(250);
  });

  it("gives 0 for negative input", () => {
    expect(clampDt(-5)).toBe(0);
  });

  it("gives 0 for NaN", () => {
    expect(clampDt(NaN)).toBe(0);
  });

  it("gives 0 for Infinity (never more than max)", () => {
    expect(clampDt(Infinity)).toBe(0);
  });

  it("honours a custom max", () => {
    expect(clampDt(1000, 100)).toBe(100);
    expect(clampDt(50, 100)).toBe(50);
  });

  it("never returns more than max", () => {
    for (const ms of [-1000, -1, 0, 1, 249, 250, 251, 1e9, NaN, Infinity, -Infinity]) {
      expect(clampDt(ms)).toBeLessThanOrEqual(MAX_DT_MS);
    }
  });
});

describe("Run with clamped ticks", () => {
  it("100 ticks of clampDt(60000) drain at most 100 x 250 ms of energy", () => {
    const run = new Run({ seed: 7 });
    run.start();
    run.takeEvents();
    const before = run.energy;
    for (let i = 0; i < 100; i++) run.tick(clampDt(60000));
    const drained = before - run.energy;
    const cap = (100 * MAX_DT_MS) / (CONFIG.drainMs * run.stats.speed);
    expect(drained).toBeLessThanOrEqual(cap);
  });
});
