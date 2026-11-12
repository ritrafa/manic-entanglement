// The two tools (game/tools.ts): the ids and info the UI reads, the plan's
// tool count, the spawner's tool pickups, the config numbers and the two SVG
// icons on disk. No DOM, no clocks, no global randomness.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_IDS, TOOL_INFO, isToolType, toolsFor, type ToolId } from "@/game/tools";
import { CONFIG } from "@/game/config";
import { levelPlan } from "@/game/plan";
import { spawnLevel } from "@/game/spawn";
import type { Dir } from "@/game/maze";
import { createRng } from "@/game/rng";
import { Run } from "@/game/run";

/** The tool pickups among spawned or carried items. */
function toolPickups(items: { type: string }[]): string[] {
  return items.filter((item) => isToolType(item.type)).map((item) => item.type);
}

/** Stand the player below the exit, open the wall and step in, reaching "clear". */
function reachClear(run: Run): void {
  run.items = [];
  run.enemies = [];
  run.player.x = run.exit.x;
  run.player.y = run.exit.y + 1;
  run.maze.grid[run.player.y][run.player.x].walls[0] = false;
  run.move(0, -1);
}

describe("tools data", () => {
  it("lists the three tool ids with a name and a hint each", () => {
    expect([...TOOL_IDS]).toEqual(["anchor", "twist", "cut"]);
    for (const id of TOOL_IDS) {
      expect(TOOL_INFO[id].name.length).toBeGreaterThan(0);
      expect(TOOL_INFO[id].hint.length).toBeGreaterThan(0);
    }
    expect(TOOL_INFO.anchor.name).toBe("Anchor");
    expect(TOOL_INFO.twist.name).toBe("Twist");
    expect(TOOL_INFO.cut.name).toBe("Cut");
  });

  it("isToolType tells tools from gear", () => {
    expect(isToolType("anchor")).toBe(true);
    expect(isToolType("twist")).toBe(true);
    expect(isToolType("cut")).toBe(true);
    expect(isToolType("energy")).toBe(false);
    expect(isToolType("backpack")).toBe(false);
    expect(isToolType("")).toBe(false);
  });

  it("the config carries the six anchored moves and the three-charge cap", () => {
    expect(CONFIG.anchorMoves).toBe(6);
    expect(CONFIG.toolMax).toBe(3);
  });
});

describe("levelPlan tools", () => {
  it("depth 1 and every even depth carry one, odd depths none", () => {
    expect(levelPlan(1).tools).toBe(1);
    for (let depth = 2; depth <= 40; depth++) {
      const expected = depth % 2 === 0 ? 1 : 0;
      expect(levelPlan(depth).tools, `depth ${depth}`).toBe(expected);
    }
  });

  it("depths below 1 read as depth 1", () => {
    expect(levelPlan(0).tools).toBe(1);
    expect(levelPlan(-3).tools).toBe(1);
  });
});

describe("spawnLevel tools", () => {
  it("places exactly the asked number of tool pickups, of the types that depth allows", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const spawned = spawnLevel(createRng(seed), 9, { items: 4, enemies: 2, tools: 1 }, 1 / 6, { depth: 4 });
      const tools = spawned.items.filter((item) => isToolType(item.type));
      expect(tools, `seed ${seed}`).toHaveLength(1);
      seen.add(tools[0].type as string);
    }
    expect(seen).toEqual(new Set<string>(TOOL_IDS));
  });

  it("no tools asked gives none, and the gear layout is untouched", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const plain = spawnLevel(createRng(seed), 7, { items: 5, enemies: 3 });
      const zero = spawnLevel(createRng(seed), 7, { items: 5, enemies: 3, tools: 0 });
      expect(zero).toEqual(plain);
      expect(plain.items.every((item) => !isToolType(item.type))).toBe(true);
    }
  });

  it("tool pickups keep off the start and the exit and never share a cell", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const spawned = spawnLevel(createRng(seed), 5, { items: 5, enemies: 4, tools: 3 });
      const cells = [
        ...spawned.items.map((item) => `${item.x},${item.y}`),
        ...spawned.enemies.map((enemy) => `${enemy.x},${enemy.y}`),
      ];
      expect(new Set(cells).size).toBe(cells.length);
      for (const item of spawned.items) {
        expect(item.x === 2 && item.y === 4, `start cell at seed ${seed}`).toBe(false);
        expect(item.x === 2 && item.y === 0, `exit cell at seed ${seed}`).toBe(false);
      }
    }
  });

  it("asks beyond the free cells still terminate", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const spawned = spawnLevel(createRng(seed), 3, { items: 5, enemies: 5, tools: 5 });
      expect(spawned.items.length).toBeLessThanOrEqual(7);
    }
  });
});

describe("Run tool pickups", () => {
  it("depth 1 and depth 2 levels hold exactly one tool pickup, depth 3 none, over 20 seeds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = new Run({ seed });
      run.start();
      expect(toolPickups(run.items), `seed ${seed} depth 1`).toHaveLength(1);
      run.energy = run.stats.storage;
      reachClear(run);
      run.takeEvents();
      run.nextLevel();
      expect(toolPickups(run.items), `seed ${seed} depth 2`).toHaveLength(1);
      run.energy = run.stats.storage;
      reachClear(run);
      run.takeEvents();
      run.nextLevel();
      expect(toolPickups(run.items), `seed ${seed} depth 3`).toHaveLength(0);
    }
  });
});

describe("tool icons", () => {
  it("both SVGs exist, are svg and carry no script", () => {
    for (const id of TOOL_IDS as readonly ToolId[]) {
      const path = join(process.cwd(), "public", "images", "tools", `${id}.svg`);
      expect(existsSync(path), `${id}.svg on disk`).toBe(true);
      const svg = readFileSync(path, "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("viewBox=\"0 0 24 24\"");
      expect(svg).not.toContain("<script");
      // No external references: nothing fetched, nothing embedded from outside.
      expect(svg).not.toMatch(/href=/);
      expect(svg).not.toMatch(/xlink/);
    }
  });
});

describe("toolsFor", () => {
  it("keeps Cut out of the early depths and lets it in from depth 3", () => {
    for (const depth of [0, -2, 1, 2]) {
      expect(toolsFor(depth), `depth ${depth}`).toEqual(["anchor", "twist"]);
    }
    for (const depth of [3, 4, 9, 40]) {
      expect(toolsFor(depth), `depth ${depth}`).toEqual(["anchor", "twist", "cut"]);
    }
    expect(TOOL_INFO.cut.minDepth).toBe(3);
    expect(TOOL_INFO.anchor.minDepth).toBe(1);
    expect(TOOL_INFO.twist.minDepth).toBe(1);
  });
});

describe("spawnLevel cut pickups", () => {
  /** Tool pickups asked for three slots at the given depth. */
  function toolsAt(seed: number, depth: number): string[] {
    const spawned = spawnLevel(createRng(seed), 9, { items: 0, enemies: 0, tools: 3 }, 1 / 6, { depth });
    return toolPickups(spawned.items);
  }

  it("never spawns a Cut at depth 1 or 2, over 50 seeds", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const depth of [1, 2]) {
        expect(toolsAt(seed, depth).includes("cut"), `seed ${seed} depth ${depth}`).toBe(false);
      }
    }
  });

  it("spawns a Cut by depth 4 over 50 seeds", () => {
    let appeared = 0;
    for (let seed = 1; seed <= 50; seed++) {
      if (toolsAt(seed, 4).includes("cut")) appeared++;
    }
    expect(appeared).toBeGreaterThan(0);
  });
});

// --- The Cut tool (game/run.ts): calling the Knot through a wall ---

const STEPS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

/** The maze direction of a single cardinal step. */
function dirOfStep(step: { dx: number; dy: number }): Dir {
  if (step.dy === -1) return "u";
  if (step.dx === 1) return "r";
  if (step.dy === 1) return "d";
  return "l";
}

/** The first cardinal step open from the player's cell. */
function openStep(run: Run): { dx: number; dy: number } {
  for (const step of STEPS) {
    if (run.maze.canMove(run.player.x, run.player.y, step.dx, step.dy)) return step;
  }
  throw new Error("no open step from the player cell");
}

/** Stand the player on the first cell with a wall-blocked cardinal step and return it. */
function standBeforeAWall(run: Run): { dx: number; dy: number } {
  for (let y = 0; y < run.maze.height; y++) {
    for (let x = 0; x < run.maze.width; x++) {
      for (const step of STEPS) {
        const nx = x + step.dx;
        const ny = y + step.dy;
        if (nx < 0 || nx >= run.maze.width || ny < 0 || ny >= run.maze.height) continue;
        if (!run.maze.canMove(x, y, step.dx, step.dy)) {
          run.player.x = x;
          run.player.y = y;
          return step;
        }
      }
    }
  }
  throw new Error("no blocked interior step on the board");
}

/** A run with nothing on the board and an unreachable exit: free moves, no clear. */
function freeRun(seed: number): Run {
  const run = new Run({ seed });
  run.start();
  run.items = [];
  run.enemies = [];
  run.exit = { x: -9, y: -9 };
  run.takeEvents();
  return run;
}

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

/** The key openEdges uses for the wall between (x, y) and its neighbour (dx, dy). */
function edgeKey(x: number, y: number, dx: number, dy: number): string {
  return dx === 1 ? `${x},${y},r` : dx === -1 ? `${x - 1},${y},r` : dy === 1 ? `${x},${y},d` : `${x},${y - 1},d`;
}

/** Everything a maze shift can change: the walls and the origin. */
function shiftSnapshot(run: Run): string {
  return JSON.stringify({ grid: run.maze.wallGrid, origin: run.maze.origin });
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

describe("Run tools: cut", () => {
  it("opens the wall through the Knot: one opens, one closes, the origin is the neighbour", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = freeRun(seed);
      const blocked = standBeforeAWall(run);
      const dir = dirOfStep(blocked);
      const playerBefore = { x: run.player.x, y: run.player.y };
      run.tools.cut = 1;
      const before = openEdges(run);
      const energyBefore = run.energy;
      const scoreBefore = run.score;
      run.takeEvents();
      expect(run.useTool("cut", dir), `seed ${seed}`).toBe(true);
      expect(run.takeEvents()).toEqual([{ type: "tool", id: "cut", dx: blocked.dx, dy: blocked.dy }]);
      expect(run.tools.cut).toBe(0);
      // The wall in front of the player is open and the next move goes through it.
      expect(run.maze.canMove(playerBefore.x, playerBefore.y, blocked.dx, blocked.dy)).toBe(true);
      const after = openEdges(run);
      const opens = [...after].filter((key) => !before.has(key));
      const closes = [...before].filter((key) => !after.has(key));
      expect(opens, `seed ${seed}: exactly one wall opened`).toEqual([edgeKey(playerBefore.x, playerBefore.y, blocked.dx, blocked.dy)]);
      expect(closes, `seed ${seed}: exactly one wall closed`).toHaveLength(1);
      expect(after.size, `seed ${seed}: the open count is unchanged`).toBe(before.size);
      // The Knot stepped to the neighbour; the player did not move and spent nothing.
      expect(run.maze.origin).toEqual({ x: playerBefore.x + blocked.dx, y: playerBefore.y + blocked.dy });
      expect(run.player.x).toBe(playerBefore.x);
      expect(run.player.y).toBe(playerBefore.y);
      expect(run.energy).toBe(energyBefore);
      expect(run.score).toBe(scoreBefore);
      expect(run.tally.moves).toBe(0);
    }
  });

  it("the next move can go through the new opening", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = freeRun(seed);
      const blocked = standBeforeAWall(run);
      run.tools.cut = 1;
      expect(run.useTool("cut", dirOfStep(blocked)), `seed ${seed}`).toBe(true);
      expect(run.move(blocked.dx, blocked.dy), `seed ${seed}: move through the cut`).toBe(true);
    }
  });

  it("the forecast after a Cut matches what the next move does", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = freeRun(seed);
      const blocked = standBeforeAWall(run);
      run.tools.cut = 1;
      expect(run.useTool("cut", dirOfStep(blocked)), `seed ${seed}`).toBe(true);
      expectForecastMatchesMove(run);
    }
  });

  it("a refused Cut costs nothing and changes no wall", () => {
    const run = freeRun(70);
    run.tools.cut = 1;
    const before = shiftSnapshot(run);
    const refused: Array<[ToolId, Dir | undefined]> = [
      ["cut", undefined], // no direction
      ["cut", dirOfStep(openStep(run))], // through an already open wall
    ];
    // Toward the edge: stand the player in a corner and step out.
    run.player.x = 0;
    run.player.y = 0;
    refused.push(["cut", "l"], ["cut", "u"]);
    for (const [id, dir] of refused) {
      run.takeEvents();
      expect(run.useTool(id, dir)).toBe(false);
      expect(run.takeEvents()).toEqual([]);
      expect(run.tools.cut).toBe(1);
      expect(shiftSnapshot(run)).toBe(before);
    }
    // While anchored.
    run.tools.anchor = 1;
    expect(run.useTool("anchor")).toBe(true);
    run.takeEvents();
    const blocked = standBeforeAWall(run);
    expect(run.useTool("cut", dirOfStep(blocked))).toBe(false);
    expect(run.takeEvents()).toEqual([]);
    expect(run.tools.cut).toBe(1);
    expect(shiftSnapshot(run)).toBe(before);
    // Without a charge.
    run.anchored = 0;
    run.tools.cut = 0;
    expect(run.useTool("cut", dirOfStep(blocked))).toBe(false);
    expect(run.takeEvents()).toEqual([]);
    expect(shiftSnapshot(run)).toBe(before);
    // Not playing.
    run.tools.cut = 1;
    const ready = new Run({ seed: 71 });
    ready.tools = { anchor: 0, twist: 0, cut: 1 };
    expect(ready.useTool("cut", "u")).toBe(false);
    expect(ready.tools.cut).toBe(1);
  });

  it("the same seed and the same Cut inputs give the same events", () => {
    const scripted = (seed: number): string => {
      const run = new Run({ seed });
      run.start();
      run.items = [];
      run.enemies = [];
      run.exit = { x: -9, y: -9 };
      run.tools = { anchor: 0, twist: 0, cut: 3 };
      const all: unknown[] = [];
      for (let i = 0; i < 30 && run.phase !== "dead"; i++) {
        if (i % 3 === 1) run.useTool("cut", dirOfStep(standBeforeAWall(run)));
        const step = openStep(run);
        run.tick(200);
        run.move(step.dx, step.dy);
        all.push(...run.takeEvents());
      }
      return JSON.stringify(all);
    };
    for (const seed of [5, 17, 60, 91]) {
      expect(scripted(seed)).toBe(scripted(seed));
    }
  });
});
