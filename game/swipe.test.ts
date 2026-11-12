import { describe, expect, it } from "vitest";
import { classifyTouch } from "@/game/swipe";

describe("classifyTouch", () => {
  it("a small, quick touch is a tap", () => {
    expect(classifyTouch(3, -4, 120)).toEqual({ kind: "tap" });
  });

  it("the same small touch held too long is none", () => {
    expect(classifyTouch(3, -4, 800)).toEqual({ kind: "none" });
  });

  it("a long horizontal drag is a swipe right", () => {
    expect(classifyTouch(40, 5, 300)).toEqual({ kind: "swipe", dx: 1, dy: 0 });
  });

  it("a long vertical drag up is a swipe up", () => {
    expect(classifyTouch(-5, -60, 300)).toEqual({ kind: "swipe", dx: 0, dy: -1 });
  });

  it("an equal cross is a horizontal swipe", () => {
    expect(classifyTouch(30, 30, 300)).toEqual({ kind: "swipe", dx: 1, dy: 0 });
  });

  it("between the tap and swipe thresholds is none", () => {
    expect(classifyTouch(15, 0, 100)).toEqual({ kind: "none" });
  });

  it("zero movement in 50 ms is a tap with no direction", () => {
    const result = classifyTouch(0, 0, 50);
    expect(result).toEqual({ kind: "tap" });
    expect("dx" in result).toBe(false);
    expect("dy" in result).toBe(false);
  });

  it("NaN input is none", () => {
    expect(classifyTouch(NaN, 0, 100)).toEqual({ kind: "none" });
    expect(classifyTouch(0, NaN, 100)).toEqual({ kind: "none" });
    expect(classifyTouch(0, 0, NaN)).toEqual({ kind: "none" });
  });

  it("non-finite input is none", () => {
    expect(classifyTouch(Infinity, 0, 100)).toEqual({ kind: "none" });
    expect(classifyTouch(0, -Infinity, 100)).toEqual({ kind: "none" });
    expect(classifyTouch(0, 0, Infinity)).toEqual({ kind: "none" });
  });

  it("a swipe carries a direction on exactly one axis", () => {
    const cases: Array<[number, number, -1 | 0 | 1, -1 | 0 | 1]> = [
      [50, 0, 1, 0],
      [-50, 0, -1, 0],
      [0, 50, 0, 1],
      [0, -50, 0, -1],
      [10, -30, 0, -1],
      [-30, 10, -1, 0],
      [-25, -25, -1, 0],
    ];
    for (const [dx, dy, wx, wy] of cases) {
      expect(classifyTouch(dx, dy, 200)).toEqual({ kind: "swipe", dx: wx, dy: wy });
    }
  });

  it("a swipe needs 24 px on its dominant axis", () => {
    expect(classifyTouch(23, 0, 200)).toEqual({ kind: "none" });
    expect(classifyTouch(24, 0, 200)).toEqual({ kind: "swipe", dx: 1, dy: 0 });
  });

  it("a tap stays a tap at the edge of its window", () => {
    expect(classifyTouch(11, -11, 499)).toEqual({ kind: "tap" });
    // 12 px is no longer "under 12", and too short for a swipe: none.
    expect(classifyTouch(12, 0, 100)).toEqual({ kind: "none" });
  });

  it("a long press without movement is none", () => {
    expect(classifyTouch(0, 0, 5000)).toEqual({ kind: "none" });
  });
});
