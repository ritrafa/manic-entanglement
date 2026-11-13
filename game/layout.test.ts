import { describe, expect, it } from "vitest";
import {
    boardLayout,
    blobRect,
    viewportFor,
    MIN_READABLE_CELL,
    CAMERA_CELL_STEP,
    MIN_VIEW_TILES,
    WIDTH_SHARE,
    HEIGHT_SHARE,
} from "@/game/layout";

describe("boardLayout", () => {
    it("snaps the height-limited cell to the pixel grid when it is close on a desktop viewport", () => {
        // 800 * 0.72 = 576; 576 / 11 = 52.36 -> 52; the largest multiple of 24
        // is 48, and 48 >= 0.8 * 52 = 41.6 -> 48.
        expect(boardLayout(1280, 800, 11)).toEqual({ cell: 48, board: 528 });
    });

    it("gives the first level's tiles a 24 px cell on a 1280x800 screen", () => {
        // 800 * 0.72 = 576; 576 / 21 = 27.4 -> 27; the largest multiple of 24
        // is 24, and 24 >= 0.8 * 27 = 21.6 -> 24.
        expect(boardLayout(1280, 800, 21)).toEqual({ cell: 24, board: 504 });
    });

    it("keeps the whole-pixel cell when the pixel grid is far on a phone viewport", () => {
        // 390 * 0.94 = 366.6; 366.6 / 11 = 33.3 -> 33; the largest multiple of
        // 24 is 24, and 24 < 0.8 * 33 = 26.4 -> the board fills the width at 33.
        expect(boardLayout(390, 844, 11)).toEqual({ cell: 33, board: 363 });
    });

    it("fills a 403x900 phone's width for level 1 instead of snapping to 24", () => {
        // min(403 * 0.94, 900 * 0.72) = 378.82; 378.82 / 11 = 34.4 -> 34; the
        // largest multiple of 24 is 24, and 24 < 0.8 * 34 = 27.2 -> 34 stays,
        // so the board is about 374 px wide, not a 264 px square.
        expect(boardLayout(403, 900, 11)).toEqual({ cell: 34, board: 374 });
    });

    it("keeps the whole-pixel cell below 24 on a phone (small screens and deep levels)", () => {
        // 390 * 0.94 = 366.6; 366.6 / 21 = 17.4 -> 17, below the pixel grid.
        expect(boardLayout(390, 844, 21)).toEqual({ cell: 17, board: 357 });
    });

    it("keeps board = cell * tiles inside both limits for many sizes and screens", () => {
        const screens = [
            { w: 1280, h: 800 },
            { w: 390, h: 844 },
            { w: 403, h: 900 },
        ];
        for (const { w, h } of screens) {
            for (const tiles of [11, 15, 27]) {
                const { cell, board } = boardLayout(w, h, tiles);
                const whole = Math.max(4, Math.floor(Math.min(w * 0.94, h * 0.72) / tiles));
                expect(Number.isInteger(cell)).toBe(true);
                expect(board).toBe(cell * tiles);
                if (cell > 4) {
                    // Only the minimum cell may break the limits.
                    expect(board).toBeLessThanOrEqual(w * 0.94);
                    expect(board).toBeLessThanOrEqual(h * 0.72);
                }
                if (cell >= 24) {
                    // Either the art grid, and then it was close to the whole
                    // cell; or the whole-pixel cell itself, uncropped.
                    expect(cell % 24 === 0 || cell === whole).toBe(true);
                    if (cell % 24 === 0) expect(cell).toBeGreaterThanOrEqual(0.8 * whole);
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

describe("viewportFor", () => {
    it("keeps a desktop's first level whole-maze, exactly as boardLayout", () => {
        // 1280x800, 11 tiles: boardLayout's 48 px cell is well above the
        // readable floor, so nothing changes for early levels.
        expect(viewportFor(1280, 800, 11)).toEqual({
            mode: 'whole', cell: 48, board: 528, viewTiles: 11, view: 528,
        });
    });

    it("keeps a phone's first level whole-maze", () => {
        // 403x900, 11 tiles: the 34 px cell stands, board and window coincide.
        expect(viewportFor(403, 900, 11)).toEqual({
            mode: 'whole', cell: 34, board: 374, viewTiles: 11, view: 374,
        });
    });

    it("switches a phone at depth 41 to a camera with a readable cell", () => {
        // Depth 41 is a 45-cell maze: 91 wall-grid tiles. Whole-maze the cell
        // would be floor(378.82 / 91) = 4, far below the readable 12. The
        // camera takes the largest multiple of 12 with a 13-tile window:
        // floor(378.82 / 13 / 12) * 12 = 24, and 15 tiles of 24 fit the width.
        const vp = viewportFor(403, 900, 91);
        expect(vp.mode).toBe('camera');
        if (vp.mode !== 'camera') return;
        expect(vp.cell).toBeGreaterThanOrEqual(MIN_READABLE_CELL);
        expect(vp.cell % CAMERA_CELL_STEP).toBe(0);
        expect(vp.cell).toBe(24);
        expect(vp.viewTiles).toBe(15);
        expect(vp.view).toBe(24 * 15);
        expect(vp.view).toBeLessThanOrEqual(403 * WIDTH_SHARE);
        expect(vp.view).toBeLessThanOrEqual(900 * HEIGHT_SHARE);
        expect(vp.board).toBe(24 * 91);
    });

    it("never drops the camera cell below the readable floor", () => {
        // A viewport too small for even a 13-tile window at 12 px still gets
        // 12 px tiles and the minimum window.
        const vp = viewportFor(100, 100, 91);
        expect(vp.mode).toBe('camera');
        if (vp.mode !== 'camera') return;
        expect(vp.cell).toBe(MIN_READABLE_CELL);
        expect(vp.viewTiles).toBe(MIN_VIEW_TILES);
        expect(vp.view).toBe(12 * MIN_VIEW_TILES);
    });

    it("caps the window at the maze's own size", () => {
        // 27 tiles on a viewport whose camera cell (12) affords far more than
        // 27: the window never grows past the maze.
        const vp = viewportFor(1280, 800, 27);
        if (vp.mode === 'whole') return; // a big enough screen stays whole
        expect(vp.viewTiles).toBeLessThanOrEqual(27);
    });

    it("falls back to the minimum camera window for a zero or NaN viewport", () => {
        for (const [w, h] of [[0, 0], [NaN, 844], [390, NaN]] as const) {
            const vp = viewportFor(w, h, 91);
            expect(vp.mode).toBe('camera');
            expect(vp.cell).toBe(MIN_READABLE_CELL);
            expect(vp.viewTiles).toBe(MIN_VIEW_TILES);
        }
    });

    it("stays whole exactly while the whole-maze cell is readable", () => {
        const screens = [
            { w: 1280, h: 800 },
            { w: 390, h: 844 },
            { w: 403, h: 900 },
        ];
        for (const { w, h } of screens) {
            for (const tiles of [11, 21, 27, 51, 91]) {
                const vp = viewportFor(w, h, tiles);
                const whole = boardLayout(w, h, tiles);
                if (whole.cell >= MIN_READABLE_CELL) {
                    expect(vp.mode).toBe('whole');
                    expect(vp.cell).toBe(whole.cell);
                    expect(vp.board).toBe(whole.board);
                    expect(vp.viewTiles).toBe(tiles);
                    expect(vp.view).toBe(whole.board);
                } else {
                    expect(vp.mode).toBe('camera');
                    expect(vp.cell).toBeGreaterThanOrEqual(MIN_READABLE_CELL);
                    expect(vp.viewTiles).toBeGreaterThanOrEqual(MIN_VIEW_TILES);
                    expect(vp.viewTiles).toBeLessThanOrEqual(tiles);
                    expect(vp.view).toBe(vp.cell * vp.viewTiles);
                    expect(vp.board).toBe(vp.cell * tiles);
                }
            }
        }
    });
});
