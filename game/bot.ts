// A test bot for the pure Run: nextStep takes the first step of the shortest route to
// the exit in the maze as it is now (breadth-first), playBot drives a run by
// alternating clock ticks and moves. No DOM, no clocks, no global randomness.

import type { Run, RunPhase } from "./run";

/** Read the phase without the compiler narrowing it across method calls. */
function phaseOf(run: Run): RunPhase {
    return run.phase;
}

export interface Step {
    dx: number;
    dy: number;
}

const STEPS: readonly Step[] = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
];

/** The part of the board a route is searched on: the breadth-first walk only asks these. */
export interface RouteMaze {
    width: number;
    canMove(x: number, y: number, dx: number, dy: number): boolean;
}

export interface Cell {
    x: number;
    y: number;
}

/**
 * The cells of a shortest route from `from` to `to` in the maze as it is now, both
 * ends included, or null when there is none (breadth-first over the open walls).
 * The spawner uses it to keep the heavy kinds off the route a fresh level begins on.
 */
export function routeCells(maze: RouteMaze, from: Cell, to: Cell): Cell[] | null {
    const key = (x: number, y: number) => y * maze.width + x;
    const startKey = key(from.x, from.y);
    const previous = new Map<number, number>();
    const seen = new Set<number>([startKey]);
    const queue: number[] = [startKey];

    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        const x = current % maze.width;
        const y = Math.floor(current / maze.width);
        if (x === to.x && y === to.y) {
            // Walk the parent chain back to the start; that is the route, start to end.
            const path: Cell[] = [];
            let cellKey: number | undefined = current;
            while (cellKey !== undefined) {
                path.unshift({ x: cellKey % maze.width, y: Math.floor(cellKey / maze.width) });
                cellKey = previous.get(cellKey);
            }
            return path;
        }
        for (const step of STEPS) {
            if (!maze.canMove(x, y, step.dx, step.dy)) continue;
            const next = key(x + step.dx, y + step.dy);
            if (seen.has(next)) continue;
            seen.add(next);
            previous.set(next, current);
            queue.push(next);
        }
    }
    return null;
}

/** The first step of a shortest path from the player to the exit, or null when there is none. */
export function nextStep(run: Run): Step | null {
    const { maze, player, exit } = run;
    if (player.x === exit.x && player.y === exit.y) return null;
    const path = routeCells(maze, { x: player.x, y: player.y }, { x: exit.x, y: exit.y });
    if (path === null || path.length < 2) return null;
    return { dx: path[1].x - player.x, dy: path[1].y - player.y };
}

/**
 * Play a run with the bot: start it, alternate tick(1000 / movesPerSecond) and a move,
 * take the next level on "clear". Returns the deepest level reached when the run dies
 * or maxMoves is used up.
 */
export function playBot(run: Run, movesPerSecond: number, maxMoves: number): number {
    if (run.phase === "ready" || run.phase === "dead") run.start();
    const stepMs = 1000 / movesPerSecond;
    let deepest = run.level;

    for (let i = 0; i < maxMoves && run.phase !== "dead"; i++) {
        if (run.phase === "clear") {
            run.nextLevel();
            deepest = Math.max(deepest, run.level);
            continue;
        }
        const step = nextStep(run);
        if (step === null) break;
        run.tick(stepMs);
        if (run.phase !== "playing") continue;
        run.move(step.dx, step.dy);
        if (phaseOf(run) === "clear") {
            run.nextLevel();
            deepest = Math.max(deepest, run.level);
        }
    }
    return deepest;
}
