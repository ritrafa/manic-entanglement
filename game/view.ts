// Pure board-view maths: which wall-grid tiles changed, where a cell's tile
// sits in pixels, and which wall tiles the forecast marks. No DOM here;
// lib/board.ts is the only code that touches it.

/** One wall-grid tile whose picture must change. */
export interface TileChange {
    /** Column in the wall grid. */
    x: number;
    /** Row in the wall grid. */
    y: number;
    /** The new tile code: the picture is images/<code>.png. */
    code: string;
}

/**
 * The tiles whose code differs between the remembered grid and the current one.
 * A null previous grid, or one with other dimensions than `next`, returns every
 * tile so the caller can paint the whole board.
 */
export function tileDiff(prev: string[][] | null, next: string[][]): TileChange[] {
    const rows = next.length;
    const cols = rows > 0 ? next[0].length : 0;
    const sameShape = prev !== null
        && prev.length === rows
        && prev.every((row) => Array.isArray(row) && row.length === cols);

    const changed: TileChange[] = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const code = next[y][x];
            if (!sameShape || prev[y][x] !== code) changed.push({ x, y, code });
        }
    }
    return changed;
}

/**
 * The pixel position of the tile of maze cell (cellX, cellY): the top-left corner
 * of tile (2 * cellX + 1, 2 * cellY + 1) at the given whole-pixel tile size.
 */
export function entityPx(cellX: number, cellY: number, cell: number): { x: number; y: number } {
    return { x: (2 * cellX + 1) * cell, y: (2 * cellY + 1) * cell };
}

/** The wall changes of a forecast, in the shape game/forecast.ts reports them. */
export interface ForecastEdges {
    opens: { x: number; y: number; dir: "r" | "d" }[];
    closes: { x: number; y: number; dir: "r" | "d" }[];
}

/** One wall-grid tile the forecast marks, with the kind of mark it gets. */
export interface MarkTile {
    /** Column in the wall grid. */
    tx: number;
    /** Row in the wall grid. */
    ty: number;
    /** Which mark to draw: an existing wall that will go away ("open", the
        outgoing one) or a gap that will become a wall ("close", the incoming
        one). */
    kind: "open" | "close";
    /** The picture code the tile carries after the forecast, computed from the
        grid with the forecast applied: the incoming tile's wall picture, the
        emptied tile for an outgoing one (whose own picture is already drawn in
        the tiles layer). */
    code: string;
}

/** The wall-grid tile of an edge: the wall between cell (x, y) and its right
    neighbour is tile (2x + 2, 2y + 1), the wall below it is tile (2x + 1, 2y + 2). */
function edgeTile(edge: { x: number; y: number; dir: "r" | "d" }): { tx: number; ty: number } {
    if (edge.dir === "r") return { tx: 2 * edge.x + 2, ty: 2 * edge.y + 1 };
    return { tx: 2 * edge.x + 1, ty: 2 * edge.y + 2 };
}

/**
 * A copy of `grid` with the forecast applied: the opening edges emptied and the
 * sealing edges filled with a wall placeholder, so codes read from the result
 * are the codes the tiles will carry after the change.
 */
export function gridAfterForecast(grid: string[][], forecast: ForecastEdges): string[][] {
    const next = grid.map((row) => row.slice());
    for (const edge of forecast.opens) {
        const { tx, ty } = edgeTile(edge);
        if (next[ty]) next[ty][tx] = "0000";
    }
    for (const edge of forecast.closes) {
        const { tx, ty } = edgeTile(edge);
        if (next[ty]) next[ty][tx] = "1111";
    }
    return next;
}

/**
 * The picture code of wall-grid tile (x, y): one bit per orthogonal neighbour
 * that holds a wall, top, right, bottom, left, in the numbering maze.ts gives
 * the sixteen wall pictures (images/<code>.png). Out-of-grid neighbours are
 * empty, as they are in the maze.
 */
export function tileCodeAt(grid: string[][], x: number, y: number): string {
    const bit = (bx: number, by: number): string =>
        ((grid[by]?.[bx] ?? "0000") !== "0000" ? "1" : "0");
    return bit(x, y - 1) + bit(x + 1, y) + bit(x, y + 1) + bit(x - 1, y);
}

/**
 * The wall-grid tiles to mark for a forecast, with the picture code each tile
 * carries after the change: an incoming ("close") tile gets the code of the
 * wall that will stand there, computed from the grid with the forecast applied.
 *
 * `tileShown`, when given, is the Blackout view of the wall grid (see
 * game/modifiers.ts visibleCells and lib/board.ts tileShown): a tile it
 * answers false for is hidden, and a hidden tile gets no mark at all. The
 * outgoing breathing class would otherwise override the hidden tile's low
 * opacity and reveal a wall Blackout must hide, and a ghost wall must not
 * preview a change where the player cannot see the wall it previews.
 */
export function markTiles(
    forecast: ForecastEdges,
    grid: string[][],
    tileShown?: (tx: number, ty: number) => boolean,
): MarkTile[] {
    const after = gridAfterForecast(grid, forecast);
    const marks: MarkTile[] = [];
    const push = (edge: { x: number; y: number; dir: "r" | "d" }, kind: "open" | "close") => {
        const { tx, ty } = edgeTile(edge);
        if (tileShown && !tileShown(tx, ty)) return;
        marks.push({ tx, ty, kind, code: tileCodeAt(after, tx, ty) });
    };
    for (const edge of forecast.opens) push(edge, "open");
    for (const edge of forecast.closes) push(edge, "close");
    return marks;
}
