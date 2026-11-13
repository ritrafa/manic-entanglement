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

/** Below this cell (E56, the owner's 2026-11-13 decision) the whole maze is no
 *  longer worth drawing at once: the walls turn to mush and the reptile is a
 *  dot. A maze that would need a smaller cell gets the camera instead: a
 *  window of the maze at a readable size that follows the reptile. */
export const MIN_READABLE_CELL = 12;

/** The camera's cell is a multiple of this (half the art grid: sprites still
 *  draw at whole pixels) — the largest one that keeps the window roomy. */
export const CAMERA_CELL_STEP = 12;

/** The camera window is never narrower than this many wall-grid tiles. */
export const MIN_VIEW_TILES = 13;

/** The whole maze drawn at once, as before E56: the board is the maze. */
export interface WholeViewport {
    mode: 'whole';
    /** cell * tiles: the exact board side in pixels. */
    board: number;
    /** The visible window in wall-grid tiles: the whole maze. */
    viewTiles: number;
    /** The visible window in pixels: the board. */
    view: number;
    /** Whole pixels per wall-grid tile, at least MIN_CELL. */
    cell: number;
}

/** A window of the maze at a readable size; the board renders the whole maze
 *  at `cell` inside it and the layers slide to keep the reptile centred. */
export interface CameraViewport {
    mode: 'camera';
    /** Whole pixels per wall-grid tile: a multiple of CAMERA_CELL_STEP, or
     *  MIN_READABLE_CELL where even that would leave a window under
     *  MIN_VIEW_TILES tiles across (a viewport that small still gets a board). */
    cell: number;
    /** The visible window in wall-grid tiles per side. */
    viewTiles: number;
    /** viewTiles * cell: the visible window in pixels. */
    view: number;
    /** cell * tiles: the whole maze in pixels, the size the layers draw at. */
    board: number;
}

export type BoardViewport = WholeViewport | CameraViewport;

/**
 * Decide how a square maze of `tiles` wall-grid tiles is shown on a
 * `viewW` x `viewH` viewport (E56): the whole maze when its cell stays
 * readable, the camera otherwise. The camera takes the largest multiple of
 * CAMERA_CELL_STEP that still affords MIN_VIEW_TILES tiles of window in the
 * available area (never below MIN_READABLE_CELL), and the window is however
 * many tiles of that cell fit, never more than the maze itself.
 */
export function viewportFor(viewW: number, viewH: number, tiles: number): BoardViewport {
    const whole = boardLayout(viewW, viewH, tiles);
    if (whole.cell >= MIN_READABLE_CELL) {
        return { mode: 'whole', cell: whole.cell, board: whole.board, viewTiles: tiles, view: whole.board };
    }
    const usable = Math.min(viewW * WIDTH_SHARE, viewH * HEIGHT_SHARE);
    let cell = MIN_READABLE_CELL;
    let viewTiles = MIN_VIEW_TILES;
    if (Number.isFinite(usable) && usable > 0 && Number.isFinite(tiles) && tiles > 0) {
        // The largest multiple of the step whose window still fits MIN_VIEW_TILES.
        const roomy = Math.floor(usable / MIN_VIEW_TILES / CAMERA_CELL_STEP) * CAMERA_CELL_STEP;
        if (roomy > cell) cell = roomy;
        viewTiles = Math.max(MIN_VIEW_TILES, Math.floor(usable / cell));
        if (viewTiles > tiles) viewTiles = tiles;
    }
    return { mode: 'camera', cell, viewTiles, view: cell * viewTiles, board: cell * tiles };
}
