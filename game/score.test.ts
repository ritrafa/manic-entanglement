import { describe, expect, it } from "vitest";
import { KILL_SCORE, PICKUP_SCORE, levelScore } from "@/game/score";

describe("levelScore", () => {
  it("is 100 per level plus the floor of the energy left", () => {
    expect(levelScore({ level: 3, energyLeft: 41.7 })).toBe(341);
    expect(levelScore({ level: 1, energyLeft: 37.2 })).toBe(137);
    expect(levelScore({ level: 1, energyLeft: 0 })).toBe(100);
    expect(levelScore({ level: 2, energyLeft: 99.99 })).toBe(299);
    expect(levelScore({ level: 12, energyLeft: 100 })).toBe(1300);
  });

  it("counts negative and NaN energy as 0", () => {
    expect(levelScore({ level: 3, energyLeft: -5 })).toBe(300);
    expect(levelScore({ level: 3, energyLeft: Number.NaN })).toBe(300);
    expect(levelScore({ level: 3, energyLeft: -0.5 })).toBe(300);
  });
});

describe("flat awards", () => {
  it("kills give 25 and pickups 10", () => {
    expect(KILL_SCORE).toBe(25);
    expect(PICKUP_SCORE).toBe(10);
  });
});
