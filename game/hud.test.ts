import { describe, expect, it } from "vitest";
import { hudModel, isNewBest, sameHudModel, type HudModel, type HudRun } from "@/game/hud";
import type { RunStats } from "@/game/run";

/** A plain run-shaped object; pass patches for the parts each case cares about. */
function runAt(over: { energy?: number; score?: number; level?: number; stats?: Partial<RunStats> } = {}): HudRun {
  return {
    energy: over.energy ?? 87,
    score: over.score ?? 12,
    level: over.level ?? 1,
    stats: { attack: 1, defense: 1, speed: 1, consumption: 1, storage: 100, ...over.stats },
  };
}

describe("hudModel", () => {
  it("formats the energy and score as plain number texts", () => {
    const model = hudModel(runAt(), 50);
    expect(model.energyText).toBe("87");
    expect(model.scoreText).toBe("12");
  });

  it("flags the energy as low under the warning line", () => {
    expect(hudModel(runAt({ energy: 87 }), 50).energyLow).toBe(false);
    expect(hudModel(runAt({ energy: 25 }), 50).energyLow).toBe(false);
    expect(hudModel(runAt({ energy: 24 }), 50).energyLow).toBe(true);
    expect(hudModel(runAt({ energy: 0 }), 50).energyLow).toBe(true);
    expect(hudModel(runAt({ energy: -3 }), 50).energyLow).toBe(true);
  });

  it("shows 0% progress when the best is 0", () => {
    expect(hudModel(runAt(), 0).bestPct).toBe(0);
    expect(hudModel(runAt({ score: 40 }), 0).bestPct).toBe(0);
  });

  it("shows 100% when the score reaches or passes the best", () => {
    expect(hudModel(runAt({ score: 50 }), 50).bestPct).toBe(100);
    expect(hudModel(runAt({ score: 80 }), 50).bestPct).toBe(100);
  });

  it("never lets the energy text or bar go below 0", () => {
    const model = hudModel(runAt({ energy: -3 }), 50);
    expect(model.energyText).toBe("0");
    expect(model.energyPct).toBe(0);
  });

  it("never lets the energy bar pass 100", () => {
    expect(hudModel(runAt({ energy: 130 }), 50).energyPct).toBe(100);
  });

  it("keeps the energy bar a sane number with a broken storage", () => {
    for (const storage of [0, Number.NaN, -10, Number.POSITIVE_INFINITY]) {
      const pct = hudModel(runAt({ energy: 40, stats: { storage } }), 50).energyPct;
      expect(Number.isFinite(pct)).toBe(true);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("reads the drain rate as clockPct and the step toll as stepPct", () => {
    expect(hudModel(runAt({ stats: { speed: 1.25 } }), 50).clockPct).toBe(80);
    expect(hudModel(runAt({ stats: { consumption: 0.9 } }), 50).stepPct).toBe(90);
    expect(hudModel(runAt(), 50).clockPct).toBe(100);
    expect(hudModel(runAt({ stats: { speed: Number.NaN } }), 50).clockPct).toBe(0);
    expect(hudModel(runAt({ stats: { consumption: Number.NaN } }), 50).stepPct).toBe(0);
  });

  it("writes the three stats with one decimal", () => {
    const model = hudModel(runAt({ level: 3, stats: { attack: 1.24, defense: 2.05 } }), 50);
    expect(model.level).toBe("3.0");
    expect(model.attack).toBe("1.2");
    expect(model.defense).toBe("2.1");
  });

  it("gives deeply equal models for an unchanged run", () => {
    const run = runAt();
    expect(hudModel(run, 50)).toEqual(hudModel(run, 50));
    expect(sameHudModel(hudModel(run, 50), hudModel(run, 50))).toBe(true);
  });

  it("notices a changed run", () => {
    const before: HudModel = hudModel(runAt(), 50);
    expect(sameHudModel(before, hudModel(runAt({ score: 13 }), 50))).toBe(false);
    expect(sameHudModel(hudModel(runAt({ energy: 80 }), 50), hudModel(runAt({ energy: 20 }), 50))).toBe(false);
  });
});

describe("isNewBest", () => {
  it("is false when nothing was beaten", () => {
    expect(isNewBest(0, 0)).toBe(false);
    expect(isNewBest(5, 5)).toBe(false);
    expect(isNewBest(3, 5)).toBe(false);
    expect(isNewBest(-1, 0)).toBe(false);
    expect(isNewBest(Number.NaN, 5)).toBe(false);
  });

  it("is true only for a real record", () => {
    expect(isNewBest(6, 5)).toBe(true);
    expect(isNewBest(1, 0)).toBe(true);
  });
});
