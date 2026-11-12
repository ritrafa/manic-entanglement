import { describe, expect, it } from "vitest";
import { boardLayout, blobRect } from "@/game/layout";

describe("boardLayout", () => {
    it("floors the height-limited cell on a desktop viewport", () => {
        // 800 * 0.62 = 496; 496 / 11 = 45.09 -> 45.
        expect(boardLayout(1280, 800, 11)).toEqual({ cell: 45, board: 495 });
    });

    it("floors the width-limited cell on a phone viewport", () => {
        // 390 * 0.94 = 366.6; 366.6 / 11 = 33.3 -> 33.
        expect(boardLayout(390, 844, 11)).toEqual({ cell: 33, board: 363 });
    });

    it("keeps board = cell * tiles inside both limits for many sizes and screens", () => {
        const screens = [
            { w: 1280, h: 800 },
            { w: 390, h: 844 },
        ];
        for (const { w, h } of screens) {
            for (const tiles of [11, 15, 27]) {
                const { cell, board } = boardLayout(w, h, tiles);
                expect(Number.isInteger(cell)).toBe(true);
                expect(board).toBe(cell * tiles);
                if (cell > 4) {
                    // Only the minimum cell may break the limits.
                    expect(board).toBeLessThanOrEqual(w * 0.94);
                    expect(board).toBeLessThanOrEqual(h * 0.62);
                }
            }
        }
    });

    it("never goes below the minimum cell", () => {
        expect(boardLayout(10, 10, 27).cell).toBe(4);
        expect(boardLayout(10, 10, 27).board).toBe(4 * 27);
    });

    it("falls back to the minimum cell for a zero or NaN viewport", () => {
        expect(boardLayout(0, 0, 11).cell).toBe(4);
        expect(boardLayout(NaN, 844, 11).cell).toBe(4);
        expect(boardLayout(390, NaN, 11).cell).toBe(4);
        expect(boardLayout(NaN, NaN, 11).board).toBe(4 * 11);
    });
});

describe("blobRect", () => {
    it("matches the worked example: origin (2, 2) at cell 50", () => {
        // Tile (5, 5) centre is (275, 275); an 8-tile blob is 400 px.
        expect(blobRect({ x: 2, y: 2 }, 50)).toEqual({ left: 75, top: 75, size: 400 });
    });

    it("centres the blob on the origin tile's centre at any cell size", () => {
        for (const cell of [10, 33, 45]) {
            const origin = { x: 3, y: 1 };
            const { left, top, size } = blobRect(origin, cell);
            expect(size).toBe(8 * cell);
            const centreX = left + size / 2;
            const centreY = top + size / 2;
            expect(centreX).toBe((2 * origin.x + 1) * cell + cell / 2);
            expect(centreY).toBe((2 * origin.y + 1) * cell + cell / 2);
        }
    });
});
