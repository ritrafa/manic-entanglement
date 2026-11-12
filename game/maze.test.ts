import { describe, expect, it } from "vitest";
import { Maze, DIR_DELTAS, type Dir } from "@/game/maze";
import { createRng } from "@/game/rng";

const SIZES = [3, 5, 9, 13];

function openInteriorWallCount(maze: Maze): number {
  let count = 0;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      const cell = maze.grid[y][x];
      if (x < maze.width - 1 && !cell.walls[1]) count++;
      if (y < maze.height - 1 && !cell.walls[2]) count++;
    }
  }
  return count;
}

function isFullyConnected(maze: Maze): boolean {
  const start = { x: maze.origin.x, y: maze.origin.y };
  const seen = Array.from({ length: maze.height }, () => Array<boolean>(maze.width).fill(false));
  const stack = [start];
  seen[start.y][start.x] = true;
  let visited = 1;
  const steps = [
    { dx: 0, dy: -1, wall: 0 },
    { dx: 1, dy: 0, wall: 1 },
    { dx: 0, dy: 1, wall: 2 },
    { dx: -1, dy: 0, wall: 3 },
  ];
  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    for (const { dx, dy, wall } of steps) {
      if (maze.grid[y][x].walls[wall]) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= maze.width || ny < 0 || ny >= maze.height) continue;
      if (seen[ny][nx]) continue;
      seen[ny][nx] = true;
      visited++;
      stack.push({ x: nx, y: ny });
    }
  }
  return visited === maze.width * maze.height;
}

function checkInvariants(maze: Maze, where: string) {
  // Exactly one open interior wall per cell minus the root: a spanning tree.
  expect(maze.width * maze.height - 1, where).toBe(openInteriorWallCount(maze));

  // Every cell reaches every other (connectivity from the origin covers all cells).
  expect(isFullyConnected(maze), `${where}: fully connected`).toBe(true);

  // Each wall agrees from both sides.
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (x + 1 < maze.width) {
        expect(maze.grid[y][x].walls[1], `${where}: right/left agree at ${x},${y}`).toBe(
          maze.grid[y][x + 1].walls[3],
        );
      }
      if (y + 1 < maze.height) {
        expect(maze.grid[y][x].walls[2], `${where}: bottom/top agree at ${x},${y}`).toBe(
          maze.grid[y + 1][x].walls[0],
        );
      }
    }
  }

  // All outer walls are closed.
  for (let x = 0; x < maze.width; x++) {
    expect(maze.grid[0][x].walls[0], `${where}: top wall closed`).toBe(true);
    expect(maze.grid[maze.height - 1][x].walls[2], `${where}: bottom wall closed`).toBe(true);
  }
  for (let y = 0; y < maze.height; y++) {
    expect(maze.grid[y][0].walls[3], `${where}: left wall closed`).toBe(true);
    expect(maze.grid[y][maze.width - 1].walls[1], `${where}: right wall closed`).toBe(true);
  }

  // The origin is in bounds.
  expect(Number.isInteger(maze.origin.x)).toBe(true);
  expect(Number.isInteger(maze.origin.y)).toBe(true);
  expect(maze.origin.x).toBeGreaterThanOrEqual(0);
  expect(maze.origin.x).toBeLessThan(maze.width);
  expect(maze.origin.y).toBeGreaterThanOrEqual(0);
  expect(maze.origin.y).toBeLessThan(maze.height);
}

describe("Maze invariants", () => {
  for (const size of SIZES) {
    it(`holds for a ${size}x${size} maze right after construction and after 500 shifts`, () => {
      const rng = createRng(1000 + size);
      const maze = new Maze(size, size, rng);
      checkInvariants(maze, `${size}x${size} at construction`);
      for (let i = 0; i < 500; i++) {
        maze.shift(rng);
        checkInvariants(maze, `${size}x${size} after shift ${i}`);
      }
    });
  }
});

describe("Maze shift", () => {
  it("returns two cells exactly one step apart, with the wall between them open afterwards", () => {
    const rng = createRng(777);
    const maze = new Maze(9, 9, rng);
    for (let i = 0; i < 200; i++) {
      const { from, to } = maze.shift(rng);
      const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
      expect(distance).toBe(1);
      expect(to).toEqual({ x: maze.origin.x, y: maze.origin.y });

      // The wall between the old and new origin is open.
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const wallIndex = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
      expect(maze.grid[from.y][from.x].walls[wallIndex]).toBe(false);
    }
  });
});

describe("Maze determinism", () => {
  it("two mazes from the same seed have identical wallGrids after the same number of shifts", () => {
    const a = new Maze(9, 9, createRng(2024));
    const b = new Maze(9, 9, createRng(2024));
    const rngA = createRng(9);
    const rngB = createRng(9);
    for (let i = 0; i < 100; i++) {
      a.shift(rngA);
      b.shift(rngB);
    }
    expect(b.wallGrid).toEqual(a.wallGrid);
  });

  it("different seeds give different wallGrids", () => {
    const a = new Maze(13, 13, createRng(1));
    const b = new Maze(13, 13, createRng(2));
    expect(b.wallGrid).not.toEqual(a.wallGrid);
  });
});

describe("Maze canMove", () => {
  it("is false out of bounds in every direction", () => {
    const maze = new Maze(5, 5, createRng(5));
    expect(maze.canMove(0, 0, 0, -1)).toBe(false); // off the top
    expect(maze.canMove(4, 0, 1, 0)).toBe(false); // off the right
    expect(maze.canMove(4, 4, 0, 1)).toBe(false); // off the bottom
    expect(maze.canMove(0, 4, -1, 0)).toBe(false); // off the left
    expect(maze.canMove(-1, 2, 1, 0)).toBe(false); // start out of bounds
    expect(maze.canMove(2, 5, 0, -1)).toBe(false); // start out of bounds
  });

  it("matches the walls array for every cell and direction", () => {
    const maze = new Maze(5, 5, createRng(6));
    const steps = [
      { dx: 0, dy: -1, wall: 0 },
      { dx: 1, dy: 0, wall: 1 },
      { dx: 0, dy: 1, wall: 2 },
      { dx: -1, dy: 0, wall: 3 },
    ];
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        for (const { dx, dy, wall } of steps) {
          const nx = x + dx;
          const ny = y + dy;
          const inBounds = nx >= 0 && nx < maze.width && ny >= 0 && ny < maze.height;
          expect(maze.canMove(x, y, dx, dy), `canMove at ${x},${y} dir ${dx},${dy}`).toBe(
            inBounds && !maze.grid[y][x].walls[wall],
          );
        }
      }
    }
  });

  it("is false for non-cardinal steps", () => {
    const maze = new Maze(5, 5, createRng(7));
    expect(maze.canMove(2, 2, 1, 1)).toBe(false);
    expect(maze.canMove(2, 2, 0, 0)).toBe(false);
    expect(maze.canMove(2, 2, 2, 0)).toBe(false);
  });
});

describe("Maze wallGrid", () => {
  it("has 2 * height + 1 rows of 2 * width + 1 four-character 0/1 codes", () => {
    for (const size of SIZES) {
      const maze = new Maze(size, size, createRng(size * 31));
      expect(maze.wallGrid.length).toBe(2 * size + 1);
      for (const row of maze.wallGrid) {
        expect(row.length).toBe(2 * size + 1);
        for (const code of row) {
          expect(code).toMatch(/^[01]{4}$/);
        }
      }
    }
  });

  it("stays well-formed after shifts", () => {
    const rng = createRng(123);
    const maze = new Maze(5, 5, rng);
    for (let i = 0; i < 100; i++) maze.shift(rng);
    expect(maze.wallGrid.length).toBe(11);
    for (const row of maze.wallGrid) {
      expect(row.length).toBe(11);
      for (const code of row) expect(code).toMatch(/^[01]{4}$/);
    }
  });
});

describe("Maze step and validDirs", () => {
  it("validDirs lists exactly the in-bounds directions at any cell", () => {
    const rng = createRng(77);
    const maze = new Maze(5, 5, rng);
    expect(maze.validDirs({ x: 0, y: 0 }).sort()).toEqual(["d", "r"]);
    expect(maze.validDirs({ x: 4, y: 4 }).sort()).toEqual(["l", "u"]);
    expect(maze.validDirs({ x: 2, y: 2 }).sort()).toEqual(["d", "l", "r", "u"]);
    // Defaults to the origin.
    expect(maze.validDirs()).toEqual(maze.validDirs(maze.origin));
  });

  it("step moves the origin by the direction's delta and returns from and to", () => {
    const rng = createRng(78);
    const maze = new Maze(5, 5, rng);
    for (const dir of ["u", "r", "d", "l"] as Dir[]) {
      const from = { x: maze.origin.x, y: maze.origin.y };
      const { from: reportedFrom, to } = maze.step(dir);
      expect(reportedFrom).toEqual(from);
      expect(to).toEqual({ x: from.x + DIR_DELTAS[dir].x, y: from.y + DIR_DELTAS[dir].y });
      expect(maze.origin).toEqual(to);
    }
  });

  it("an out-of-bounds step changes nothing", () => {
    const rng = createRng(79);
    const maze = new Maze(5, 5, rng);
    // Walk the origin into a corner first.
    while (maze.origin.x > 0) maze.step("l");
    while (maze.origin.y > 0) maze.step("u");
    expect(maze.origin).toEqual({ x: 0, y: 0 });
    const grid = maze.wallGrid.map((row) => row.slice());
    const walls = maze.grid.map((row) => row.map((cell) => cell.walls.slice()));
    const { from, to } = maze.step("u");
    expect(from).toEqual(to);
    expect(maze.origin).toEqual({ x: 0, y: 0 });
    expect(maze.wallGrid).toEqual(grid);
    expect(maze.grid.map((row) => row.map((cell) => cell.walls))).toEqual(walls);
  });

  it("step equals shift with the same direction, and shift picks a valid direction", () => {
    const rngA = createRng(80);
    const rngB = createRng(80);
    const a = new Maze(9, 9, rngA);
    const b = new Maze(9, 9, rngB);
    const picker = createRng(8080);
    for (let i = 0; i < 60; i++) {
      const dirs = a.validDirs();
      expect(b.validDirs()).toEqual(dirs);
      const dir = dirs[picker.clone().int(dirs.length)];
      a.step(dir);
      // shift on b draws from the same picker state, so it must pick the same dir.
      const { from, to } = b.shift(picker);
      expect(to).toEqual({ x: from.x + DIR_DELTAS[dir].x, y: from.y + DIR_DELTAS[dir].y });
      expect(b.origin).toEqual(a.origin);
    }
    // Same seed, same picks: the two mazes agree.
    expect(b.wallGrid).toEqual(a.wallGrid);
  });

});

describe("Maze clone", () => {
  it("is independent: stepping the clone leaves the original untouched", () => {
    const rng = createRng(81);
    const maze = new Maze(9, 9, rng);
    const origin = { ...maze.origin };
    const grid = maze.wallGrid.map((row) => row.slice());
    const walls = maze.grid.map((row) => row.map((cell) => cell.walls.slice()));

    const copy = maze.clone();
    for (let i = 0; i < 100; i++) copy.step(copy.validDirs()[i % copy.validDirs().length]);

    expect(maze.origin).toEqual(origin);
    expect(maze.wallGrid).toEqual(grid);
    expect(maze.grid.map((row) => row.map((cell) => cell.walls))).toEqual(walls);

    // The clone itself is well formed and moved.
    expect(copy.width).toBe(9);
    expect(copy.height).toBe(9);
    expect(copy.wallGrid).toEqual(copyWallGridOf(copy));
  });

  it("clones of the same maze agree until they are stepped apart", () => {
    const rng = createRng(82);
    const maze = new Maze(7, 7, rng);
    const a = maze.clone();
    const b = maze.clone();
    expect(a.wallGrid).toEqual(maze.wallGrid);
    expect(b.wallGrid).toEqual(maze.wallGrid);
    a.step("r");
    expect(a.wallGrid).not.toEqual(b.wallGrid);
    expect(b.wallGrid).toEqual(maze.wallGrid);
  });
});

/** Recompute the wall grid of a maze from its cell walls, the way updateWallGrid does. */
function copyWallGridOf(maze: Maze): string[][] {
  const fresh = maze.clone();
  fresh.updateWallGrid();
  return fresh.wallGrid;
}

// --- reroot(x, y): re-root the pointer tree without touching a single wall ---

/** The wall state of every cell, as one comparable string. */
function wallsOf(maze: Maze): string {
  return JSON.stringify(maze.grid.map((row) => row.map((cell) => cell.walls)));
}

/** The whole maze state: walls, pointers, wall grid and origin. */
function fullSnapshot(maze: Maze): string {
  return JSON.stringify({
    grid: maze.grid.map((row) => row.map((cell) => [cell.walls, cell.direction])),
    wallGrid: maze.wallGrid,
    origin: maze.origin,
  });
}

/** True when following the pointers from every cell leads to the origin. */
function pointersLeadToOrigin(maze: Maze): boolean {
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      let cur = { x, y };
      const seen = new Set<string>();
      while (!(cur.x === maze.origin.x && cur.y === maze.origin.y)) {
        const key = `${cur.x},${cur.y}`;
        if (seen.has(key)) return false; // a pointer loop
        seen.add(key);
        const dir = maze.grid[cur.y][cur.x].direction;
        if (dir === null) return false; // a second cell without a pointer
        cur = { x: cur.x + dir.x, y: cur.y + dir.y };
        if (cur.x < 0 || cur.x >= maze.width || cur.y < 0 || cur.y >= maze.height) return false;
      }
    }
  }
  return true;
}

describe("Maze reroot", () => {
  for (const size of [3, 5, 9]) {
    it(`re-roots at every cell of a ${size}x${size} maze over 20 seeds, wall for wall`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const maze = new Maze(size, size, createRng(seed));
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const before = wallsOf(maze);
            expect(maze.reroot(x, y), `seed ${seed}: reroot at ${x},${y}`).toBe(true);
            expect(wallsOf(maze), `seed ${seed}: walls unchanged after reroot at ${x},${y}`).toBe(before);
            expect(maze.origin, `seed ${seed}: origin moved to ${x},${y}`).toEqual({ x, y });
            expect(pointersLeadToOrigin(maze), `seed ${seed}: pointers reach ${x},${y}`).toBe(true);
            checkInvariants(maze, `seed ${seed}: reroot at ${x},${y}`);
          }
        }
      }
    });
  }

  it("re-rooting at the current origin changes nothing", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const maze = new Maze(5, 5, createRng(seed));
      const before = fullSnapshot(maze);
      expect(maze.reroot(maze.origin.x, maze.origin.y)).toBe(true);
      expect(fullSnapshot(maze)).toBe(before);
    }
  });

  it("refuses cells outside the board and leaves everything as it was", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const maze = new Maze(5, 5, createRng(seed));
      const before = fullSnapshot(maze);
      for (const [x, y] of [[-1, 2], [5, 0], [0, 5], [2, -3], [1.5, 2], [Number.NaN, 0]]) {
        expect(maze.reroot(x, y), `reroot at ${x},${y}`).toBe(false);
      }
      expect(fullSnapshot(maze)).toBe(before);
    }
  });

  it("200 further shifts after a reroot keep every maze invariant", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const maze = new Maze(9, 9, createRng(seed));
      const rng = createRng(seed + 500);
      expect(maze.reroot((seed * 7) % 9, (seed * 5) % 9), `seed ${seed}: reroot`).toBe(true);
      for (let shift = 0; shift < 200; shift++) {
        maze.shift(rng);
        checkInvariants(maze, `seed ${seed}: shift ${shift} after reroot`);
      }
      expect(pointersLeadToOrigin(maze), `seed ${seed}: pointers reach the origin`).toBe(true);
    }
  });
});
