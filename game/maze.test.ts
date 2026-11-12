import { describe, expect, it } from "vitest";
import { Maze } from "@/game/maze";
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
