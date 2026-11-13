// The camera of E56: on a maze too big for the screen the board draws the
// whole maze inside a window and slides it so the reptile stays centred. Pure
// maths only — no DOM, no pixels: the tile maths lives here, lib/board.ts
// turns the result into a transform.

/** Where the clipping window sits in the wall grid: its top-left tile. */
export interface CameraWindow {
    /** Left column of the window, a whole tile index in [0, tiles - viewTiles]. */
    x: number;
    /** Top row of the window, a whole tile index in [0, tiles - viewTiles]. */
    y: number;
}

/**
 * The top-left tile of a `viewTiles` x `viewTiles` window that keeps the
 * reptile (a wall-grid tile position, as the board draws it) as close to the
 * centre as whole tiles allow, clamped so the window never leaves the maze:
 * at the edges the reptile walks off-centre and the camera stops. A window as
 * wide as the maze sits at the origin; a window of no tiles is read as one tile, and a nonsense position as the origin.
 */
export function cameraOffset(
    player: { x: number; y: number },
    tiles: number,
    viewTiles: number,
): CameraWindow {
    const size = Number.isFinite(tiles) ? Math.max(0, Math.floor(tiles)) : 0;
    const view = Number.isFinite(viewTiles) ? Math.max(1, Math.floor(viewTiles)) : 1;
    const max = Math.max(0, size - view);
    const half = Math.floor(view / 2);
    const clamp = (value: number): number => {
        if (!Number.isFinite(value)) return 0;
        return Math.min(max, Math.max(0, Math.floor(value)));
    };
    const px = Number.isFinite(player?.x) ? player.x : 0;
    const py = Number.isFinite(player?.y) ? player.y : 0;
    return { x: clamp(px - half), y: clamp(py - half) };
}
