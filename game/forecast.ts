// Pure forecast of the maze's next walk: the origin's walk for the coming move can be
// rolled in advance because which neighbour steps are valid depends only on the
// origin's position, never on the walls. rollWalk draws the directions from a caller's
// rng; forecastOf applies them to a clone and reports the origin's positions and the
// net wall changes (a wall that opens and closes again within the walk is not listed).
// No DOM, no clocks, no global randomness.

import { DIR_DELTAS, type Dir, type Maze } from './maze';
import type { Rng } from './rng';

/** A maze cell. */
export interface Cell {
    x: number;
    y: number;
}

/** The wall between cell (x, y) and its right ("r") or lower ("d") neighbour. */
export interface Edge {
    x: number;
    y: number;
    dir: 'r' | 'd';
}

/** What the next move's shifts will do: the origin's positions and the net wall changes. */
export interface Forecast {
    /** The origin's position after each step of the walk; the last entry is the origin after the move. */
    walk: Cell[];
    /** Walls that will be open after the walk that are closed now. */
    opens: Edge[];
    /** Walls that will be closed after the walk that are open now. */
    closes: Edge[];
}

function edgeKey(x: number, y: number, dir: 'r' | 'd'): string {
    return `${x},${y},${dir}`;
}

function parseEdgeKey(key: string): Edge {
    const [x, y, dir] = key.split(',');
    return { x: Number(x), y: Number(y), dir: dir as 'r' | 'd' };
}

/** The open interior walls as a set of "x,y,dir" keys, dir "r" / "d" only. */
function openEdges(maze: Maze): Set<string> {
    const open = new Set<string>();
    for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
            const cell = maze.grid[y][x];
            if (x + 1 < maze.width && !cell.walls[1]) open.add(edgeKey(x, y, 'r'));
            if (y + 1 < maze.height && !cell.walls[2]) open.add(edgeKey(x, y, 'd'));
        }
    }
    return open;
}

/**
 * The directions the origin will take over the next `steps` shifts, each drawn from
 * the valid directions at the simulated position. The walk never leaves the board.
 */
export function rollWalk(maze: Maze, rng: Rng, steps: number): Dir[] {
    const walk: Dir[] = [];
    let at: Cell = { x: maze.origin.x, y: maze.origin.y };
    for (let i = 0; i < steps; i++) {
        const valid = maze.validDirs(at);
        if (valid.length === 0) break;
        const dir = rng.pick(valid);
        walk.push(dir);
        const delta = DIR_DELTAS[dir];
        at = { x: at.x + delta.x, y: at.y + delta.y };
    }
    return walk;
}

/**
 * Apply the walk to a clone of the maze and report the origin's positions and the net
 * wall changes: `opens` holds the walls the walk opens, `closes` the ones it seals,
 * and a wall that does both within the walk is in neither list. The maze itself is
 * untouched.
 */
export function forecastOf(maze: Maze, walk: Dir[]): Forecast {
    const clone = maze.clone();
    const positions: Cell[] = [];
    for (const dir of walk) {
        clone.step(dir);
        positions.push({ x: clone.origin.x, y: clone.origin.y });
    }

    const before = openEdges(maze);
    const after = openEdges(clone);
    const opens: Edge[] = [];
    const closes: Edge[] = [];
    for (const key of after) {
        if (!before.has(key)) opens.push(parseEdgeKey(key));
    }
    for (const key of before) {
        if (!after.has(key)) closes.push(parseEdgeKey(key));
    }
    return { walk: positions, opens, closes };
}
