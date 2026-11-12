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

/** The first step of a shortest path from the player to the exit, or null when there is none. */
export function nextStep(run: Run): Step | null {
    const { maze, player, exit } = run;
    if (player.x === exit.x && player.y === exit.y) return null;

    const key = (x: number, y: number) => y * maze.width + x;
    const startKey = key(player.x, player.y);
    const previous = new Map<number, number>();
    const seen = new Set<number>([startKey]);
    const queue: number[] = [startKey];

    for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        const x = current % maze.width;
        const y = Math.floor(current / maze.width);
        if (x === exit.x && y === exit.y) {
            // Walk the parent chain back to the player; the last cell before the start is the first step.
            let stepKey = current;
            let parent = previous.get(stepKey);
            while (parent !== undefined && parent !== startKey) {
                stepKey = parent;
                parent = previous.get(stepKey);
            }
            const sx = stepKey % maze.width;
            const sy = Math.floor(stepKey / maze.width);
            return { dx: sx - player.x, dy: sy - player.y };
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
