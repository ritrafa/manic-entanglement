// The forecast of the next shift: rolled walks, net wall changes and the Run's
// promise that run.forecast matches what the next successful move does to the walls.
// No DOM, no clocks, no global randomness.

import { describe, expect, it } from "vitest";
import { Maze, DIR_DELTAS, type Dir } from "@/game/maze";
import { createRng } from "@/game/rng";
import { forecastOf, rollWalk, type Edge, type Forecast } from "@/game/forecast";
import { Run } from "@/game/run";
import { nextStep } from "@/game/bot";
import { levelPlan } from "@/game/plan";

const DIRS: Dir[] = ["u", "r", "d", "l"];

function edgeKey(edge: Edge): string {
  return `${edge.x},${edge.y},${edge.dir}`;
}

/** grid[y][x][wallIndex] of the maze's open interior walls (right = 1, down = 2). */
function wallSnapshot(maze: Maze): boolean[][][] {
  return maze.grid.map((row) => row.map((cell) => cell.walls.slice()));
}

function replay(seed: number, maxMoves: number): unknown[] {
  const run = new Run({ seed });
  run.start();
  const all: unknown[] = [];
  for (let i = 0; i < maxMoves && run.phase !== "dead"; i++) {
    if (run.phase === "clear") {
      run.nextLevel();
    }
    const step = nextStep(run);
    if (step === null) break;
    run.tick(250);
    if (run.phase !== "playing") {
      all.push(...run.takeEvents());
      continue;
    }
    run.move(step.dx, step.dy);
    all.push(...run.takeEvents());
  }
  return all;
}

// The exact events of two seeded bot replays, captured BEFORE the forecast change was
// applied. The rolls consume the rng at the same points the old per-move shifts did,
// so the same seed and the same moves must still give these events. Re-captured
// after the score change (game/score.ts): levelClear events carry gained and the
// dead score counts depth, energy, kills and pickups, not steps. Re-captured after the enemy-kinds
// card (game/enemies.ts): fight events carry kind, the heavy kinds spawn off the
// opening route and a beaten brute or warden emits its gear drops as pickup events.
const BASELINE = JSON.parse(
  `{"a":[{"type":"start"},{"type":"levelStart","level":1,"size":5},{"type":"move","x":2,"y":3,"dx":0,"dy":-1},{"type":"pickup","item":"speed","text":"+1% Speed","x":2,"y":3},{"type":"move","x":3,"y":3,"dx":1,"dy":0},{"type":"move","x":3,"y":2,"dx":0,"dy":-1},{"type":"move","x":3,"y":1,"dx":0,"dy":-1},{"type":"move","x":3,"y":0,"dx":0,"dy":-1},{"type":"move","x":2,"y":0,"dx":-1,"dy":0},{"type":"levelClear","level":1,"gained":185},{"type":"levelStart","level":2,"size":5},{"type":"move","x":3,"y":4,"dx":1,"dy":0},{"type":"move","x":3,"y":3,"dx":0,"dy":-1},{"type":"move","x":2,"y":3,"dx":-1,"dy":0},{"type":"move","x":1,"y":3,"dx":-1,"dy":0},{"type":"fight","cost":15,"kind":"wisp","x":1,"y":3},{"type":"move","x":0,"y":3,"dx":-1,"dy":0},{"type":"pickup","item":"boots","text":"-1% Energy Use","x":0,"y":3},{"type":"move","x":0,"y":2,"dx":0,"dy":-1},{"type":"move","x":1,"y":2,"dx":1,"dy":0},{"type":"move","x":2,"y":2,"dx":1,"dy":0},{"type":"move","x":2,"y":1,"dx":0,"dy":-1},{"type":"move","x":2,"y":0,"dx":0,"dy":-1},{"type":"levelClear","level":2,"gained":259},{"type":"levelStart","level":3,"size":7},{"type":"move","x":3,"y":5,"dx":0,"dy":-1},{"type":"pickup","item":"speed","text":"+1% Speed","x":3,"y":5},{"type":"move","x":4,"y":5,"dx":1,"dy":0},{"type":"move","x":4,"y":6,"dx":0,"dy":1},{"type":"pickup","item":"energy","text":"+25 Energy","x":4,"y":6},{"type":"move","x":5,"y":6,"dx":1,"dy":0},{"type":"move","x":5,"y":5,"dx":0,"dy":-1},{"type":"move","x":5,"y":4,"dx":0,"dy":-1},{"type":"move","x":5,"y":5,"dx":0,"dy":1},{"type":"move","x":5,"y":6,"dx":0,"dy":1},{"type":"move","x":5,"y":5,"dx":0,"dy":-1},{"type":"move","x":5,"y":4,"dx":0,"dy":-1},{"type":"move","x":5,"y":3,"dx":0,"dy":-1},{"type":"move","x":4,"y":3,"dx":-1,"dy":0},{"type":"move","x":3,"y":3,"dx":-1,"dy":0},{"type":"move","x":3,"y":2,"dx":0,"dy":-1},{"type":"move","x":3,"y":1,"dx":0,"dy":-1},{"type":"move","x":3,"y":0,"dx":0,"dy":-1},{"type":"levelClear","level":3,"gained":365},{"type":"levelStart","level":4,"size":7},{"type":"move","x":2,"y":6,"dx":-1,"dy":0},{"type":"pickup","item":"shield","text":"+0.1 Defense","x":2,"y":6},{"type":"move","x":1,"y":6,"dx":-1,"dy":0},{"type":"pickup","item":"boots","text":"-1% Energy Use","x":1,"y":6},{"type":"move","x":0,"y":6,"dx":-1,"dy":0},{"type":"move","x":0,"y":5,"dx":0,"dy":-1},{"type":"move","x":0,"y":4,"dx":0,"dy":-1},{"type":"move","x":0,"y":3,"dx":0,"dy":-1},{"type":"move","x":0,"y":2,"dx":0,"dy":-1},{"type":"move","x":0,"y":1,"dx":0,"dy":-1},{"type":"move","x":1,"y":1,"dx":1,"dy":0},{"type":"move","x":1,"y":0,"dx":0,"dy":-1},{"type":"move","x":2,"y":0,"dx":1,"dy":0},{"type":"move","x":2,"y":1,"dx":0,"dy":1},{"type":"move","x":3,"y":1,"dx":1,"dy":0},{"type":"move","x":4,"y":1,"dx":1,"dy":0},{"type":"move","x":5,"y":1,"dx":1,"dy":0},{"type":"move","x":5,"y":0,"dx":0,"dy":-1},{"type":"move","x":4,"y":0,"dx":-1,"dy":0},{"type":"fight","cost":15,"kind":"wisp","x":4,"y":0},{"type":"move","x":3,"y":0,"dx":-1,"dy":0},{"type":"levelClear","level":4,"gained":438},{"type":"levelStart","level":5,"size":9},{"type":"move","x":5,"y":8,"dx":1,"dy":0},{"type":"move","x":6,"y":8,"dx":1,"dy":0},{"type":"move","x":6,"y":7,"dx":0,"dy":-1},{"type":"move","x":5,"y":7,"dx":-1,"dy":0},{"type":"move","x":4,"y":7,"dx":-1,"dy":0},{"type":"pickup","item":"speed","text":"+1% Speed","x":4,"y":7},{"type":"move","x":4,"y":6,"dx":0,"dy":-1},{"type":"move","x":4,"y":5,"dx":0,"dy":-1},{"type":"move","x":3,"y":5,"dx":-1,"dy":0},{"type":"move","x":2,"y":5,"dx":-1,"dy":0},{"type":"move","x":2,"y":6,"dx":0,"dy":1},{"type":"move","x":1,"y":6,"dx":-1,"dy":0},{"type":"pickup","item":"boots","text":"-1% Energy Use","x":1,"y":6},{"type":"move","x":0,"y":6,"dx":-1,"dy":0},{"type":"move","x":0,"y":5,"dx":0,"dy":-1},{"type":"move","x":1,"y":5,"dx":1,"dy":0},{"type":"move","x":1,"y":4,"dx":0,"dy":-1},{"type":"move","x":1,"y":3,"dx":0,"dy":-1},{"type":"move","x":1,"y":2,"dx":0,"dy":-1},{"type":"fight","cost":15,"kind":"wisp","x":1,"y":2},{"type":"move","x":1,"y":1,"dx":0,"dy":-1},{"type":"move","x":0,"y":1,"dx":-1,"dy":0},{"type":"move","x":1,"y":1,"dx":1,"dy":0},{"type":"move","x":2,"y":1,"dx":1,"dy":0},{"type":"move","x":2,"y":0,"dx":0,"dy":-1},{"type":"move","x":3,"y":0,"dx":1,"dy":0},{"type":"move","x":4,"y":0,"dx":1,"dy":0},{"type":"levelClear","level":5,"gained":511},{"type":"levelStart","level":6,"size":9},{"type":"move","x":4,"y":7,"dx":0,"dy":-1},{"type":"move","x":4,"y":6,"dx":0,"dy":-1},{"type":"move","x":5,"y":6,"dx":1,"dy":0},{"type":"move","x":6,"y":6,"dx":1,"dy":0},{"type":"move","x":6,"y":7,"dx":0,"dy":1},{"type":"move","x":6,"y":8,"dx":0,"dy":1}],"b":[{"type":"start"},{"type":"levelStart","level":1,"size":5},{"type":"move","x":2,"y":3,"dx":0,"dy":-1},{"type":"move","x":2,"y":2,"dx":0,"dy":-1},{"type":"move","x":2,"y":1,"dx":0,"dy":-1},{"type":"move","x":3,"y":1,"dx":1,"dy":0},{"type":"move","x":3,"y":0,"dx":0,"dy":-1},{"type":"move","x":2,"y":0,"dx":-1,"dy":0},{"type":"levelClear","level":1,"gained":184},{"type":"levelStart","level":2,"size":5},{"type":"move","x":3,"y":4,"dx":1,"dy":0},{"type":"move","x":4,"y":4,"dx":1,"dy":0},{"type":"move","x":4,"y":3,"dx":0,"dy":-1},{"type":"move","x":3,"y":3,"dx":-1,"dy":0},{"type":"fight","cost":15,"kind":"wisp","x":3,"y":3},{"type":"move","x":3,"y":2,"dx":0,"dy":-1},{"type":"move","x":4,"y":2,"dx":1,"dy":0},{"type":"move","x":4,"y":1,"dx":0,"dy":-1},{"type":"move","x":3,"y":1,"dx":-1,"dy":0},{"type":"move","x":3,"y":0,"dx":0,"dy":-1},{"type":"fight","cost":15,"kind":"wisp","x":3,"y":0},{"type":"move","x":2,"y":0,"dx":-1,"dy":0},{"type":"levelClear","level":2,"gained":244},{"type":"levelStart","level":3,"size":7},{"type":"move","x":4,"y":6,"dx":1,"dy":0},{"type":"move","x":3,"y":6,"dx":-1,"dy":0},{"type":"move","x":2,"y":6,"dx":-1,"dy":0},{"type":"move","x":2,"y":5,"dx":0,"dy":-1},{"type":"fight","cost":15,"kind":"wisp","x":2,"y":5},{"type":"move","x":1,"y":5,"dx":-1,"dy":0},{"type":"move","x":0,"y":5,"dx":-1,"dy":0},{"type":"move","x":0,"y":4,"dx":0,"dy":-1},{"type":"move","x":0,"y":3,"dx":0,"dy":-1},{"type":"move","x":0,"y":2,"dx":0,"dy":-1},{"type":"move","x":0,"y":1,"dx":0,"dy":-1},{"type":"fight","cost":30,"kind":"brute","x":0,"y":1},{"type":"pickup","item":"shield","text":"+0.1 Defense","x":0,"y":1},{"type":"move","x":0,"y":0,"dx":0,"dy":-1},{"type":"move","x":1,"y":0,"dx":1,"dy":0},{"type":"move","x":2,"y":0,"dx":1,"dy":0},{"type":"move","x":2,"y":1,"dx":0,"dy":1},{"type":"move","x":2,"y":2,"dx":0,"dy":1},{"type":"move","x":3,"y":2,"dx":1,"dy":0},{"type":"pickup","item":"speed","text":"+1% Speed","x":3,"y":2},{"type":"move","x":4,"y":2,"dx":1,"dy":0},{"type":"move","x":4,"y":1,"dx":0,"dy":-1},{"type":"pickup","item":"speed","text":"+1% Speed","x":4,"y":1},{"type":"dead","cause":"time","score":558,"level":3}]}`
);

describe("rollWalk", () => {
  it("never leaves the board over 1,000 steps on sizes 3 and 5", () => {
    for (const size of [3, 5]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const rng = createRng(seed);
        const maze = new Maze(size, size, rng);
        const walk = rollWalk(maze, rng, 1000);
        expect(walk).toHaveLength(1000);
        let at = { x: maze.origin.x, y: maze.origin.y };
        for (const dir of walk) {
          expect(maze.validDirs(at)).toContain(dir);
          at = { x: at.x + DIR_DELTAS[dir].x, y: at.y + DIR_DELTAS[dir].y };
          expect(at.x).toBeGreaterThanOrEqual(0);
          expect(at.x).toBeLessThan(size);
          expect(at.y).toBeGreaterThanOrEqual(0);
          expect(at.y).toBeLessThan(size);
        }
      }
    }
  });

  it("is the same walk for the same rng state and maze", () => {
    const rng = createRng(99);
    const maze = new Maze(7, 7, rng);
    const a = rollWalk(maze, rng.clone(), 12);
    const b = rollWalk(maze, rng.clone(), 12);
    expect(a).toEqual(b);
    expect(rollWalk(maze, rng, 12)).toEqual(a);
  });

  it("draws nothing when the walk is empty", () => {
    const rng = createRng(7);
    const maze = new Maze(5, 5, rng);
    const before = rng.clone();
    expect(rollWalk(maze, rng, 0)).toEqual([]);
    expect(rng.next()).toBe(before.next());
  });
});

describe("forecastOf", () => {
  it("has as many opens as closes, none shared and all inside the maze", () => {
    for (const size of [5, 9, 13]) {
      for (let seed = 1; seed <= 6; seed++) {
        const rng = createRng(seed * 31 + size);
        const maze = new Maze(size, size, rng);
        const walk = rollWalk(maze, rng, levelPlan(3).shifts);
        const forecast = forecastOf(maze, walk);
        expect(forecast.opens.length).toBe(forecast.closes.length);
        const opened = new Set(forecast.opens.map(edgeKey));
        for (const edge of forecast.closes) expect(opened.has(edgeKey(edge))).toBe(false);
        for (const edge of [...forecast.opens, ...forecast.closes]) {
          expect(Number.isInteger(edge.x)).toBe(true);
          expect(Number.isInteger(edge.y)).toBe(true);
          expect(edge.x).toBeGreaterThanOrEqual(0);
          expect(edge.y).toBeGreaterThanOrEqual(0);
          if (edge.dir === "r") expect(edge.x + 1).toBeLessThan(size);
          else expect(edge.y + 1).toBeLessThan(size);
        }
      }
    }
  });

  it("lists only the net change: a wall that opens and closes again is not listed", () => {
    // The net lists must equal the start-vs-end wall difference, and some walk must
    // actually change a wall twice (open it and seal it again) so the rule bites.
    function openSet(maze: Maze): Set<string> {
      const open = new Set<string>();
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (x + 1 < maze.width && !maze.grid[y][x].walls[1]) open.add(`${x},${y},r`);
          if (y + 1 < maze.height && !maze.grid[y][x].walls[2]) open.add(`${x},${y},d`);
        }
      }
      return open;
    }

    let cancellations = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const rng = createRng(seed);
      const maze = new Maze(5, 5, rng);
      const walk = rollWalk(maze, rng, 12);
      const forecast = forecastOf(maze, walk);

      const start = openSet(maze);
      const sim = maze.clone();
      const everOpened = new Set<string>();
      const everClosed = new Set<string>();
      let before = start;
      for (const dir of walk) {
        sim.step(dir);
        const after = openSet(sim);
        for (const key of after) if (!before.has(key)) everOpened.add(key);
        for (const key of before) if (!after.has(key)) everClosed.add(key);
        before = after;
      }
      for (const key of everOpened) if (everClosed.has(key)) cancellations++;

      const end = openSet(sim);
      expect(forecast.opens.map(edgeKey).sort()).toEqual(
        [...end].filter((key) => !start.has(key)).sort()
      );
      expect(forecast.closes.map(edgeKey).sort()).toEqual(
        [...start].filter((key) => !end.has(key)).sort()
      );
      // And the walk's last position is where the clone ended up.
      expect(forecast.walk[forecast.walk.length - 1]).toEqual({ x: sim.origin.x, y: sim.origin.y });
    }
    expect(cancellations).toBeGreaterThan(0);
  });

  it("leaves the maze untouched", () => {
    const rng = createRng(11);
    const maze = new Maze(7, 7, rng);
    const gridBefore = maze.wallGrid.map((row) => row.slice());
    const originBefore = { ...maze.origin };
    forecastOf(maze, rollWalk(maze, createRng(2), 6));
    expect(maze.wallGrid).toEqual(gridBefore);
    expect(maze.origin).toEqual(originBefore);
  });

  it("walk positions follow the directions step by step", () => {
    const rng = createRng(23);
    const maze = new Maze(5, 5, rng);
    const walk = rollWalk(maze, rng, 7);
    const forecast = forecastOf(maze, walk);
    let at = { x: maze.origin.x, y: maze.origin.y };
    expect(forecast.walk).toHaveLength(walk.length);
    walk.forEach((dir, i) => {
      at = { x: at.x + DIR_DELTAS[dir].x, y: at.y + DIR_DELTAS[dir].y };
      expect(forecast.walk[i]).toEqual(at);
    });
  });
});

describe("Run forecast", () => {
  it("matches the walls after every move over 20 seeds and 50 moves each", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = new Run({ seed });
      run.start();
      for (let move = 0; move < 50 && run.phase !== "dead"; move++) {
        if (run.phase === "clear") {
          run.nextLevel();
          continue;
        }
        const step = nextStep(run);
        if (step === null) break;
        const before = wallSnapshot(run.maze);
        const forecast: Forecast = JSON.parse(JSON.stringify(run.forecast));
        if (!run.move(step.dx, step.dy)) continue;

        const opens = new Set(forecast.opens.map(edgeKey));
        const closes = new Set(forecast.closes.map(edgeKey));
        for (let y = 0; y < run.maze.height; y++) {
          for (let x = 0; x < run.maze.width; x++) {
            for (const [wallIndex, dir] of [[1, "r"], [2, "d"]] as const) {
              const key = `${x},${y},${dir}`;
              const expected =
                before[y][x][wallIndex] !== opens.has(key) !== closes.has(key);
              // A wall cannot be opened and closed at once.
              expect(opens.has(key) && closes.has(key)).toBe(false);
              expect(run.maze.grid[y][x].walls[wallIndex]).toBe(expected);
            }
          }
        }
      }
    }
  });

  it("walks plan.shifts positions, one step each, ending at the origin after the move", () => {
    for (const seed of [1, 9, 42]) {
      const run = new Run({ seed });
      run.start();
      for (const level of [1, 2, 3]) {
        if (run.level !== level) {
          run.phase = "clear";
          run.nextLevel();
        }
        const forecast: Forecast = JSON.parse(JSON.stringify(run.forecast));
        expect(forecast.walk.length).toBe(levelPlan(level).shifts);
        let previous = { x: run.maze.origin.x, y: run.maze.origin.y };
        for (const cell of forecast.walk) {
          const distance = Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y);
          expect(distance).toBe(1);
          previous = cell;
        }
        const step = nextStep(run);
        expect(step).not.toBeNull();
        run.move(step!.dx, step!.dy);
        expect(run.maze.origin).toEqual(forecast.walk[forecast.walk.length - 1]);
      }
    }
  });

  it("has a forecast before the first move of a new level", () => {
    const run = new Run({ seed: 5 });
    run.start();
    expect(run.forecast.walk.length).toBe(levelPlan(1).shifts);
    run.items = [];
    run.enemies = [];
    run.player.x = run.exit.x;
    run.player.y = run.exit.y + 1;
    run.maze.grid[run.player.y][run.player.x].walls[0] = false;
    run.move(0, -1);
    expect(run.phase).toBe("clear");
    run.nextLevel();
    expect(run.forecast.walk.length).toBe(levelPlan(2).shifts);
  });

  it("does not change on a blocked move", () => {
    const run = new Run({ seed: 8 });
    run.start();
    let blocked: { dx: number; dy: number } | null = null;
    for (const step of [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
    ]) {
      if (!run.maze.canMove(run.player.x, run.player.y, step.dx, step.dy)) blocked = step;
    }
    expect(blocked).not.toBeNull();
    const before: Forecast = JSON.parse(JSON.stringify(run.forecast));
    const origin = { ...run.maze.origin };
    expect(run.move(blocked!.dx, blocked!.dy)).toBe(false);
    expect(run.forecast).toEqual(before);
    expect(run.maze.origin).toEqual(origin);
  });

  it("gives the same events as before the forecast change, for the same seed and moves", () => {
    expect(replay(42, 80)).toEqual(BASELINE.a);
    expect(replay(7, 120)).toEqual(BASELINE.b);
    // And applying the change twice: the same seed twice over gives the same events.
    expect(replay(42, 80)).toEqual(replay(42, 80));
    expect(replay(7, 120)).toEqual(replay(7, 120));
  });
});
