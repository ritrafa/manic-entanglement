import { describe, expect, it } from "vitest";
import { Maze } from "@/game/maze";
import { createRng } from "@/game/rng";
import { forecastOf, rollWalk } from "@/game/forecast";
import { entityPx, gridAfterForecast, markTiles, tileCodeAt, tileDiff } from "@/game/view";

function copyGrid(grid: string[][]): string[][] {
    return grid.map((row) => row.slice());
}

function applyDiff(grid: string[][], diff: { x: number; y: number; code: string }[]): void {
    for (const change of diff) grid[change.y][change.x] = change.code;
}

describe("tileDiff", () => {
    it("returns every tile when there is no previous grid", () => {
        const grid = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => "0000"));
        const diff = tileDiff(null, grid);
        expect(diff).toHaveLength(7 * 7);
        expect(diff.every((t) => t.code === "0000")).toBe(true);
    });

    it("is empty when the two grids are equal", () => {
        const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => "0101"));
        expect(tileDiff(grid, grid)).toEqual([]);
        expect(tileDiff(copyGrid(grid), grid)).toEqual([]);
    });

    it("reports only the tiles whose code differs", () => {
        const prev = [
            ["0000", "0001", "0010"],
            ["0100", "0101", "0110"],
        ];
        const next = copyGrid(prev);
        next[1][2] = "1111";
        expect(tileDiff(prev, next)).toEqual([{ x: 2, y: 1, code: "1111" }]);
    });

    it("returns the full list when the dimensions differ", () => {
        const prev = [["0000", "0000"]];
        const next = [
            ["0000", "0000"],
            ["0000", "0000"],
        ];
        expect(tileDiff(prev, next)).toHaveLength(4);
        const empty: string[][] = [];
        expect(tileDiff(empty, [["1111", "1111", "1111"]])).toHaveLength(3);
    });

    it("applies to the copy after one shift so it equals the new wallGrid", () => {
        const rng = createRng(1234);
        const maze = new Maze(9, 9, rng);
        const copy = copyGrid(maze.wallGrid);

        maze.shift(rng);
        const diff = tileDiff(copy, maze.wallGrid);
        applyDiff(copy, diff);

        expect(copy).toEqual(maze.wallGrid);
    });

    it("keeps one shift's diff far below the tile count over 200 shifts on a 9 x 9 maze", () => {
        const rng = createRng(2024);
        const maze = new Maze(9, 9, rng);
        const tileCount = (2 * 9 + 1) * (2 * 9 + 1); // 361
        const copy = copyGrid(maze.wallGrid);
        let largest = 0;

        for (let i = 0; i < 200; i++) {
            maze.shift(rng);
            const diff = tileDiff(copy, maze.wallGrid);
            largest = Math.max(largest, diff.length);
            applyDiff(copy, diff);
            expect(copy).toEqual(maze.wallGrid);
        }

        expect(largest).toBeGreaterThan(0);
        expect(largest).toBeLessThan(40);
    });
});

describe("entityPx", () => {
    it("matches the worked examples", () => {
        expect(entityPx(0, 0, 20)).toEqual({ x: 20, y: 20 });
        expect(entityPx(2, 1, 10)).toEqual({ x: 50, y: 30 });
    });

    it("places cell (x, y) at tile (2x + 1, 2y + 1) times the tile size", () => {
        for (const cell of [4, 13, 45]) {
            for (const { x, y } of [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 8, y: 1 }]) {
                expect(entityPx(x, y, cell)).toEqual({ x: (2 * x + 1) * cell, y: (2 * y + 1) * cell });
            }
        }
    });
});

describe("markTiles", () => {
  function emptyGrid(rows = 12, cols = 12): string[][] {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => "0000"));
  }

  it("maps an r edge at (1, 2) to tile (4, 5) and a d edge at (1, 2) to tile (3, 6)", () => {
    const forecast = {
      opens: [{ x: 1, y: 2, dir: "r" as const }],
      closes: [{ x: 1, y: 2, dir: "d" as const }],
    };
    expect(markTiles(forecast, emptyGrid())).toEqual([
      { tx: 4, ty: 5, kind: "open", code: "0000" },
      { tx: 3, ty: 6, kind: "close", code: "0000" },
    ]);
  });

  it("marks every opening and sealing wall, opens first", () => {
    const forecast = {
      opens: [
        { x: 0, y: 0, dir: "r" as const },
        { x: 2, y: 3, dir: "d" as const },
      ],
      closes: [{ x: 1, y: 1, dir: "r" as const }],
    };
    expect(markTiles(forecast, emptyGrid())).toEqual([
      { tx: 2, ty: 1, kind: "open", code: "0000" },
      { tx: 5, ty: 8, kind: "open", code: "0000" },
      { tx: 4, ty: 3, kind: "close", code: "0000" },
    ]);
  });

  it("is empty for an empty forecast", () => {
    expect(markTiles({ opens: [], closes: [] }, emptyGrid())).toEqual([]);
  });

  it("computes the incoming tile's code from the grid after the forecast", () => {
    const grid = emptyGrid();
    // A wall above the tile the closing d edge at (1, 2) will fill (tile 3, 6),
    // and a wall standing on the sealing tile itself that must not leak into
    // its code, and a wall left of the opening r edge's tile (4, 5).
    grid[5][3] = "0101";
    grid[6][3] = "1111";
    grid[5][4] = "1010";
    const forecast = {
      opens: [{ x: 1, y: 2, dir: "r" as const }],
      closes: [{ x: 1, y: 2, dir: "d" as const }],
    };
    const marks = markTiles(forecast, grid);
    expect(marks).toEqual([
      // Tile (4, 5): only its left neighbour (3, 5) holds a wall.
      { tx: 4, ty: 5, kind: "open", code: "0001" },
      // Tile (3, 6): only its top neighbour (3, 5) holds a wall; the wall
      // standing on the tile itself is not part of its code.
      { tx: 3, ty: 6, kind: "close", code: "1000" },
    ]);
    // The sealing tile itself is emptied in the applied grid only by an open;
    // here it stays a wall placeholder, ready for its picture.
    expect(gridAfterForecast(grid, forecast)[6][3]).not.toBe("0000");
    expect(gridAfterForecast(grid, forecast)[5][4]).toBe("0000");
    // The corner between the two changed edges sees the opening wall while it
    // stands and not after the forecast: the marks read the applied grid.
    expect(tileCodeAt(grid, 3, 5)).toBe("0110");
    expect(tileCodeAt(gridAfterForecast(grid, forecast), 3, 5)).toBe("0010");
  });

  it("skips the mark on hidden tiles and keeps it on shown ones (Blackout)", () => {
    const forecast = {
      opens: [{ x: 1, y: 2, dir: "r" as const }],
      closes: [{ x: 1, y: 2, dir: "d" as const }],
    };
    // The opening wall's tile (4, 5) is hidden and the incoming tile (3, 6)
    // shows: the hidden wall must get no outgoing breathing and the change it
    // previews must not be marked.
    const marks = markTiles(forecast, emptyGrid(), (tx, ty) => !(tx === 4 && ty === 5));
    expect(marks).toEqual([{ tx: 3, ty: 6, kind: "close", code: "0000" }]);
    // The other way round: no incoming ghost is drawn on a hidden tile.
    expect(markTiles(forecast, emptyGrid(), (tx, ty) => !(tx === 3 && ty === 6))).toEqual([
      { tx: 4, ty: 5, kind: "open", code: "0000" },
    ]);
    // Nothing shown, nothing marked; everything shown, everything marked.
    expect(markTiles(forecast, emptyGrid(), () => false)).toEqual([]);
    expect(markTiles(forecast, emptyGrid(), () => true)).toHaveLength(2);
  });

  it("marks only the tiles inside a Blackout-style view", () => {
    const rng = createRng(7);
    const maze = new Maze(7, 7, rng);
    const walk = rollWalk(maze, rng, 3);
    const forecast = forecastOf(maze, walk);
    expect(forecast.opens.length + forecast.closes.length).toBeGreaterThan(0);
    // A view like game/modifiers.ts visibleCells draws: only tiles touching
    // wall-grid cell (1, 1) show.
    const nearOriginLight = (tx: number, ty: number): boolean =>
      tx >= 1 && tx <= 3 && ty >= 1 && ty <= 3;
    const marks = markTiles(forecast, maze.wallGrid, nearOriginLight);
    for (const mark of marks) expect(nearOriginLight(mark.tx, mark.ty)).toBe(true);
    // Without the view the same forecast marks every one of its tiles.
    expect(markTiles(forecast, maze.wallGrid).length).toBeGreaterThanOrEqual(marks.length);
  });

  it("gives the incoming tiles the codes the walls carry after the walk", () => {
    let found = false;
    for (let seed = 1; seed < 200 && !found; seed++) {
      const rng = createRng(seed);
      const maze = new Maze(7, 7, rng);
      const walk = rollWalk(maze, rng, 3);
      const forecast = forecastOf(maze, walk);
      if (forecast.opens.length === 0 || forecast.closes.length === 0) continue;
      found = true;
      const marks = markTiles(forecast, maze.wallGrid);
      for (const dir of walk) maze.step(dir);
      const closing = marks.filter((mark) => mark.kind === "close");
      expect(closing.length).toBeGreaterThan(0);
      for (const mark of closing) {
        // The ghost picture equals the picture the tiles layer will show.
        expect(mark.code).toBe(maze.wallGrid[mark.ty][mark.tx]);
      }
      for (const mark of marks.filter((m) => m.kind === "open")) {
        expect(maze.wallGrid[mark.ty][mark.tx]).toBe("0000");
      }
    }
    expect(found).toBe(true);
  });
});
