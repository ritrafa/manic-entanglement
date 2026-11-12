// The one place the board's pixel size is decided. Pure: no DOM, no window.
// Both the level-start path and the resize path in the shell call boardLayout,
// so the first paint and every resize agree to the pixel. The origin blob is
// placed by blobRect, which keeps it centred on the origin tile at any size.

/** Smallest cell we will draw, so a tiny or broken viewport still shows a board. */
export const MIN_CELL = 4;

/** The board may use at most this share of the viewport width / height (HUD room below). */
export const WIDTH_SHARE = 0.94;
export const HEIGHT_SHARE = 0.62;

/** The blob is this many tiles across. */
export const BLOB_TILES = 8;

export interface BoardLayout {
    /** Whole pixels per wall-grid tile, at least MIN_CELL. */
    cell: number;
    /** cell * tiles: the exact board side in pixels. */
    board: number;
}

export interface BlobRect {
    left: number;
    top: number;
    size: number;
}

/**
 * Size a square board of `tiles` tiles per side for a `viewW` x `viewH` viewport.
 * The board fits in viewW * WIDTH_SHARE and viewH * HEIGHT_SHARE unless even
 * MIN_CELL would overflow, and `cell` is always a whole number of pixels.
 */
export function boardLayout(viewW: number, viewH: number, tiles: number): BoardLayout {
    const usable = Math.min(viewW * WIDTH_SHARE, viewH * HEIGHT_SHARE);
    let cell = Number.isFinite(usable) && usable > 0 && Number.isFinite(tiles) && tiles > 0
        ? Math.floor(usable / tiles)
        : MIN_CELL;
    if (!Number.isFinite(cell) || cell < MIN_CELL) cell = MIN_CELL;
    return { cell, board: cell * tiles };
}

/**
 * The dark blob around the maze origin. `origin` is the maze cell; its tile in the
 * wall grid is (2 * origin.x + 1, 2 * origin.y + 1). The blob is `tiles` tiles wide
 * (BLOB_TILES unless given) and centred on that tile's centre.
 */
export function blobRect(origin: { x: number; y: number }, cell: number, tiles: number = BLOB_TILES): BlobRect {
    const size = tiles * cell;
    const centreX = (2 * origin.x + 1) * cell + cell / 2;
    const centreY = (2 * origin.y + 1) * cell + cell / 2;
    return { left: centreX - size / 2, top: centreY - size / 2, size };
}
