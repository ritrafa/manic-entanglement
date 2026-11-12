// The Stalker: the enemy that walks toward you. One step per CONFIG.stalkerEvery
// successful player moves, along the shortest route through the maze as it is at
// that moment, with a readable intent and a fight on contact. No DOM, no clocks,
// no global randomness.
import { describe, expect, it } from "vitest";
import { Run } from "@/game/run";
import { CONFIG } from "@/game/config";
import { createRng } from "@/game/rng";
import { spawnLevel, startCell } from "@/game/spawn";
import { ENEMY_KINDS, type EnemyKind } from "@/game/enemies";
import { nextStep, routeCells } from "@/game/bot";
import type { GameEvent } from "@/game/events";

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 1013 + 7);

const STEPS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

type Cell = { x: number; y: number };

const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Read the phase without the compiler narrowing it across method calls. */
function phaseOf(run: Run): string {
  return run.phase;
}

/** A standing enemy of the given kind, with the numbers its kind carries. */
function enemyAt(id: number, x: number, y: number, kind: EnemyKind) {
  return { id, x, y, kind, hp: ENEMY_KINDS[kind].hp, power: ENEMY_KINDS[kind].power, intent: null as Cell | null };
}

/** A run whose maze never shifts: the stalker rules can be watched on a still board. */
function stillRun(seed: number): Run {
  const run = new Run({ seed, shiftsOverride: 0 });
  run.start();
  run.takeEvents();
  return run;
}

/** The first cardinal step open from (x, y). */
function openStepFrom(run: Run, x: number, y: number): { dx: number; dy: number } {
  for (const step of STEPS) {
    if (run.maze.canMove(x, y, step.dx, step.dy)) return step;
  }
  throw new Error(`no open step from (${x}, ${y})`);
}

/** The first cardinal step open from (x, y) that is not `exclude`, if any. */
function openStepExcept(run: Run, x: number, y: number, exclude: { dx: number; dy: number }): { dx: number; dy: number } | null {
  for (const step of STEPS) {
    if (step.dx === exclude.dx && step.dy === exclude.dy) continue;
    if (run.maze.canMove(x, y, step.dx, step.dy)) return step;
  }
  return null;
}

/** Length of a shortest route between two cells in the maze as it is now, -1 for none. */
function routeLength(run: Run, from: Cell, to: Cell): number {
  const path = routeCells(run.maze, from, to);
  return path === null ? -1 : path.length - 1;
}

/** A cell the stalker can stand on: reachable from the player, its first step not the exit. */
function stalkerCellFor(run: Run, minDist: number): Cell {
  const start = { x: run.player.x, y: run.player.y };
  for (let y = 0; y < run.maze.height; y++) {
    for (let x = 0; x < run.maze.width; x++) {
      const cell = { x, y };
      if (manhattan(cell, start) < minDist) continue;
      if (cell.x === run.exit.x && cell.y === run.exit.y) continue;
      if (routeLength(run, cell, start) <= 0) continue;
      const path = routeCells(run.maze, cell, start)!;
      if (path[1].x === run.exit.x && path[1].y === run.exit.y) continue;
      return cell;
    }
  }
  throw new Error("no stalker cell on this board");
}

describe("stalker spawning", () => {
  for (const depth of [1, 2, 3]) {
    it(`depth ${depth} never holds a stalker over 50 seeds`, () => {
      for (const seed of SEEDS) {
        const spawned = spawnLevel(createRng(seed), 9, { items: 3, enemies: 4 }, undefined, { depth });
        expect(spawned.enemies.some((enemy) => enemy.kind === "stalker"), `seed ${seed}`).toBe(false);
      }
    });
  }

  for (const depth of [4, 5, 6, 7]) {
    it(`depth ${depth} holds exactly one stalker over 50 seeds, at least 4 from the start`, () => {
      for (const seed of SEEDS) {
        const spawned = spawnLevel(createRng(seed), 9, { items: 3, enemies: 3 }, undefined, { depth });
        const stalkers = spawned.enemies.filter((enemy) => enemy.kind === "stalker");
        expect(stalkers.length, `seed ${seed}`).toBe(1);
        const start = startCell(9);
        expect(Math.abs(stalkers[0].x - start.x) + Math.abs(stalkers[0].y - start.y)).toBeGreaterThanOrEqual(
          CONFIG.stalkerMinDist,
        );
      }
    });
  }

  for (const depth of [8, 12]) {
    it(`depth ${depth} holds exactly two stalkers over 50 seeds, and the count is unchanged`, () => {
      for (const seed of SEEDS) {
        const spawned = spawnLevel(createRng(seed), 11, { items: 3, enemies: 5 }, undefined, { depth });
        expect(spawned.enemies.length, `seed ${seed} enemy count`).toBe(5);
        expect(spawned.enemies.filter((enemy) => enemy.kind === "stalker").length, `seed ${seed}`).toBe(2);
        const start = startCell(11);
        for (const stalker of spawned.enemies) {
          if (stalker.kind !== "stalker") continue;
          expect(Math.abs(stalker.x - start.x) + Math.abs(stalker.y - start.y)).toBeGreaterThanOrEqual(
            CONFIG.stalkerMinDist,
          );
        }
      }
    });
  }

  it("no enemy planned, no stalker", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const spawned = spawnLevel(createRng(seed), 9, { items: 3, enemies: 0 }, undefined, { depth: 8 });
      expect(spawned.enemies).toEqual([]);
    }
  });

  it("a board with no cell 4 from the start gets no stalker: it becomes a wisp", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const spawned = spawnLevel(createRng(seed), 3, { items: 0, enemies: 3 }, undefined, { depth: 8 });
      expect(spawned.enemies.some((enemy) => enemy.kind === "stalker"), `seed ${seed}`).toBe(false);
    }
  });

  it("the same seed and arguments give the same stalkers", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const a = spawnLevel(createRng(seed), 9, { items: 3, enemies: 3 }, undefined, { depth: 5 });
      const b = spawnLevel(createRng(seed), 9, { items: 3, enemies: 3 }, undefined, { depth: 5 });
      expect(a).toEqual(b);
    }
  });
});

describe("stalker steps on a still board", () => {
  it("moves only after every second successful player move, never on a blocked one", () => {
    const run = stillRun(11);
    run.items = [];
    const cell = stalkerCellFor(run, 4);
    const stalker = enemyAt(900, cell.x, cell.y, "stalker");
    run.enemies = [stalker];
    run.takeEvents();

    const out = openStepFrom(run, run.player.x, run.player.y);
    const back = { dx: -out.dx, dy: -out.dy };
    const position = () => ({ x: run.enemies[0].x, y: run.enemies[0].y });
    const before = position();

    // Move 1: a successful move, but not the second: the stalker waits.
    run.energy = 1000;
    expect(run.move(out.dx, out.dy)).toBe(true);
    expect(run.takeEvents().some((event) => event.type === "stalker")).toBe(false);
    expect(position()).toEqual(before);

    // A blocked move: refused, and it does not count toward the stalker's every second.
    let blocked: { dx: number; dy: number } | undefined = STEPS.find(
      (step) => !run.maze.canMove(run.player.x, run.player.y, step.dx, step.dy),
    );
    if (blocked === undefined) {
      // Force one: seal a side the walk back does not use (the player is not on the edge then).
      for (const step of STEPS) {
        if (step.dx === back.dx && step.dy === back.dy) continue;
        const nx = run.player.x + step.dx;
        const ny = run.player.y + step.dy;
        if (nx < 0 || ny < 0 || nx >= run.maze.width || ny >= run.maze.height) continue;
        const wallIndex = step.dy === -1 ? 0 : step.dx === 1 ? 1 : step.dy === 1 ? 2 : 3;
        run.maze.grid[run.player.y][run.player.x].walls[wallIndex] = true;
        blocked = step;
        break;
      }
    }
    expect(blocked).toBeDefined();
    run.energy = 1000;
    expect(run.move(blocked!.dx, blocked!.dy)).toBe(false);
    run.takeEvents();

    // Move 2: the second successful move: the stalker takes one legal step.
    run.energy = 1000;
    expect(run.move(back.dx, back.dy)).toBe(true);
    const events = run.takeEvents();
    expect(events.filter((event) => event.type === "stalker").length).toBe(1);
    const after = position();
    expect(manhattan(after, before)).toBe(1);
    expect(run.maze.canMove(before.x, before.y, after.x - before.x, after.y - before.y)).toBe(true);
  });

  it("its route distance to a player walking back and forth shrinks to 0, ending in a fight", () => {
    const run = stillRun(23);
    run.items = [];
    const cell = stalkerCellFor(run, 4);
    const stalker = enemyAt(900, cell.x, cell.y, "stalker");
    run.enemies = [stalker];
    run.takeEvents();

    const out = openStepFrom(run, run.player.x, run.player.y);
    const back = { dx: -out.dx, dy: -out.dy };
    const startDistance = routeLength(run, stalker, run.player);
    expect(startDistance).toBeGreaterThan(0);

    const fights: GameEvent[] = [];
    for (let i = 0; i < 400 && run.phase === "playing" && fights.length === 0; i++) {
      const step = i % 2 === 0 ? out : back;
      run.energy = 1000;
      run.move(step.dx, step.dy);
      fights.push(...run.takeEvents().filter((event) => event.type === "fight"));
    }
    expect(fights.length, "the hunt ends in a fight").toBe(1);
    expect(fights[0]).toMatchObject({ type: "fight", kind: "stalker" });
    expect(run.enemies.some((enemy) => enemy.id === 900)).toBe(false);
  });

  it("keeps moving while the maze is anchored", () => {
    const run = new Run({ seed: 5 });
    run.start();
    run.takeEvents();
    run.items = [];
    const cell = stalkerCellFor(run, 4);
    const stalker = enemyAt(900, cell.x, cell.y, "stalker");
    run.enemies = [stalker];
    run.tools.anchor = 1;
    expect(run.useTool("anchor")).toBe(true);
    run.takeEvents();
    const gridBefore = JSON.stringify(run.maze.wallGrid);

    const out = openStepFrom(run, run.player.x, run.player.y);
    let stepped = false;
    for (let i = 0; i < 2 && run.phase === "playing"; i++) {
      const step = i === 0 ? out : { dx: -out.dx, dy: -out.dy };
      run.energy = 1000;
      run.move(step.dx, step.dy);
      stepped = stepped || run.takeEvents().some((event) => event.type === "stalker");
    }
    expect(stepped, "the Anchor freezes the maze, not the stalker").toBe(true);
    expect(JSON.stringify(run.maze.wallGrid)).toBe(gridBefore);
  });
});

describe("stalker steps on a shifting maze", () => {
  it("over 20 seeds and 200 moves it never crosses a wall, leaves the board, shares a cell or stands on the exit", () => {
    for (let seed = 0; seed < 20; seed++) {
      const run = new Run({ seed: seed * 131 + 17 });
      run.start();
      // Jump straight onto the first stalker level.
      run.level = ENEMY_KINDS.stalker.fromDepth - 1;
      run.phase = "clear";
      run.nextLevel();
      run.takeEvents();

      let sawStalkerStep = false;
      for (let i = 0; i < 200 && phaseOf(run) !== "dead"; i++) {
        if (phaseOf(run) === "clear") {
          run.nextLevel();
          run.takeEvents();
          continue;
        }
        run.energy = 1000; // this observation run is about the walk, not the clock
        const step = nextStep(run) ?? openStepFrom(run, run.player.x, run.player.y);
        const before = new Map(
          run.enemies.filter((enemy) => enemy.kind === "stalker").map((enemy) => [enemy.id, { x: enemy.x, y: enemy.y }]),
        );
        run.move(step.dx, step.dy);
        for (const event of run.takeEvents()) {
          if (event.type !== "stalker") continue;
          sawStalkerStep = true;
          const old = before.get(event.id);
          expect(old, `seed ${seed}: a stalker event for an unknown stalker`).toBeDefined();
          expect(manhattan(old!, event), `seed ${seed}: one cell per step`).toBe(1);
          expect(
            run.maze.canMove(old!.x, old!.y, event.x - old!.x, event.y - old!.y),
            `seed ${seed}: no wall crossed`,
          ).toBe(true);
        }
        for (const enemy of run.enemies) {
          if (enemy.kind !== "stalker") continue;
          expect(enemy.x >= 0 && enemy.x < run.maze.width, `seed ${seed}: on the board`).toBe(true);
          expect(enemy.y >= 0 && enemy.y < run.maze.height, `seed ${seed}: on the board`).toBe(true);
          expect(enemy.x === run.exit.x && enemy.y === run.exit.y, `seed ${seed}: off the exit`).toBe(false);
          for (const other of run.enemies) {
            if (other === enemy) continue;
            expect(other.x === enemy.x && other.y === enemy.y, `seed ${seed}: no shared cell`).toBe(false);
          }
        }
      }
      expect(sawStalkerStep, `seed ${seed} never saw a stalker step`).toBe(true);
    }
  });
});

describe("stalker fights", () => {
  it("reaching the player with less energy left than its toll ends the run with cause fight", () => {
    const run = stillRun(31);
    run.items = [];
    const out = openStepFrom(run, run.player.x, run.player.y);
    const toward = openStepExcept(run, run.player.x, run.player.y, out);
    expect(toward, "the player cell needs a second open side").not.toBeNull();
    const stalker = enemyAt(900, run.player.x + toward!.dx, run.player.y + toward!.dy, "stalker");
    run.enemies = [stalker];
    run.takeEvents();

    // Two successful moves walk the player away and back; the stalker then steps in.
    run.energy = 5; // less than the toll of 15
    expect(run.move(out.dx, out.dy)).toBe(true);
    run.takeEvents();
    expect(run.move(-out.dx, -out.dy)).toBe(true);
    const events = run.takeEvents();

    const fight = events.find((event) => event.type === "fight");
    expect(fight, "the stalker's step starts the fight at once").toMatchObject({
      type: "fight",
      kind: "stalker",
      by: "stalker",
      x: run.player.x,
      y: run.player.y,
    });
    expect(run.phase).toBe("dead");
    expect(events[events.length - 1]).toMatchObject({ type: "dead", cause: "fight" });
  });

  it("stepping onto a stalker yourself works like any enemy", () => {
    const run = stillRun(51);
    run.items = [];
    const step = openStepFrom(run, run.player.x, run.player.y);
    const stalker = enemyAt(900, run.player.x + step.dx, run.player.y + step.dy, "stalker");
    run.enemies = [stalker];
    run.takeEvents();

    const toll = run.tollOf(stalker);
    expect(toll).toBe(ENEMY_KINDS.stalker.baseCost);
    const energyBefore = run.energy;
    run.move(step.dx, step.dy);
    const events = run.takeEvents();

    const fight = events.find((event) => event.type === "fight");
    expect(fight).toMatchObject({ type: "fight", kind: "stalker", x: stalker.x, y: stalker.y });
    expect((fight as { by?: string }).by, "the player walked into it: no by").toBeUndefined();
    expect(run.enemies.length).toBe(0);
    expect(run.energy).toBeCloseTo(energyBefore - toll - run.stats.consumption, 6);
    expect(run.tally.kills).toBe(1);
  });
});

describe("stalker intent", () => {
  it("is null when there is no route and always a neighbour of the stalker otherwise", () => {
    const run = stillRun(41);
    run.items = [];
    const cell = stalkerCellFor(run, 4);
    const stalker = enemyAt(900, cell.x, cell.y, "stalker");
    run.enemies = [stalker];
    run.takeEvents();

    // A successful player move puts a hint on the board: the cell it means to step to.
    const out = openStepFrom(run, run.player.x, run.player.y);
    run.energy = 1000;
    run.move(out.dx, out.dy);
    run.takeEvents();
    expect(stalker.intent, "a hint while a route exists").not.toBeNull();
    expect(manhattan(stalker.intent!, stalker)).toBe(1);
    expect(stalker.intent!.x >= 0 && stalker.intent!.x < run.maze.width).toBe(true);
    expect(stalker.intent!.y >= 0 && stalker.intent!.y < run.maze.height).toBe(true);

    // Seal the stalker's own cell on all four sides: no route, no hint.
    run.maze.grid[stalker.y][stalker.x].walls = [true, true, true, true];
    run.energy = 1000;
    run.move(-out.dx, -out.dy);
    run.takeEvents();
    expect(stalker.intent).toBeNull();
  });

  it("the other kinds carry no intent", () => {
    const run = stillRun(43);
    run.items = [];
    const cell = stalkerCellFor(run, 4);
    const wisp = enemyAt(901, cell.x, cell.y, "wisp");
    run.enemies = [wisp];
    run.takeEvents();
    const out = openStepFrom(run, run.player.x, run.player.y);
    run.energy = 1000;
    run.move(out.dx, out.dy);
    expect(wisp.intent).toBeNull();
  });

  it("waits instead of stepping onto another enemy", () => {
    const run = stillRun(47);
    run.items = [];
    const cell = stalkerCellFor(run, 4);
    const stalker = enemyAt(900, cell.x, cell.y, "stalker");
    run.enemies = [stalker];
    run.takeEvents();

    // Stand a wisp exactly on the cell the stalker means to step to.
    const path = routeCells(run.maze, stalker, run.player)!;
    const blocker = enemyAt(901, path[1].x, path[1].y, "wisp");
    run.enemies = [stalker, blocker];
    const before = { x: stalker.x, y: stalker.y };

    const out = openStepFrom(run, run.player.x, run.player.y);
    for (let i = 0; i < 2 && run.phase === "playing"; i++) {
      run.energy = 1000;
      run.move(i === 0 ? out.dx : -out.dx, i === 0 ? out.dy : -out.dy);
      run.takeEvents();
    }
    expect({ x: stalker.x, y: stalker.y }, "the blocked stalker waits").toEqual(before);
  });
});

describe("stalker determinism", () => {
  it("the same seed and inputs give the same events", () => {
    const play = (): GameEvent[] => {
      const run = new Run({ seed: 77 });
      const all: GameEvent[] = [];
      run.start();
      for (let i = 0; i < 400 && run.phase !== "dead"; i++) {
        all.push(...run.takeEvents());
        if (run.phase === "clear") {
          run.nextLevel();
          continue;
        }
        const step = nextStep(run) ?? openStepFrom(run, run.player.x, run.player.y);
        run.tick(250);
        run.move(step.dx, step.dy);
      }
      all.push(...run.takeEvents());
      return all;
    };
    const first = play();
    expect(first.length).toBeGreaterThan(0);
    expect(play()).toEqual(first);
    expect(first.some((event) => event.type === "stalker"), "the hunt is in the events").toBe(true);
  });
});
