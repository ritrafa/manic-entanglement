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

/** One wall-grid tile the forecast marks, with the kind of mark it gets. */
export interface MarkTile {
    /** Column in the wall grid. */
    tx: number;
    /** Row in the wall grid. */
    ty: number;
    /** Which mark to draw: an opening wall or a sealing wall. */
    kind: "open" | "close";
}

/**
 * The wall-grid tiles to mark for a forecast: the wall between cell (x, y) and its
 * right neighbour is tile (2x + 2, 2y + 1), the wall below it is tile (2x + 1, 2y + 2).
 */
export function markTiles(forecast: { opens: { x: number; y: number; dir: "r" | "d" }[]; closes: { x: number; y: number; dir: "r" | "d" }[] }): MarkTile[] {
    const marks: MarkTile[] = [];
    const push = (edge: { x: number; y: number; dir: "r" | "d" }, kind: "open" | "close") => {
        if (edge.dir === "r") marks.push({ tx: 2 * edge.x + 2, ty: 2 * edge.y + 1, kind });
        else marks.push({ tx: 2 * edge.x + 1, ty: 2 * edge.y + 2, kind });
    };
    for (const edge of forecast.opens) push(edge, "open");
    for (const edge of forecast.closes) push(edge, "close");
    return marks;
}
