import { describe, expect, it } from "vitest";
import { cameraOffset } from "@/game/camera";

describe("cameraOffset", () => {
    it("centres the reptile in the window in mid-maze", () => {
        // A 41-tile wall grid seen through 13 tiles: the player's tile (21, 21)
        // sits at the window's centre, so the window starts half a window back.
        expect(cameraOffset({ x: 21, y: 21 }, 41, 13)).toEqual({ x: 15, y: 15 });
    });

    it("clamps at the top-left edge instead of showing past the maze", () => {
        expect(cameraOffset({ x: 0, y: 0 }, 41, 13)).toEqual({ x: 0, y: 0 });
        expect(cameraOffset({ x: 4, y: 2 }, 41, 13)).toEqual({ x: 0, y: 0 });
    });

    it("clamps at the bottom-right edge, letting the reptile walk off-centre", () => {
        // The window's last legal start is tiles - viewTiles = 28.
        expect(cameraOffset({ x: 40, y: 39 }, 41, 13)).toEqual({ x: 28, y: 28 });
        expect(cameraOffset({ x: 100, y: -3 }, 41, 13)).toEqual({ x: 28, y: 0 });
    });

    it("sits at the origin when the window is as wide as the maze", () => {
        expect(cameraOffset({ x: 9, y: 5 }, 13, 13)).toEqual({ x: 0, y: 0 });
        expect(cameraOffset({ x: 30, y: 30 }, 41, 60)).toEqual({ x: 0, y: 0 });
    });

    it("keeps x and y independent", () => {
        expect(cameraOffset({ x: 1, y: 39 }, 41, 13)).toEqual({ x: 0, y: 28 });
    });

    it("answers a nonsense player or window with the origin window", () => {
        expect(cameraOffset({ x: NaN, y: NaN }, 41, 13)).toEqual({ x: 0, y: 0 });
        expect(cameraOffset({ x: 5, y: 5 }, NaN, 13)).toEqual({ x: 0, y: 0 });
        expect(cameraOffset({ x: 5, y: 5 }, 41, 0)).toEqual({ x: 5, y: 5 });
    });

    it("returns whole tile indices inside the maze for every position", () => {
        for (let p = 0; p < 41; p++) {
            const { x, y } = cameraOffset({ x: p, y: p }, 41, 13);
            expect(Number.isInteger(x)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(41 - 13);
            expect(y).toBe(x);
        }
    });
});
