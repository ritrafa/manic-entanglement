import { describe, expect, it } from "vitest";
import { Run } from "@/game/run";
import { nextStep, playBot } from "@/game/bot";

const STEPS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

/** Length of a shortest path from (x, y) to the exit in the maze as it is now. */
function distanceToExit(run: Run, x: number, y: number): number {
  const { maze, exit } = run;
  const key = (cx: number, cy: number) => cy * maze.width + cx;
  const seen = new Set<number>([key(x, y)]);
  const queue: { x: number; y: number; d: number }[] = [{ x, y, d: 0 }];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur.x === exit.x && cur.y === exit.y) return cur.d;
    for (const step of STEPS) {
      if (!maze.canMove(cur.x, cur.y, step.dx, step.dy)) continue;
      const nx = cur.x + step.dx;
      const ny = cur.y + step.dy;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return -1;
}

describe("nextStep", () => {
  it("takes a valid step that shortens the shortest route", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = new Run({ seed });
      run.start();
      const step = nextStep(run);
      expect(step).not.toBeNull();
      expect(run.maze.canMove(run.player.x, run.player.y, step!.dx, step!.dy)).toBe(true);
      const before = distanceToExit(run, run.player.x, run.player.y);
      const after = distanceToExit(run, run.player.x + step!.dx, run.player.y + step!.dy);
      expect(after).toBe(before - 1);
    }
  });
});

describe("playBot", () => {
  it("reaches the exit of level 1 for 20 seeds once the enemies are removed", () => {
    for (let seed = 0; seed < 20; seed++) {
      const run = new Run({ seed });
      run.start();
      run.enemies = []; // the bot has no fight strategy yet: test the route without enemies
      run.takeEvents();
      const deepest = playBot(run, 10, 5000);
      const events = run.takeEvents();
      expect(
        events.some((event) => event.type === "levelClear" && event.level === 1),
        `seed ${seed} did not clear level 1`,
      ).toBe(true);
      expect(deepest).toBeGreaterThanOrEqual(1);
    }
  });

  it("starts a ready run and returns the deepest level reached", () => {
    const run = new Run({ seed: 42 });
    const deepest = playBot(run, 10, 200);
    expect(run.phase).not.toBe("ready");
    expect(Number.isInteger(deepest)).toBe(true);
    expect(deepest).toBeGreaterThanOrEqual(1);
    expect(deepest).toBeGreaterThanOrEqual(run.level);
  });

  it("restarts a dead run", () => {
    const run = new Run({ seed: 43 });
    run.start();
    run.tick(999999);
    expect(run.phase).toBe("dead");
    run.takeEvents();
    const deepest = playBot(run, 10, 50);
    // The restart is visible in the events even if the fresh run dies again.
    const events = run.takeEvents();
    expect(events[0]).toEqual({ type: "start" });
    expect(events[1]).toMatchObject({ type: "levelStart", level: 1 });
    expect(run.phase).not.toBe("ready");
    expect(deepest).toBeGreaterThanOrEqual(1);
  });

  it("plays a seeded run to its death and reports the level it died on", () => {
    const run = new Run({ seed: 7 });
    run.start();
    run.enemies = [];
    // No speed pickups can appear once the items are out of the way, so the clock always wins.
    run.items = [];
    const deepest = playBot(run, 10, 100000);
    // Keep clearing levels by removing what the new levels bring, until the clock wins.
    let guard = 0;
    while (run.phase !== "dead" && guard < 100) {
      guard++;
      if (run.phase === "clear") run.nextLevel();
      run.enemies = [];
      run.items = [];
      playBot(run, 10, 100000);
    }
    expect(run.phase).toBe("dead");
    expect(deepest).toBeGreaterThanOrEqual(1);
  });
});
