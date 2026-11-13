// The one place the board's pixel size is decided. Pure: no DOM, no window.
// Both the level-start path and the resize path in the shell call boardLayout,
// so the first paint and every resize agree to the pixel. The origin blob is
// placed by blobRect, which keeps it centred on the origin tile at any size.

/** Smallest cell we will draw, so a tiny or broken viewport still shows a board. */
export const MIN_CELL = 4;

/** The board may use at most this share of the viewport width / height (the
 *  one-row HUD of E44 sits above it, so the board takes most of the height). */
export const WIDTH_SHARE = 0.94;
export const HEIGHT_SHARE = 0.72;

/** The design's art grid (design/pixel-art.md): a cell that can afford it is a
 *  whole multiple of this, so sprites draw at whole multiples of their art. */
export const PIXEL = 24;

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
 * MIN_CELL would overflow, and `cell` is always a whole number of pixels: the
 * largest multiple of PIXEL that fits when it can afford one (the pixel grid),
 * the plain whole-pixel cell below that (small phones and deep levels).
 */
export function boardLayout(viewW: number, viewH: number, tiles: number): BoardLayout {
    const usable = Math.min(viewW * WIDTH_SHARE, viewH * HEIGHT_SHARE);
    let cell = Number.isFinite(usable) && usable > 0 && Number.isFinite(tiles) && tiles > 0
        ? Math.floor(usable / tiles)
        : MIN_CELL;
    if (!Number.isFinite(cell) || cell < MIN_CELL) cell = MIN_CELL;
    // Whole multiples of the 24 px art where the screen allows; below 24 the
    // plain whole-pixel cell stands (a phone and the deep levels stay playable).
    if (cell >= PIXEL) cell = Math.floor(cell / PIXEL) * PIXEL;
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
