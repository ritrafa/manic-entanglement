import { describe, expect, it } from "vitest";
import { Run } from "@/game/run";
import { CONFIG } from "@/game/config";
import { levelPlan } from "@/game/plan";
import type { GameEvent, ItemType } from "@/game/events";
import { KILL_SCORE, PICKUP_SCORE, levelScore } from "@/game/score";
import { ENEMY_KINDS, type EnemyKind } from "@/game/enemies";
import { fightCost } from "@/game/combat";
import { GEAR_TYPES } from "@/game/spawn";
import { routeCells } from "@/game/bot";
import {
    addGear,
    gearCap,
    noGear,
    statsFromGear,
    type GearId,
    type GearLevels,
} from "@/game/gear";

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

/** A standing enemy of the given kind, with the numbers its kind carries. */
function enemyAt(id: number, x: number, y: number, kind: EnemyKind = "wisp") {
  return { id, x, y, kind, hp: ENEMY_KINDS[kind].hp, power: ENEMY_KINDS[kind].power };
}

/** The stats a gear pickup of this type must leave, given the levels held before it. */
function expectGearEffect(before: GearLevels, after: ReturnType<typeof statsFromGear>, type: string): void {
  if (type === "energy") {
    expect(after).toEqual(statsFromGear(before));
    return;
  }
  const id = type as GearId;
  expect(after).toEqual(statsFromGear({ ...before, [id]: before[id] + 1 }));
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

  it("start goes from ready or dead to playing at level 1 with score 0, keeping the bank", () => {
    const run = new Run({ seed: 7, gear: { ...noGear(), gloves: 13, backpack: 10 } });
    run.start();
    const events = run.takeEvents();
    expect(events[0]).toEqual({ type: "start" });
    expect(events[1]).toEqual({ type: "levelStart", level: 1, size: CONFIG.startSize });
    expect(run.phase).toBe("playing");

    run.score = 42;
    run.level = 4;
    run.tick(999999);
    expect(run.phase).toBe("dead");

    run.start();
    expect(run.phase).toBe("playing");
    expect(run.level).toBe(1);
    expect(run.score).toBe(0);
    expect(run.stats.attack).toBeCloseTo(2.3, 10); // 1 + 0.1 * 13 banked gloves
    expect(run.stats.storage).toBe(150); // 100 + 5 * 10 banked backpacks
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
    expect(dead[0]).toEqual({ type: "dead", cause: "time", score: 0, level: 1, lost: 0 });
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
    run.banked.speed = 21; // the cap: every drain takes 150 * 1.5 ms
    run.tick(14000);
    expect(run.energy).toBe(100 - 62); // 14000 / 225 = 62 drains
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

  it("a successful move costs consumption, counts the move and moves the player", () => {
    const run = startedRun(12);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    expect(run.move(step.dx, step.dy)).toBe(true);
    expect(run.player.x).toBe(Math.floor(CONFIG.startSize / 2) + step.dx);
    expect(run.player.y).toBe(CONFIG.startSize - 1 + step.dy);
    expect(run.energy).toBe(100 - 1 * run.stats.consumption);
    expect(run.score).toBe(0); // steps score nothing
    expect(run.tally.moves).toBe(1);
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
      text: "-2% Energy Use",
      check: (run) => expect(run.stats.consumption).toBeCloseTo(0.98, 10),
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
      text: "+2% Speed",
      check: (run) => expect(run.stats.speed).toBeCloseTo(1.02, 10),
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
    run.enemies = [enemyAt(910, target.x, target.y)];
    run.move(step.dx, step.dy);
    expect(run.energy).toBeCloseTo(100 - 1 - 15, 10);
    expect(run.enemies).toEqual([]);
    expect(run.phase).toBe("playing");
    expect(run.takeEvents()).toContainEqual({ type: "fight", cost: 15, kind: "wisp", x: target.x, y: target.y });
  });

  it("a fight that drains the energy ends the run with cause fight", () => {
    const run = startedRun(17);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.enemies = [enemyAt(911, run.player.x + step.dx, run.player.y + step.dy)];
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
    run.enemies = [enemyAt(913, target.x, target.y)];
    expect(run.fightCostAt(target.x, target.y)).toBe(15);
    run.banked.gloves = gearCap("gloves"); // attack 3
    expect(run.fightCostAt(target.x, target.y)).toBe(5);
    expect(run.fightCostAt(run.player.x, run.player.y)).toBeNull();
  });

  it("a better attack and defense lower the cost", () => {
    const run = new Run({ seed: 18, gear: { ...noGear(), gloves: 10, shield: 20 } }); // attack 2, defense 3
    run.start();
    run.takeEvents();
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.enemies = [enemyAt(912, run.player.x + step.dx, run.player.y + step.dy)];
    run.move(step.dx, step.dy);
    // cost = round(3 / 2 * max(1, 6 - 3)) = 5
    expect(run.takeEvents()).toContainEqual({
      type: "fight",
      cost: 5,
      kind: "wisp",
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
    expect(events).toContainEqual({
      type: "levelClear",
      level: 1,
      gained: levelScore({ level: 1, energyLeft: run.energy }),
    });
  });

  it("nextLevel builds from levelPlan and keeps the start and exit free", () => {
    const run = startedRun(20);
    reachClear(run);
    const gained = levelScore({ level: 1, energyLeft: run.energy });
    run.takeEvents();
    run.nextLevel();
    expect(run.phase).toBe("playing");
    expect(run.level).toBe(2);
    // The size steps only every two levels, so level 2 is still startSize x startSize.
    expect(run.maze.width).toBe(levelPlan(2).size);
    expect(run.maze.height).toBe(levelPlan(2).size);
    expect(run.score).toBe(gained); // the level-1 award carries over between levels
    expect(run.takeEvents()).toEqual([{ type: "levelStart", level: 2, size: levelPlan(2).size }]);

    const forbidden = [
      { x: run.player.x, y: run.player.y },
      { x: run.exit.x, y: run.exit.y },
    ];
    for (const spot of forbidden) {
      expect(run.items.some((item) => item.x === spot.x && item.y === spot.y)).toBe(false);
      expect(run.enemies.some((enemy) => enemy.x === spot.x && enemy.y === spot.y)).toBe(false);
    }
  });

  it("levels follow the plan: sizes 5, 5, 7, 7 and the planned placements up to the cap", () => {
    const run = startedRun(23);
    run.start();
    for (let level = 1; level <= 6; level++) {
      const plan = levelPlan(level);
      expect(run.level).toBe(level);
      expect(run.maze.width).toBe(plan.size);
      expect(run.maze.height).toBe(plan.size);
      expect(run.player).toMatchObject({ x: Math.floor(plan.size / 2), y: plan.size - 1 });
      expect(run.exit).toEqual({ x: Math.floor(plan.size / 2), y: 0 });
      expect(run.enemies.length).toBeLessThanOrEqual(plan.enemies);
      // Tool pickups ride along in items but are separate from the pickup count.
      expect(run.items.length).toBeLessThanOrEqual(plan.items[1] + plan.tools);
      if (level === 6) break;
      reachClear(run); // clears and stops the clock; nextLevel goes on
      run.takeEvents();
      run.nextLevel();
      run.takeEvents();
    }
  });

  it("nextLevel keeps the energy left and adds the exit bonus", () => {
    const run = startedRun(24);
    reachClear(run);
    run.takeEvents();
    run.energy = 30;
    run.nextLevel();
    expect(run.energy).toBe(80); // 30 kept + 50 bonus
  });

  it("the carried energy is capped at storage", () => {
    const run = startedRun(25);
    reachClear(run);
    run.takeEvents();
    run.energy = 90; // storage is 100
    expect(run.stats.storage).toBe(100);
    run.nextLevel();
    expect(run.energy).toBe(100);
  });

  it("start refills to max(startEnergy, storage) whatever the last level left", () => {
    const run = startedRun(26);
    reachClear(run);
    run.takeEvents();
    run.energy = 30;
    run.nextLevel();
    run.takeEvents();
    run.tick(999999); // die on the new level
    expect(run.phase).toBe("dead");
    run.start();
    expect(run.level).toBe(1);
    expect(run.energy).toBe(Math.max(CONFIG.startEnergy, run.stats.storage));
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
    expect(run.tally.moves).toBeGreaterThan(0);
  });
});

describe("Score and tally", () => {
  it("twenty moves without touching anything score nothing but count as moves", () => {
    const run = startedRun(31);
    run.items = [];
    run.enemies = [];
    for (let i = 0; i < 20; i++) {
      const step = openStep(run);
      expect(run.move(step.dx, step.dy)).toBe(true);
    }
    expect(run.score).toBe(0);
    expect(run.tally.moves).toBe(20);
    expect(run.tally.kills).toBe(0);
    expect(run.tally.pickups).toBe(0);
    expect(run.tally.bumps).toBe(0);
  });

  it("a blocked move raises tally.bumps only", () => {
    const run = startedRun(32);
    run.items = [];
    run.enemies = [];
    expect(run.move(0, 1)).toBe(false); // the bottom edge is always a wall
    expect(run.tally.bumps).toBe(1);
    expect(run.tally.moves).toBe(0);
    expect(run.score).toBe(0);
  });

  it("picking up one item gives +10 and tally.pickups 1", () => {
    const run = startedRun(33);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.items = [{ id: 920, x: run.player.x + step.dx, y: run.player.y + step.dy, type: "boots" }];
    run.move(step.dx, step.dy);
    expect(run.score).toBe(PICKUP_SCORE);
    expect(run.tally.pickups).toBe(1);
  });

  it("defeating one enemy gives +25, tally.kills 1 and lostToFights the cost", () => {
    const run = startedRun(34);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.enemies = [enemyAt(921, run.player.x + step.dx, run.player.y + step.dy)];
    const cost = run.fightCostAt(run.player.x + step.dx, run.player.y + step.dy)!;
    run.move(step.dx, step.dy);
    expect(run.score).toBe(KILL_SCORE);
    expect(run.tally.kills).toBe(1);
    expect(run.tally.lostToFights).toBe(cost);
    expect(cost).toBe(15); // default stats
  });

  it("clearing level 1 with 37.2 energy adds 137, clears one and reaches depth 2", () => {
    const run = startedRun(35);
    run.items = [];
    run.enemies = [];
    run.energy = 38.2; // the step into the exit costs 1, leaving 37.2
    reachClear(run);
    expect(run.score).toBe(137);
    expect(run.tally.cleared).toBe(1);
    expect(run.tally.depth).toBe(2);
    const clear = eventsOf(run, "levelClear");
    expect(clear).toEqual([{ type: "levelClear", level: 1, gained: 137 }]);
  });

  it("tally.ms grows only while playing", () => {
    const ready = new Run({ seed: 36 });
    ready.tick(1000);
    expect(ready.tally.ms).toBe(0);

    const run = startedRun(36);
    expect(run.tally.ms).toBe(0);
    run.tick(500);
    expect(run.tally.ms).toBe(500);

    reachClear(run); // now "clear"
    run.tick(500);
    expect(run.tally.ms).toBe(500);

    run.nextLevel();
    run.tick(300);
    expect(run.tally.ms).toBe(800);

    run.tick(999999); // dies on the clock
    expect(run.phase).toBe("dead");
    const atDeath = run.tally.ms;
    run.tick(500);
    expect(run.tally.ms).toBe(atDeath);
  });

  it("start() after death resets the tally and the score, and the tally survives death", () => {
    const run = startedRun(37);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.enemies = [enemyAt(922, run.player.x + step.dx, run.player.y + step.dy)];
    run.move(step.dx, step.dy);
    run.tick(999999);
    expect(run.phase).toBe("dead");
    // Readable after death, still holding what the run did.
    expect(run.tally.kills).toBe(1);
    expect(run.tally.lostToFights).toBe(15);
    expect(run.tally.moves).toBe(1);
    expect(run.score).toBe(KILL_SCORE);

    run.start();
    expect(run.score).toBe(0);
    expect(run.tally).toEqual({
      moves: 0, ms: 0, kills: 0, pickups: 0, bumps: 0, depth: 1, cleared: 0, lostToFights: 0,
    });
  });

  it("the tally starts at depth 1 and survives nextLevel", () => {
    const run = startedRun(38);
    expect(run.tally.depth).toBe(1);
    reachClear(run);
    run.nextLevel();
    expect(run.tally.depth).toBe(2);
    expect(run.tally.cleared).toBe(1);
  });
});

describe("Enemy kinds and tolls", () => {
  it("spawned enemies carry the kind with its hp and power", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = startedRun(seed);
      for (const enemy of run.enemies) {
        expect(ENEMY_KINDS[enemy.kind]).toBeDefined();
        expect(enemy.hp).toBe(ENEMY_KINDS[enemy.kind].hp);
        expect(enemy.power).toBe(ENEMY_KINDS[enemy.kind].power);
      }
    }
  });

  it("tollOf equals fightCost with the current stats and drops when attack rises", () => {
    const run = startedRun(50);
    run.items = [];
    run.enemies = [];
    const enemy = enemyAt(940, run.player.x, run.player.y, "brute");
    run.enemies = [enemy];
    expect(run.tollOf(enemy)).toBe(fightCost(run.stats, enemy));
    expect(run.tollOf(enemy)).toBe(30); // default stats
    const before = run.tollOf(enemy);
    run.carried.gloves += 5; // attack 1.5
    expect(run.tollOf(enemy)).toBeLessThan(before);
    expect(run.tollOf(enemy)).toBe(fightCost(run.stats, enemy));
    expect(run.fightCostAt(enemy.x, enemy.y)).toBe(run.tollOf(enemy));
  });

  it("beating a brute emits fight then exactly one gear pickup that changes the stats", () => {
    const run = startedRun(51);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    const target = { x: run.player.x + step.dx, y: run.player.y + step.dy };
    run.enemies = [enemyAt(941, target.x, target.y, "brute")];
    const statsBefore = run.stats;
    const levelsBefore = addGear(run.banked, run.carried);
    const scoreBefore = run.score;
    run.move(step.dx, step.dy);
    const events = run.takeEvents();
    const fights = events.filter((event) => event.type === "fight");
    expect(fights).toEqual([
      { type: "fight", cost: fightCost(statsBefore, ENEMY_KINDS.brute), kind: "brute", x: target.x, y: target.y },
    ]);
    const pickups = events.filter((event) => event.type === "pickup");
    expect(pickups).toHaveLength(1);
    const item = (pickups as unknown as [{ item: ItemType }])[0].item;
    expect(GEAR_TYPES).toContain(item);
    expectGearEffect(levelsBefore, run.stats, item);
    expect(run.score).toBe(scoreBefore + KILL_SCORE + PICKUP_SCORE);
    expect(run.tally.kills).toBe(1);
    expect(run.tally.pickups).toBe(1);
  });

  it("beating a warden emits fight then exactly two gear pickups", () => {
    const run = startedRun(52);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    const target = { x: run.player.x + step.dx, y: run.player.y + step.dy };
    run.enemies = [enemyAt(942, target.x, target.y, "warden")];
    const statsBefore = run.stats;
    const levelsBefore = addGear(run.banked, run.carried);
    run.move(step.dx, step.dy);
    const events = run.takeEvents();
    const fights = events.filter((event) => event.type === "fight");
    expect(fights).toHaveLength(1);
    expect(fights[0]).toMatchObject({ type: "fight", kind: "warden", x: target.x, y: target.y });
    const pickups = events.filter((event) => event.type === "pickup");
    expect(pickups).toHaveLength(2);
    for (const pickup of pickups as unknown as [{ item: ItemType; x: number; y: number }, { item: ItemType; x: number; y: number }]) {
      expect(GEAR_TYPES).toContain(pickup.item);
      expect(pickup.x).toBe(target.x);
      expect(pickup.y).toBe(target.y);
    }
    // The two drops together raise the two levels like two ordinary pickups.
    const expected = { ...levelsBefore };
    for (const pickup of pickups as unknown as [{ item: GearId }]) {
      expected[pickup.item] += 1;
    }
    expect(run.stats).toEqual(statsFromGear(expected));
    expect(run.tally.pickups).toBe(2);
  });

  it("beating a wisp emits fight and no pickup", () => {
    const run = startedRun(53);
    run.items = [];
    run.enemies = [];
    const step = openStep(run);
    run.enemies = [enemyAt(943, run.player.x + step.dx, run.player.y + step.dy, "wisp")];
    run.move(step.dx, step.dy);
    const events = run.takeEvents();
    expect(events.filter((event) => event.type === "fight")).toHaveLength(1);
    expect(events.filter((event) => event.type === "pickup")).toHaveLength(0);
  });

  it("over 30 seeds at levels 3, 6 and 10 no heavy kind sits on the opening route", () => {
    for (let seed = 100; seed < 130; seed++) {
      const run = new Run({ seed });
      run.start();
      for (let level = 1; level < 10; level++) {
        if (level >= 3) {
          const route = routeCells(run.maze, { x: run.player.x, y: run.player.y }, run.exit) ?? [];
          for (const enemy of run.enemies) {
            if (enemy.kind === "wisp") continue;
            const onRoute = route.some((cell) => cell.x === enemy.x && cell.y === enemy.y);
            expect(onRoute, `seed ${seed} level ${level}: ${enemy.kind} on the route`).toBe(false);
          }
        }
        run.energy = run.stats.storage; // survive the walk to the exit
        reachClear(run);
        run.takeEvents();
        run.nextLevel();
        run.takeEvents();
      }
    }
  });

  it("the same seed gives the same enemies", () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const a = new Run({ seed });
      a.start();
      const b = new Run({ seed });
      b.start();
      expect(a.enemies).toEqual(b.enemies);
      expect(a.items).toEqual(b.items);
    }
  });
});


// --- Tools (game/tools.ts): charges, the Anchor's freeze and the Twist's reroll ---

/** The open interior walls as "x,y,dir" keys (right = "r", down = "d"). */
function openEdges(run: Run): Set<string> {
  const open = new Set<string>();
  for (let y = 0; y < run.maze.height; y++) {
    for (let x = 0; x < run.maze.width; x++) {
      const cell = run.maze.grid[y][x];
      if (x + 1 < run.maze.width && !cell.walls[1]) open.add(`${x},${y},r`);
      if (y + 1 < run.maze.height && !cell.walls[2]) open.add(`${x},${y},d`);
    }
  }
  return open;
}

/** Everything a maze shift can change: the walls and the origin. */
function shiftSnapshot(run: Run): string {
  return JSON.stringify({ grid: run.maze.wallGrid, origin: run.maze.origin });
}

/** The first cardinal step blocked by a wall or the edge, or null when all four open. */
function blockedStep(run: Run): { dx: number; dy: number } | null {
  for (const step of STEPS) {
    if (!run.maze.canMove(run.player.x, run.player.y, step.dx, step.dy)) return step;
  }
  return null;
}

/** A run with nothing on the board and an unreachable exit: free moves, no clear. */
function freeRun(seed: number): Run {
  const run = startedRun(seed);
  run.items = [];
  run.enemies = [];
  run.exit = { x: -9, y: -9 };
  run.takeEvents();
  return run;
}

/** Check the stored forecast against what the next successful move then does. */
function expectForecastMatchesMove(run: Run): void {
  const forecast = JSON.parse(JSON.stringify(run.forecast));
  const step = openStep(run);
  const before = openEdges(run);
  const originBefore = { ...run.maze.origin };
  expect(run.move(step.dx, step.dy)).toBe(true);
  const after = openEdges(run);
  const opens = [...after].filter((key) => !before.has(key)).sort();
  const closes = [...before].filter((key) => !after.has(key)).sort();
  expect(forecast.opens.map((e: { x: number; y: number; dir: string }) => `${e.x},${e.y},${e.dir}`).sort()).toEqual(opens);
  expect(forecast.closes.map((e: { x: number; y: number; dir: string }) => `${e.x},${e.y},${e.dir}`).sort()).toEqual(closes);
  const last = forecast.walk[forecast.walk.length - 1];
  expect(run.maze.origin).toEqual(last ?? originBefore);
}

describe("Run tools: charges", () => {
  it("start carries none, pickups fill up to the cap and levels do not empty the pockets", () => {
    const run = new Run({ seed: 30 });
    expect(run.tools).toEqual({ anchor: 0, twist: 0, cut: 0 });
    expect(run.anchored).toBe(0);
    run.start();
    expect(run.tools).toEqual({ anchor: 0, twist: 0, cut: 0 });

    // Five Anchor pickups in a row: charges stop at the cap of three.
    const free = freeRun(31);
    for (let i = 0; i < 5; i++) {
      const step = openStep(free);
      free.items = [{ id: 900 + i, x: free.player.x + step.dx, y: free.player.y + step.dy, type: "anchor" }];
      const scoreBefore = free.score;
      expect(free.move(step.dx, step.dy)).toBe(true);
      expect(free.score).toBe(scoreBefore + PICKUP_SCORE); // beyond the cap it still scores
    }
    expect(free.tools.anchor).toBe(CONFIG.toolMax);
    expect(free.tools.twist).toBe(0);

    // Charges survive a level change and die only with a fresh start.
    free.exit = { x: Math.floor(free.maze.width / 2), y: 0 };
    reachClear(free);
    free.takeEvents();
    free.nextLevel();
    expect(free.tools).toEqual({ anchor: CONFIG.toolMax, twist: 0, cut: 0 });
    free.tick(999999);
    expect(free.phase).toBe("dead");
    free.start();
    expect(free.tools).toEqual({ anchor: 0, twist: 0, cut: 0 });
    expect(free.anchored).toBe(0);
  });

  it("a tool pickup emits a pickup event with its +1 text", () => {
    for (const id of ["anchor", "twist"] as const) {
      const run = freeRun(32);
      const step = openStep(run);
      run.items = [{ id: 940, x: run.player.x + step.dx, y: run.player.y + step.dy, type: id }];
      run.takeEvents();
      expect(run.move(step.dx, step.dy)).toBe(true);
      const pickups = run.takeEvents().filter((event) => event.type === "pickup");
      expect(pickups).toHaveLength(1);
      expect(pickups[0]).toMatchObject({
        type: "pickup",
        item: id,
        text: `+1 ${id === "anchor" ? "Anchor" : "Twist"}`,
        x: run.player.x,
        y: run.player.y,
      });
    }
  });

  it("a refused use costs nothing and emits nothing", () => {
    const run = freeRun(33);
    // No charge.
    expect(run.useTool("anchor")).toBe(false);
    expect(run.useTool("twist")).toBe(false);
    expect(run.takeEvents()).toEqual([]);
    expect(run.anchored).toBe(0);
    // Not playing: ready, clear and dead all refuse, and the charge stays.
    run.tools.anchor = 1;
    run.tools.twist = 1;
    const ready = new Run({ seed: 34 });
    ready.tools = { anchor: 1, twist: 1, cut: 0 };
    expect(ready.useTool("anchor")).toBe(false);
    expect(ready.useTool("twist")).toBe(false);

    run.exit = { x: Math.floor(run.maze.width / 2), y: 0 };
    reachClear(run);
    expect(run.phase).toBe("clear");
    expect(run.useTool("anchor")).toBe(false);
    expect(run.useTool("twist")).toBe(false);
    run.takeEvents();
    run.nextLevel();
    run.tick(999999);
    expect(run.phase).toBe("dead");
    expect(run.useTool("anchor")).toBe(false);
    expect(run.useTool("twist")).toBe(false);
    expect(run.takeEvents().filter((event) => event.type === "tool")).toEqual([]);
    expect(run.tools).toEqual({ anchor: 1, twist: 1, cut: 0 });
  });
});

describe("Run tools: anchor", () => {
  it("six successful moves leave every wall and the origin unchanged; the seventh shifts", () => {
    const run = freeRun(35);
    run.tools.anchor = 1;
    run.takeEvents();
    expect(run.useTool("anchor")).toBe(true);
    expect(run.tools.anchor).toBe(0);
    expect(run.anchored).toBe(CONFIG.anchorMoves);
    expect(run.takeEvents()).toEqual([{ type: "tool", id: "anchor" }]);

    // While anchored the forecast is empty: no walk, no opens, no closes.
    expect(run.forecast).toEqual({ walk: [], opens: [], closes: [] });
    const frozen = shiftSnapshot(run);
    for (let move = 1; move <= CONFIG.anchorMoves; move++) {
      const step = openStep(run);
      expect(run.move(step.dx, step.dy), `anchored move ${move}`).toBe(true);
      expect(shiftSnapshot(run), `move ${move} shifted the maze`).toBe(frozen);
      expect(run.anchored).toBe(CONFIG.anchorMoves - move);
      // Only while moves are still frozen: the sixth spends the anchor and a
      // walk for the seventh is rolled at once.
      if (run.anchored > 0) expect(run.forecast).toEqual({ walk: [], opens: [], closes: [] });
    }
    // The anchor is spent: a walk is rolled again and the next move applies it.
    expect(run.anchored).toBe(0);
    expect(run.forecast.walk.length).toBeGreaterThan(0);
    const before = shiftSnapshot(run);
    const step = openStep(run);
    expect(run.move(step.dx, step.dy)).toBe(true);
    expect(shiftSnapshot(run)).not.toBe(before);
  });

  it("a blocked move does not use up an anchored move", () => {
    const run = freeRun(36);
    run.tools.anchor = 1;
    expect(run.useTool("anchor")).toBe(true);
    const blocked = blockedStep(run);
    expect(blocked).not.toBeNull();
    for (let i = 0; i < 3; i++) {
      expect(run.move(blocked!.dx, blocked!.dy)).toBe(false);
      expect(run.anchored).toBe(CONFIG.anchorMoves);
    }
    const step = openStep(run);
    expect(run.move(step.dx, step.dy)).toBe(true);
    expect(run.anchored).toBe(CONFIG.anchorMoves - 1);
  });

  it("using Anchor while anchored, or without a charge, is refused and costs nothing", () => {
    const run = freeRun(37);
    run.tools.anchor = 2;
    run.takeEvents();
    expect(run.useTool("anchor")).toBe(true);
    run.takeEvents();
    expect(run.useTool("anchor")).toBe(false);
    expect(run.takeEvents()).toEqual([]);
    expect(run.tools.anchor).toBe(1); // the second charge is still there
    expect(run.anchored).toBe(CONFIG.anchorMoves);
  });

  it("when the anchor ends the forecast is non-empty again and matches the next move", () => {
    const run = freeRun(38);
    run.tools.anchor = 1;
    expect(run.useTool("anchor")).toBe(true);
    for (let move = 0; move < CONFIG.anchorMoves; move++) {
      const step = openStep(run);
      expect(run.move(step.dx, step.dy)).toBe(true);
    }
    expect(run.anchored).toBe(0);
    expect(run.forecast.walk.length).toBeGreaterThan(0);
    expectForecastMatchesMove(run);
  });
});

describe("Run tools: twist", () => {
  it("the new forecast matches what the next move then does, over 20 seeds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = freeRun(seed);
      run.tools.twist = 1;
      expect(run.useTool("twist"), `seed ${seed}`).toBe(true);
      expectForecastMatchesMove(run);
    }
  });

  it("over 20 seeds the rerolled walk differs from the previous one at least 15 times", () => {
    let differed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const run = freeRun(seed);
      const before = JSON.stringify(run.forecast.walk);
      run.tools.twist = 1;
      expect(run.useTool("twist"), `seed ${seed}`).toBe(true);
      if (JSON.stringify(run.forecast.walk) !== before) differed++;
    }
    expect(differed).toBeGreaterThanOrEqual(15);
  });

  it("emits a tool event, spends the charge, and is refused while anchored", () => {
    const run = freeRun(39);
    run.tools.twist = 1;
    run.takeEvents();
    expect(run.useTool("twist")).toBe(true);
    expect(run.takeEvents()).toEqual([{ type: "tool", id: "twist" }]);
    expect(run.tools.twist).toBe(0);
    expect(run.useTool("twist")).toBe(false);

    run.tools.anchor = 1;
    expect(run.useTool("anchor")).toBe(true);
    run.takeEvents();
    run.tools.twist = 1;
    expect(run.useTool("twist")).toBe(false); // refused while anchored
    expect(run.takeEvents()).toEqual([]);
    expect(run.tools.twist).toBe(1); // and the charge survived the refusal
  });
});

describe("Run tools: determinism", () => {
  it("the same seed and the same inputs, moves and tool uses alike, give the same events", () => {
    const scripted = (seed: number): string => {
      const run = new Run({ seed });
      run.start();
      run.tools = { anchor: 3, twist: 3, cut: 3 };
      const all: unknown[] = [];
      for (let i = 0; i < 40 && run.phase !== "dead"; i++) {
        if (run.phase === "clear") run.nextLevel();
        if (i % 7 === 3) run.useTool("anchor");
        if (i % 5 === 2) run.useTool("twist");
        if (i % 6 === 4) run.useTool("cut", "u");
        const step = openStep(run);
        run.tick(250);
        if (run.phase !== "playing") {
          all.push(...run.takeEvents());
          continue;
        }
        run.move(step.dx, step.dy);
        all.push(...run.takeEvents());
      }
      return JSON.stringify(all);
    };
    for (const seed of [3, 11, 42, 77, 123]) {
      expect(scripted(seed)).toBe(scripted(seed));
    }
  });
});


// --- Gear carried, banked and lost (game/gear.ts, owner decision Q10) ---

/** Place one pickup on the cell the next open step leads to and take that step. */
function pickUp(run: Run, type: ItemType): void {
  run.items = [];
  run.enemies = [];
  const step = openStep(run);
  run.items = [{ id: 980 + run.score, x: run.player.x + step.dx, y: run.player.y + step.dy, type }];
  expect(run.move(step.dx, step.dy)).toBe(true);
}

describe("Run gear: carried, banked and lost", () => {
  it("stats are always statsFromGear of banked plus carried", () => {
    const run = new Run({ seed: 60, gear: { ...noGear(), gloves: 4, boots: 10 } });
    run.start();
    run.takeEvents();
    expect(run.stats).toEqual(statsFromGear(addGear(run.banked, run.carried)));
    pickUp(run, "gloves");
    expect(run.stats).toEqual(statsFromGear(addGear(run.banked, run.carried)));
    expect(run.stats.attack).toBeCloseTo(1.5, 10); // (4 banked + 1 carried) * 0.1
  });

  it("carried gear dies with the run: attack is 1 again after start, and dead carries lost 1", () => {
    const run = startedRun(61);
    pickUp(run, "gloves");
    expect(run.carried.gloves).toBe(1);
    expect(run.stats.attack).toBeCloseTo(1.1, 10);
    run.takeEvents();
    run.tick(999999);
    const dead = eventsOf(run, "dead");
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ type: "dead", cause: "time", lost: 1 });
    expect(run.carried).toEqual(noGear());
    run.start();
    expect(run.stats.attack).toBe(1);
    expect(run.banked).toEqual(noGear());
  });

  it("the exit banks the carried gear, emits banked, and it survives death and restart", () => {
    const run = startedRun(62);
    pickUp(run, "gloves");
    run.takeEvents();
    reachClear(run);
    expect(run.banked.gloves).toBe(1);
    expect(run.carried).toEqual(noGear());
    expect(eventsOf(run, "banked")).toEqual([{ type: "banked", count: 1 }]);

    // A later death cannot take what the exit already kept.
    run.nextLevel();
    run.takeEvents();
    run.tick(999999);
    expect(run.phase).toBe("dead");
    expect(eventsOf(run, "dead")[0]).toMatchObject({ lost: 0 });
    run.start();
    expect(run.stats.attack).toBeCloseTo(1.1, 10);
    expect(run.banked.gloves).toBe(1);
  });

  it("an exit with nothing carried banks nothing and emits no banked event", () => {
    const run = startedRun(63);
    reachClear(run);
    expect(run.banked).toEqual(noGear());
    expect(eventsOf(run, "banked")).toEqual([]);
  });

  it("a pickup at the cap gives +10 energy and changes no level", () => {
    const run = new Run({ seed: 64, gear: { ...noGear(), gloves: gearCap("gloves") } });
    run.start();
    run.takeEvents();
    const energyBefore = run.energy;
    pickUp(run, "gloves");
    expect(run.banked.gloves).toBe(gearCap("gloves"));
    expect(run.carried.gloves).toBe(0);
    expect(run.stats.attack).toBe(3); // at the limit, unchanged
    expect(run.energy).toBe(Math.min(run.stats.storage, energyBefore - 1 + 10));
    const pickups = eventsOf(run, "pickup");
    expect(pickups).toHaveLength(1);
    expect((pickups[0] as unknown as { text: string }).text).toContain("maxed");
    expect((pickups[0] as unknown as { text: string }).text).toContain("+10 Energy");
  });

  it("banked plus carried together hit the cap", () => {
    const run = new Run({ seed: 65, gear: { ...noGear(), backpack: gearCap("backpack") - 1 } });
    run.start();
    run.takeEvents();
    pickUp(run, "backpack"); // the last level: storage reaches 200
    expect(run.carried.backpack).toBe(1);
    expect(run.stats.storage).toBe(200);
    const energyBefore = run.energy;
    pickUp(run, "backpack"); // one past the cap: energy instead
    expect(run.carried.backpack).toBe(1);
    expect(run.energy).toBe(Math.min(run.stats.storage, energyBefore - 1 + 10));
  });

  it("start keeps the bank and drops anything left carried", () => {
    const run = startedRun(66);
    run.banked.shield = 3;
    run.carried.boots = 2;
    run.abandon(); // quitting is not an exit: carried goes with the run, the bank stays
    run.start();
    expect(run.banked.shield).toBe(3);
    expect(run.carried).toEqual(noGear());
    expect(run.stats.defense).toBeCloseTo(1.3, 10);
    expect(run.stats.consumption).toBe(1);
  });

  it("abandoning a run leaves the carried gear behind too", () => {
    const run = startedRun(67);
    pickUp(run, "speed");
    expect(run.carried.speed).toBe(1);
    run.abandon();
    expect(run.carried).toEqual(noGear());
    run.start();
    expect(run.stats.speed).toBe(1);
  });

  it("a banked backpack raises the starting energy with its storage", () => {
    const run = new Run({ seed: 68, gear: { ...noGear(), backpack: 8 } });
    expect(run.energy).toBe(140); // max(100, 100 + 5 * 8)
    run.tick(999999);
    run.start();
    expect(run.energy).toBe(140);
  });
});
