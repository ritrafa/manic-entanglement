import { describe, expect, it } from "vitest";
import { Run } from "@/game/run";
import { CONFIG } from "@/game/config";
import type { GameEvent, ItemType } from "@/game/events";

const STEPS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

function startedRun(seed: number): Run {
  const run = new Run({ seed });
  run.start();
  run.takeEvents();
  return run;
}

/** The first cardinal step open from the player's cell. */
function openStep(run: Run): { dx: number; dy: number } {
  for (const step of STEPS) {
    if (run.maze.canMove(run.player.x, run.player.y, step.dx, step.dy)) return step;
  }
  throw new Error("no open step from the player cell");
}

/** Stand the player below the exit, open the wall and step in, reaching "clear". */
function reachClear(run: Run): void {
  run.items = [];
  run.enemies = [];
  run.player.x = run.exit.x;
  run.player.y = run.exit.y + 1;
  run.maze.grid[run.player.y][run.player.x].walls[0] = false; // open the wall to the exit
  run.move(0, -1);
}

function eventsOf(run: Run, type: string): GameEvent[] {
  return run.takeEvents().filter((event) => event.type === type);
}

describe("Run phases", () => {
  it("move does nothing in ready, clear and dead", () => {
    const ready = new Run({ seed: 1 });
    const before = { energy: ready.energy, score: ready.score, x: ready.player.x, y: ready.player.y };
    expect(ready.move(0, -1)).toBe(false);
    expect(ready.energy).toBe(before.energy);
    expect(ready.score).toBe(before.score);
    expect(ready.player.x).toBe(before.x);
    expect(ready.player.y).toBe(before.y);
    expect(ready.takeEvents()).toEqual([]);

    const clear = startedRun(2);
    reachClear(clear);
    clear.takeEvents();
    const clearBefore = { energy: clear.energy, score: clear.score, x: clear.player.x, y: clear.player.y };
    expect(clear.move(0, 1)).toBe(false);
    expect(clear.energy).toBe(clearBefore.energy);
    expect(clear.score).toBe(clearBefore.score);
    expect(clear.player.x).toBe(clearBefore.x);
    expect(clear.player.y).toBe(clearBefore.y);
    expect(clear.takeEvents()).toEqual([]);

    const dead = startedRun(3);
    dead.tick(20000);
    expect(dead.phase).toBe("dead");
    dead.takeEvents();
    const deadBefore = { energy: dead.energy, score: dead.score, x: dead.player.x, y: dead.player.y };
    expect(dead.move(0, 1)).toBe(false);
    expect(dead.energy).toBe(deadBefore.energy);
    expect(dead.score).toBe(deadBefore.score);
    expect(dead.player.x).toBe(deadBefore.x);
    expect(dead.player.y).toBe(deadBefore.y);
    expect(dead.takeEvents()).toEqual([]);
  });

  it("tick changes nothing outside playing", () => {
    const ready = new Run({ seed: 4 });
    const readyEnergy = ready.energy;
    ready.tick(60000);
    expect(ready.energy).toBe(readyEnergy);
    expect(ready.phase).toBe("ready");

    const clear = startedRun(5);
    reachClear(clear);
    const clearEnergy = clear.energy;
    clear.tick(60000);
    expect(clear.energy).toBe(clearEnergy);
    expect(clear.phase).toBe("clear");

    const dead = startedRun(6);
    dead.tick(20000);
    const deadEnergy = dead.energy;
    dead.tick(60000);
    expect(dead.energy).toBe(deadEnergy);
    expect(dead.phase).toBe("dead");
  });

  it("start goes from ready or dead to playing at level 1 with score 0, keeping stats", () => {
    const run = new Run({ seed: 7 });
    run.start();
    const events = run.takeEvents();
    expect(events[0]).toEqual({ type: "start" });
    expect(events[1]).toEqual({ type: "levelStart", level: 1, size: CONFIG.startSize });
    expect(run.phase).toBe("playing");

    run.stats.attack = 2.3;
    run.stats.storage = 150;
    run.score = 42;
    run.level = 4;
    run.tick(999999);
    expect(run.phase).toBe("dead");

    run.start();
    expect(run.phase).toBe("playing");
    expect(run.level).toBe(1);
    expect(run.score).toBe(0);
    expect(run.stats.attack).toBe(2.3);
    expect(run.stats.storage).toBe(150);
    expect(run.energy).toBe(150); // max(100, storage)
  });
});

describe("Energy clock", () => {
  it("15000 ms of doing nothing kills a fresh run with cause time", () => {
    const run = startedRun(8);
    run.tick(15000);
    expect(run.phase).toBe("dead");
    const dead = eventsOf(run, "dead");
    expect(dead).toHaveLength(1);
    expect(dead[0]).toEqual({ type: "dead", cause: "time", score: 0, level: 1 });
  });

  it("14000 ms of doing nothing does not kill a fresh run", () => {
    const run = startedRun(9);
    run.tick(14000);
    expect(run.phase).toBe("playing");
    expect(run.energy).toBeGreaterThan(0);
    expect(run.takeEvents().some((event) => event.type === "dead")).toBe(false);
  });

  it("speed takes effect at once", () => {
    const run = startedRun(10);
    run.stats.speed = 2; // drains take twice as long
    run.tick(14000);
    expect(run.energy).toBe(100 - 46); // 14000 / 300 = 46 drains
  });
});

describe("Moves", () => {
  it("a blocked move costs nothing and emits blocked", () => {
    const run = startedRun(11);
    const wallGrid = JSON.stringify(run.maze.wallGrid);
    const origin = JSON.stringify(run.maze.origin);
    const before = { energy: run.energy, score: run.score, x: run.player.x, y: run.player.y };
    // The bottom edge is always a wall: one step down from the start row leaves the maze.
    expect(run.move(0, 1)).toBe(false);
    expect(run.energy).toBe(before.energy);
    expect(run.score).toBe(before.score);
    expect(run.player.x).toBe(before.x);
    expect(run.player.y).toBe(before.y);
    expect(JSON.stringify(run.maze.wallGrid)).toBe(wallGrid); // no shift happened
    expect(JSON.stringify(run.maze.origin)).toBe(origin);
    expect(run.takeEvents()).toEqual([{ type: "blocked", dx: 0, dy: 1 }]);
  });

  it("a successful move costs consumption, scores and moves the player", () => {
    const run = startedRun(12);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    expect(run.move(step.dx, step.dy)).toBe(true);
    expect(run.player.x).toBe(Math.floor(CONFIG.startSize / 2) + step.dx);
    expect(run.player.y).toBe(CONFIG.startSize - 1 + step.dy);
    expect(run.energy).toBe(100 - 1 * run.stats.consumption);
    expect(run.score).toBe(1);
    expect(run.takeEvents()).toEqual([
      { type: "move", x: run.player.x, y: run.player.y, dx: step.dx, dy: step.dy },
    ]);
  });

  it("left and right set the facing", () => {
    const run = startedRun(13);
    run.items = [];
    run.enemies = [];
    if (run.maze.canMove(run.player.x, run.player.y, -1, 0)) {
      run.move(-1, 0);
      expect(run.player.facingLeft).toBe(true);
    }
    if (run.maze.canMove(run.player.x, run.player.y, 1, 0)) {
      run.move(1, 0);
      expect(run.player.facingLeft).toBe(false);
    }
  });
});

describe("Pickups", () => {
  const cases: { type: ItemType; text: string; check: (run: Run, energyBefore: number) => void }[] = [
    {
      type: "energy",
      text: "+25 Energy",
      check: (run, before) => {
        expect(run.energy).toBeCloseTo(Math.min(run.stats.storage, before - 1 + 25), 10);
      },
    },
    {
      type: "boots",
      text: "-1% Energy Use",
      check: (run) => expect(run.stats.consumption).toBeCloseTo(0.99, 10),
    },
    {
      type: "gloves",
      text: "+0.1 Attack",
      check: (run) => expect(run.stats.attack).toBeCloseTo(1.1, 10),
    },
    {
      type: "shield",
      text: "+0.1 Defense",
      check: (run) => expect(run.stats.defense).toBeCloseTo(1.1, 10),
    },
    {
      type: "speed",
      text: "+1% Speed",
      check: (run) => expect(run.stats.speed).toBeCloseTo(1.01, 10),
    },
    {
      type: "backpack",
      text: "+5 Energy Storage",
      check: (run, before) => {
        expect(run.stats.storage).toBe(105);
        expect(run.energy).toBeCloseTo(before - 1 + 5, 10);
      },
    },
  ];

  for (const { type, text, check } of cases) {
    it(`${type} changes exactly its fields and is removed`, () => {
      const run = startedRun(14);
      run.items = [];
      run.enemies = [];
      const step = openStep(run);
      const target = { x: run.player.x + step.dx, y: run.player.y + step.dy };
      run.items = [{ id: 900, x: target.x, y: target.y, type }];
      const energyBefore = run.energy;
      const statsBefore = { ...run.stats };
      run.move(step.dx, step.dy);

      expect(run.items).toEqual([]);
      check(run, energyBefore);
      // Everything not listed for this pickup is untouched.
      for (const stat of ["attack", "defense", "speed", "consumption", "storage"] as const) {
        if (type === "boots" && stat === "consumption") continue;
        if (type === "gloves" && stat === "attack") continue;
        if (type === "shield" && stat === "defense") continue;
        if (type === "speed" && stat === "speed") continue;
        if (type === "backpack" && stat === "storage") continue;
        expect(run.stats[stat]).toBe(statsBefore[stat]);
      }
      const pickups = eventsOf(run, "pickup");
      expect(pickups).toEqual([{ type: "pickup", item: type, text, x: target.x, y: target.y }]);
    });
  }

  it("energy never exceeds storage", () => {
    const run = startedRun(15);
    run.items = [];
    run.enemies = [];
    run.energy = run.stats.storage - 10;
    const step = openStep(run);
    run.items = [{ id: 901, x: run.player.x + step.dx, y: run.player.y + step.dy, type: "energy" }];
    run.move(step.dx, step.dy);
    expect(run.energy).toBe(run.stats.storage);
  });
});

describe("Fights", () => {
  it("a fight at default stats costs 15 and removes the enemy", () => {
    const run = startedRun(16);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    const target = { x: run.player.x + step.dx, y: run.player.y + step.dy };
    run.enemies = [{ id: 910, x: target.x, y: target.y }];
    run.move(step.dx, step.dy);
    expect(run.energy).toBeCloseTo(100 - 1 - 15, 10);
    expect(run.enemies).toEqual([]);
    expect(run.phase).toBe("playing");
    expect(run.takeEvents()).toContainEqual({ type: "fight", cost: 15, x: target.x, y: target.y });
  });

  it("a fight that drains the energy ends the run with cause fight", () => {
    const run = startedRun(17);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.enemies = [{ id: 911, x: run.player.x + step.dx, y: run.player.y + step.dy }];
    run.energy = 10; // the move (1) plus the fight (15) take it below 0
    run.move(step.dx, step.dy);
    expect(run.phase).toBe("dead");
    const dead = eventsOf(run, "dead");
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ type: "dead", cause: "fight", level: 1 });
  });

  it("fightCostAt gives the whole-number cost of the enemy on a cell, or null", () => {
    const run = startedRun(18);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    const target = { x: run.player.x + step.dx, y: run.player.y + step.dy };
    expect(run.fightCostAt(target.x, target.y)).toBeNull();
    run.enemies = [{ id: 913, x: target.x, y: target.y }];
    expect(run.fightCostAt(target.x, target.y)).toBe(15);
    run.stats.attack = 3;
    expect(run.fightCostAt(target.x, target.y)).toBe(5);
    expect(run.fightCostAt(run.player.x, run.player.y)).toBeNull();
  });

  it("a better attack and defense lower the cost", () => {
    const run = new Run({ seed: 18, stats: { attack: 2, defense: 5 } });
    run.start();
    run.takeEvents();
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.enemies = [{ id: 912, x: run.player.x + step.dx, y: run.player.y + step.dy }];
    run.move(step.dx, step.dy);
    // cost = round(3 / 2 * max(1, 6 - 5)) = 2
    expect(run.takeEvents()).toContainEqual({
      type: "fight",
      cost: 2,
      x: run.player.x,
      y: run.player.y,
    });
  });
});

describe("Levels", () => {
  it("reaching the exit clears the level and stops the clock and the moves", () => {
    const run = startedRun(19);
    reachClear(run);
    expect(run.phase).toBe("clear");
    const energy = run.energy;
    run.tick(60000);
    expect(run.energy).toBe(energy);
    expect(run.move(0, 1)).toBe(false);
    const events = run.takeEvents();
    expect(events).toContainEqual({ type: "levelClear", level: 1 });
  });

  it("nextLevel grows the maze, refills energy and keeps the start and exit free", () => {
    const run = startedRun(20);
    reachClear(run);
    run.takeEvents();
    run.nextLevel();
    expect(run.phase).toBe("playing");
    expect(run.level).toBe(2);
    expect(run.maze.width).toBe(CONFIG.startSize + CONFIG.sizeStep);
    expect(run.maze.height).toBe(CONFIG.startSize + CONFIG.sizeStep);
    expect(run.energy).toBe(Math.max(CONFIG.startEnergy, run.stats.storage));
    expect(run.score).toBe(1); // score carries over between levels
    expect(run.takeEvents()).toEqual([{ type: "levelStart", level: 2, size: CONFIG.startSize + CONFIG.sizeStep }]);

    const forbidden = [
      { x: run.player.x, y: run.player.y },
      { x: run.exit.x, y: run.exit.y },
    ];
    for (const spot of forbidden) {
      expect(run.items.some((item) => item.x === spot.x && item.y === spot.y)).toBe(false);
      expect(run.enemies.some((enemy) => enemy.x === spot.x && enemy.y === spot.y)).toBe(false);
    }
  });

  it("nextLevel only works from clear", () => {
    const run = startedRun(21);
    const level = run.level;
    run.nextLevel();
    expect(run.level).toBe(level);
    expect(run.phase).toBe("playing");
  });

  it("items and enemies get ids unique within the run", () => {
    const run = startedRun(22);
    const ids = [...run.items.map((i) => i.id), ...run.enemies.map((e) => e.id)];
    expect(new Set(ids).size).toBe(ids.length);
    run.items = [];
    run.enemies = [];
    run.player.x = run.exit.x;
    run.player.y = run.exit.y + 1;
    run.maze.grid[run.player.y][run.player.x].walls[0] = false;
    run.move(0, -1);
    run.nextLevel();
    const all = [...run.items.map((i) => i.id), ...run.enemies.map((e) => e.id)];
    expect(new Set(all).size).toBe(all.length);
    expect(Math.min(...all)).toBeGreaterThan(Math.max(...ids));
  });
});

describe("Determinism", () => {
  it("two runs with the same seed and the same moves produce the same events", () => {
    const moves = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
    ];
    const play = () => {
      const run = new Run({ seed: 1234 });
      run.start();
      for (let round = 0; round < 5; round++) {
        for (const { dx, dy } of moves) {
          run.tick(120);
          run.move(dx, dy);
          if (run.phase === "clear") run.nextLevel();
          if (run.phase === "dead") return run.takeEvents();
        }
      }
      return run.takeEvents();
    };
    expect(play()).toEqual(play());
  });

  it("a seeded run can be played to its death through Run alone", () => {
    const run = new Run({ seed: 777 });
    run.start();
    let guard = 0;
    while (run.phase === "playing" && guard < 10000) {
      guard++;
      run.tick(100);
      if (run.phase !== "playing") break;
      const step = STEPS.find((s) => run.maze.canMove(run.player.x, run.player.y, s.dx, s.dy));
      expect(step).toBeDefined();
      run.move(step!.dx, step!.dy);
      if ((run.phase as string) === "clear") run.nextLevel();
    }
    expect(run.phase).toBe("dead");
    const events = run.takeEvents();
    const dead = events.filter((event) => event.type === "dead");
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ type: "dead", level: run.level, score: run.score });
    expect(run.score).toBeGreaterThan(0);
  });
});
