import { describe, expect, it } from "vitest";
import { clampDt } from "@/game/clock";
import { Run } from "@/game/run";
import { CONFIG } from "@/game/config";

describe("clampDt", () => {
  it("passes a normal elapsed time through", () => {
    expect(clampDt(16)).toBe(16);
    expect(clampDt(0)).toBe(0);
    expect(clampDt(250)).toBe(250);
  });

  it("caps anything above the default maximum", () => {
    expect(clampDt(5000)).toBe(250);
    expect(clampDt(60000)).toBe(250);
  });

  it("honours a custom maximum", () => {
    expect(clampDt(500, 100)).toBe(100);
    expect(clampDt(50, 100)).toBe(50);
  });

  it("turns broken input into 0 and never exceeds max", () => {
    expect(clampDt(-5)).toBe(0);
    expect(clampDt(NaN)).toBe(0);
    // Chosen behaviour: a non-finite step is dropped entirely (0), never applied.
    expect(clampDt(Infinity)).toBe(0);
    expect(clampDt(-Infinity)).toBe(0);
    for (const value of [16, 5000, -5, NaN, Infinity, -Infinity]) {
      expect(clampDt(value)).toBeGreaterThanOrEqual(0);
      expect(clampDt(value)).toBeLessThanOrEqual(250);
    }
  });
});

describe("Run with a clamped clock", () => {
  it("drains at most max milliseconds per tick, however large the reported step", () => {
    const storage = 100000;
    const run = new Run({ seed: 7, stats: { storage } });
    run.start();
    run.takeEvents();
    const before = run.energy;

    // A hidden tab reports one huge step per tick; the clamp caps every one of them.
    for (let i = 0; i < 100; i++) run.tick(clampDt(60000));

    const drained = before - run.energy;
    const atMost = (100 * 250) / (CONFIG.drainMs * run.stats.speed);
    expect(drained).toBeLessThanOrEqual(atMost);
    // Without the clamp the same 100 raw steps would have drained far more.
    expect(drained).toBeLessThan((100 * 60000) / (CONFIG.drainMs * run.stats.speed));
  });

  it("a clamped hidden-tab minute leaves the energy it had before the tab slept", () => {
    const storage = 100000;
    const run = new Run({ seed: 11, stats: { storage } });
    run.start();
    run.takeEvents();
    const before = run.energy;

    // One minute suspended, then a single huge step when the tab wakes up.
    run.tick(clampDt(60000));

    expect(before - run.energy).toBeLessThanOrEqual(250 / (CONFIG.drainMs * run.stats.speed));
  });
});
