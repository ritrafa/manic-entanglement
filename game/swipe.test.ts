import { describe, expect, it } from "vitest";
import { TouchTracker, classifyTouch, type TouchOp } from "@/game/swipe";
import { hapticFor } from "@/game/fx";
import { Stepper } from "@/game/stepper";
import type { GameEvent } from "@/game/events";

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

describe("TouchTracker", () => {
  it("a swipe right that turns down presses each and releases at the end", () => {
    const t = new TouchTracker();
    t.start(100, 100, 0);
    expect(t.move(130, 102, 50)).toEqual([{ op: "press", dir: "right" }]);
    expect(t.move(131, 140, 100)).toEqual([
      { op: "release", dir: "right" },
      { op: "press", dir: "down" },
    ]);
    expect(t.end(131, 140, 150)).toEqual([{ op: "release", dir: "down" }]);
  });

  it("a turn after a long slide is measured from the finger, not the start", () => {
    const t = new TouchTracker();
    t.start(0, 0, 0);
    // One press right across a 300 px slide taken in small steps.
    const ops: TouchOp[] = [];
    for (let x = 10; x <= 300; x += 10) ops.push(...t.move(x, 0, x));
    expect(ops).toEqual([{ op: "press", dir: "right" }]);
    // 30 px down from where the finger is now turns: the held right is
    // released and down is pressed, without beating the whole 300 px run.
    expect(t.move(300, 30, 400)).toEqual([
      { op: "release", dir: "right" },
      { op: "press", dir: "down" },
    ]);
    expect(t.end(300, 30, 450)).toEqual([{ op: "release", dir: "down" }]);
  });

  it("a quick, small touch is exactly one tap and nothing else", () => {
    const t = new TouchTracker();
    t.start(100, 100, 0);
    expect(t.end(103, 100, 60)).toEqual([{ op: "tap" }]);
  });

  it("a 30 px swipe is one press then one release: a flick is one step", () => {
    const t = new TouchTracker();
    t.start(0, 0, 0);
    expect(t.move(30, 0, 80)).toEqual([{ op: "press", dir: "right" }]);
    expect(t.end(30, 0, 120)).toEqual([{ op: "release", dir: "right" }]);
  });

  it("a slow wobble never reaches the anchor distance and is no tap after 2 s", () => {
    const t = new TouchTracker();
    t.start(0, 0, 0);
    expect(t.move(10, 8, 100)).toEqual([]);
    expect(t.move(-12, 5, 500)).toEqual([]);
    expect(t.move(6, -20, 1500)).toEqual([]);
    expect(t.end(-4, 9, 2000)).toEqual([]);
  });

  it("moving right 100 px in ten moves presses right once, not four times", () => {
    const t = new TouchTracker();
    t.start(0, 0, 0);
    const ops: TouchOp[] = [];
    for (let i = 1; i <= 10; i++) ops.push(...t.move(i * 10, 0, i * 20));
    expect(ops).toEqual([{ op: "press", dir: "right" }]);
    expect(t.end(100, 0, 220)).toEqual([{ op: "release", dir: "right" }]);
  });

  it("reversing releases the held direction and presses the opposite", () => {
    const t = new TouchTracker();
    t.start(0, 0, 0);
    expect(t.move(40, 0, 50)).toEqual([{ op: "press", dir: "right" }]);
    // 24 px back along x from the press point turns the run around.
    expect(t.move(10, 0, 100)).toEqual([
      { op: "release", dir: "right" },
      { op: "press", dir: "left" },
    ]);
    expect(t.end(10, 0, 150)).toEqual([{ op: "release", dir: "left" }]);
  });

  it("cancel releases a held direction and a second start works normally", () => {
    const t = new TouchTracker();
    t.start(0, 0, 0);
    expect(t.move(0, 30, 50)).toEqual([{ op: "press", dir: "down" }]);
    expect(t.cancel()).toEqual([{ op: "release", dir: "down" }]);
    // A second, clean touch behaves as if the tracker had never been used.
    t.start(0, 0, 1000);
    expect(t.move(-30, 0, 1050)).toEqual([{ op: "press", dir: "left" }]);
    expect(t.end(-30, 0, 1100)).toEqual([{ op: "release", dir: "left" }]);
  });

  it("cancel with nothing held and moves without a start do nothing", () => {
    const t = new TouchTracker();
    expect(t.cancel()).toEqual([]);
    expect(t.move(100, 0, 0)).toEqual([]);
    expect(t.end(100, 0, 50)).toEqual([]);
  });

  it("a press during a run hands the Stepper about nine steps in one second", () => {
    const t = new TouchTracker();
    const stepper = new Stepper();
    t.start(0, 0, 0);
    for (const op of t.move(60, 0, 40)) {
      if (op.op === "press") stepper.press(op.dir, 40);
    }
    // The finger stays down; frames poll the Stepper for a whole second.
    let steps = 0;
    for (let now = 40; now <= 1040; now += 16) {
      if (stepper.poll(now) !== null) steps += 1;
    }
    expect(steps).toBe(9);
    for (const op of t.end(60, 0, 1040)) {
      if (op.op === "release") stepper.release(op.dir);
    }
    expect(stepper.poll(2000)).toBeNull();
  });
});

describe("hapticFor", () => {
  it("pickup, fight and dead rumble; anything else is silent", () => {
    expect(hapticFor({ type: "pickup", item: "energy", text: "+25", x: 1, y: 2 })).toBe(10);
    expect(hapticFor({ type: "fight", cost: 15, kind: "wisp", x: 1, y: 2 })).toBe(30);
    expect(hapticFor({ type: "dead", cause: "time", score: 10, level: 1 , lost: 0 })).toBe(80);
    expect(hapticFor({ type: "move", x: 1, y: 2, dx: 1, dy: 0 })).toBe(0);
    expect(hapticFor({ type: "nonsense" } as unknown as GameEvent)).toBe(0);
  });
});
