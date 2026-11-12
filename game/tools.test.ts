// The two tools (game/tools.ts): the ids and info the UI reads, the plan's
// tool count, the spawner's tool pickups, the config numbers and the two SVG
// icons on disk. No DOM, no clocks, no global randomness.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_IDS, TOOL_INFO, isToolType, type ToolId } from "@/game/tools";
import { CONFIG } from "@/game/config";
import { levelPlan } from "@/game/plan";
import { spawnLevel } from "@/game/spawn";
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
  it("lists the two tool ids with a name and a hint each", () => {
    expect([...TOOL_IDS]).toEqual(["anchor", "twist"]);
    for (const id of TOOL_IDS) {
      expect(TOOL_INFO[id].name.length).toBeGreaterThan(0);
      expect(TOOL_INFO[id].hint.length).toBeGreaterThan(0);
    }
    expect(TOOL_INFO.anchor.name).toBe("Anchor");
    expect(TOOL_INFO.twist.name).toBe("Twist");
  });

  it("isToolType tells tools from gear", () => {
    expect(isToolType("anchor")).toBe(true);
    expect(isToolType("twist")).toBe(true);
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
  it("places exactly the asked number of tool pickups, of the two types", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const spawned = spawnLevel(createRng(seed), 9, { items: 4, enemies: 2, tools: 1 });
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
