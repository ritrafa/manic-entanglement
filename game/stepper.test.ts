import { describe, expect, it } from "vitest";
import { Stepper } from "@/game/stepper";

describe("Stepper: a held key runs at the game's own pace", () => {
  it("steps at once, then at firstRepeatMs, then every stepMs", () => {
    const s = new Stepper();
    s.press("right", 0);
    expect(s.poll(0)).toBe("right");
    expect(s.poll(50)).toBeNull();
    expect(s.poll(169)).toBeNull();
    expect(s.poll(170)).toBe("right");
    expect(s.poll(280)).toBe("right");
  });

  it("a press released before the next poll still gives exactly one step", () => {
    const s = new Stepper();
    s.press("down", 0);
    s.release("down");
    expect(s.poll(1)).toBe("down");
    expect(s.poll(500)).toBeNull();
  });

  it("the most recently pressed key wins, and the one still held takes over", () => {
    const s = new Stepper();
    s.press("left", 0);
    expect(s.poll(0)).toBe("left");
    s.press("up", 60);
    // The step at or after 110 (stepMs after the last one) is the newer key.
    expect(s.poll(109)).toBeNull();
    expect(s.poll(110)).toBe("up");
    s.release("up");
    expect(s.poll(219)).toBeNull();
    expect(s.poll(220)).toBe("left");
    // left started a fresh run at 220, so its second step waits firstRepeatMs.
    expect(s.poll(389)).toBeNull();
    expect(s.poll(390)).toBe("left");
  });

  it("a tap then a quick second press steps again as soon as the wait allows", () => {
    const s = new Stepper();
    s.press("left", 0);
    s.release("left");
    expect(s.poll(0)).toBe("left");
    s.press("up", 30);
    s.release("up");
    expect(s.poll(110)).toBe("up");
    expect(s.poll(500)).toBeNull();
  });

  it("two presses during one wait leave only the later one", () => {
    const s = new Stepper();
    s.press("left", 0);
    s.release("left");
    expect(s.poll(0)).toBe("left");
    s.press("up", 20);
    s.release("up");
    s.press("down", 40);
    s.release("down");
    expect(s.poll(110)).toBe("down");
    expect(s.poll(500)).toBeNull();
  });

  it("a press during the wait is returned when it ends even though it was released", () => {
    const s = new Stepper();
    s.press("right", 0);
    expect(s.poll(0)).toBe("right"); // running, next automatic step at 170
    s.press("up", 20);
    s.release("up");
    expect(s.poll(110)).toBe("up");
    // right never left the key, so its run takes over as soon as the wait allows.
    expect(s.poll(219)).toBeNull();
    expect(s.poll(220)).toBe("right");
  });

  it("clear() forgets held keys and the remembered press", () => {
    const s = new Stepper();
    s.press("left", 0);
    s.press("up", 5);
    s.clear();
    expect(s.poll(10)).toBeNull();
    expect(s.poll(1000)).toBeNull();
    // And it starts fresh: a new press steps at once again.
    s.press("down", 2000);
    expect(s.poll(2000)).toBe("down");
  });

  it("two seconds of 16 ms polling with a key held gives 15 to 18 spaced steps", () => {
    const s = new Stepper();
    s.press("right", 0);
    const steps: number[] = [];
    for (let now = 0; now <= 2000; now += 16) {
      if (s.poll(now) === "right") steps.push(now);
    }
    expect(steps.length).toBeGreaterThanOrEqual(15);
    expect(steps.length).toBeLessThanOrEqual(18);
    expect(steps[0]).toBe(0);
    // No two steps closer than stepMs.
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i] - steps[i - 1]).toBeGreaterThanOrEqual(110);
    }
  });

  it("polling before anything is pressed gives nothing", () => {
    const s = new Stepper();
    expect(s.poll(0)).toBeNull();
    expect(s.poll(100000)).toBeNull();
  });

  it("releasing a key that never ran changes nothing", () => {
    const s = new Stepper();
    s.press("left", 0);
    s.release("right");
    expect(s.poll(0)).toBe("left");
  });

  it("a released running key stops the repeat", () => {
    const s = new Stepper();
    s.press("down", 0);
    expect(s.poll(0)).toBe("down");
    s.release("down");
    expect(s.poll(170)).toBeNull();
    expect(s.poll(1000)).toBeNull();
  });

  it("the second step of a run waits firstRepeatMs even after a takeover", () => {
    const s = new Stepper();
    s.press("left", 0);
    s.press("up", 1); // replaces left's pending first step
    s.release("up");
    expect(s.poll(1)).toBe("up"); // one step for the released press
    expect(s.poll(110)).toBeNull(); // the wait after up lasts stepMs
    expect(s.poll(111)).toBe("left"); // left, still held, takes over
    expect(s.poll(220)).toBeNull(); // a new run: firstRepeatMs, not stepMs
    expect(s.poll(281)).toBe("left");
  });
});
