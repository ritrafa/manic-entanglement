import { describe, expect, it } from "vitest";
import { Maze } from "@/game/maze";
import { createRng } from "@/game/rng";
import { entityPx, tileDiff } from "@/game/view";

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
