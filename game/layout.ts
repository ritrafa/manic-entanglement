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

/** How close the largest fitting multiple of PIXEL must be to the whole-pixel
 *  cell (a share of it) to be worth taking: below it the plain whole-pixel
 *  cell stands, so a phone fills its width (E52, the owner's 2026-11-13
 *  "board fills the width" decision replacing "crisp everywhere"). */
export const PIXEL_SNAP_SHARE = 0.8;

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
 * plain whole-pixel cell, snapped down to the largest multiple of PIXEL only
 * when that multiple is at least PIXEL_SNAP_SHARE of it. Where the snap would
 * cost a big slice of the board (a phone filling its width) the whole-pixel
 * cell stands, so the art shrinks instead of the board.
 */
export function boardLayout(viewW: number, viewH: number, tiles: number): BoardLayout {
    const usable = Math.min(viewW * WIDTH_SHARE, viewH * HEIGHT_SHARE);
    let cell = Number.isFinite(usable) && usable > 0 && Number.isFinite(tiles) && tiles > 0
        ? Math.floor(usable / tiles)
        : MIN_CELL;
    if (!Number.isFinite(cell) || cell < MIN_CELL) cell = MIN_CELL;
    // The 24 px art grid where it is close to the size the viewport affords
    // (desktop: 52 -> 48, 27 -> 24); where the snap would throw away more than
    // PIXEL_SNAP_SHARE of the cell (a phone at 34) the whole-pixel cell stands,
    // so the board fills the width and only the art draws at a smaller scale.
    if (cell >= PIXEL) {
        const snapped = Math.floor(cell / PIXEL) * PIXEL;
        if (snapped >= PIXEL_SNAP_SHARE * cell) cell = snapped;
    }
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
