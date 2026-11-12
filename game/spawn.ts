// One pure function decides what a level contains: pickups and enemies are dealt out
// of the free cells (everything but the start and the exit), shuffled with the seeded
// rng, so placement is fair, deterministic and can never loop forever — even when more
// things are asked for than there are cells. No DOM, no clocks, no global randomness.

import type { Rng } from "./rng";
import type { ItemType } from "./events";
import { TOOL_IDS, type ToolId } from "./tools";
import { enemyFor, type EnemyKind } from "./enemies";

/** The six pickup kinds. */
export const ITEM_TYPES: readonly ItemType[] = ["energy", "boots", "gloves", "shield", "speed", "backpack"];

/** The five gear pickups (everything but "energy"); they share whatever "energy" does not take. */
export const GEAR_TYPES: readonly ItemType[] = ITEM_TYPES.filter((type) => type !== "energy");

/** A whole number the caller rolled, or a range [min, max] (inclusive on both ends) to roll from. */
export type Count = number | { min: number; max: number } | readonly [number, number];

export interface SpawnCounts {
    items: Count;
    enemies: Count;
    /** Tool pickups (game/tools.ts), placed separately from the normal pickup count. */
    tools?: Count;
}

export interface SpawnedItem {
    x: number;
    y: number;
    /** One of the six gear pickups, or a tool pickup (game/tools.ts). */
    type: ItemType | ToolId;
}

export interface SpawnedEnemy {
    x: number;
    y: number;
    kind: EnemyKind;
}

export interface SpawnedLevel {
    items: SpawnedItem[];
    enemies: SpawnedEnemy[];
}

export interface SpawnOptions {
    /** Depth the kinds are drawn for (game/enemies.ts enemyFor); defaults to 1, so only wisps. */
    depth?: number;
    /**
     * The cells of the route from the start to the exit in the maze as it is at level
     * start. Brutes and wardens are never placed on it: when no free cell off the
     * route exists, such an enemy becomes a wisp instead.
     */
    route?: readonly { x: number; y: number }[];
}

/** The cell the player starts on for a level of the given size. */
export function startCell(size: number): { x: number; y: number } {
    return { x: Math.floor(size / 2), y: size - 1 };
}

/** The cell the exit sits on for a level of the given size. */
export function exitCell(size: number): { x: number; y: number } {
    return { x: Math.floor(size / 2), y: 0 };
}

/** Resolve a count: a number is used as rolled, a range is rolled once with the rng. */
function rollCount(rng: Rng, count: Count): number {
    if (typeof count === "number") return Math.max(0, Math.floor(count));
    const [low, high] = "min" in count ? [count.min, count.max] : [count[0], count[1]];
    const min = Math.max(0, Math.floor(low));
    const max = Math.max(min, Math.floor(high));
    return min + rng.int(max - min + 1);
}

/** Fisher-Yates shuffle in place, drawing every choice from the rng. */
function shuffle<T>(items: T[], rng: Rng): void {
    for (let i = items.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const swap = items[i];
        items[i] = items[j];
        items[j] = swap;
    }
}

/** One pickup type: "energy" with `energyShare`, otherwise one of the other five evenly. */
function pickType(rng: Rng, energyShare: number): ItemType {
    const share = Math.min(1, Math.max(0, energyShare));
    if (rng.next() < share) return "energy";
    return rng.pick(GEAR_TYPES);
}

/**
 * Decide the contents of a level: `counts` pickups and enemies on the cells of a
 * size x size board that are neither the start (floor(size/2), size-1) nor the exit
 * (floor(size/2), 0). The free cells are shuffled with the rng; enemies are taken
 * first from those at least 2 steps (|dx| + |dy|) away from the start, then pickups
 * from whatever is left. When there are not enough cells, as many as fit are placed
 * and the result is returned — the function always terminates. `energyShare` is the
 * chance that a pickup is "energy" (the other five types share the rest evenly); it
 * defaults to the even 1-in-6 draw.
 */
export function spawnLevel(
    rng: Rng,
    size: number,
    counts: SpawnCounts,
    energyShare: number = 1 / ITEM_TYPES.length,
    options: SpawnOptions = {},
): SpawnedLevel {
    const start = startCell(size);
    const exit = exitCell(size);
    const depth = options.depth ?? 1;
    const route = options.route ?? [];
    const enemyCount = rollCount(rng, counts.enemies);
    const itemCount = rollCount(rng, counts.items);

    const onRoute = (cell: { x: number; y: number }): boolean =>
        route.some((step) => step.x === cell.x && step.y === cell.y);
    const farFromStart = (cell: { x: number; y: number }): boolean =>
        Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y) >= 2;

    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const isStart = x === start.x && y === start.y;
            const isExit = x === exit.x && y === exit.y;
            if (!isStart && !isExit) cells.push({ x, y });
        }
    }
    shuffle(cells, rng);

    const enemyCells: { x: number; y: number }[] = [];
    const left: { x: number; y: number }[] = [];
    for (const cell of cells) {
        if (enemyCells.length < enemyCount && farFromStart(cell)) enemyCells.push({ x: cell.x, y: cell.y });
        else left.push(cell);
    }

    // Give each enemy its kind. A brute or warden dealt onto the opening route is
    // moved to a free cell off it; when none is free it becomes a wisp instead.
    const enemies: SpawnedEnemy[] = [];
    for (const cell of enemyCells) {
        const kind = enemyFor(depth, rng);
        if (kind === "wisp" || !onRoute(cell)) {
            enemies.push({ x: cell.x, y: cell.y, kind });
            continue;
        }
        const swapIndex = left.findIndex((candidate) => !onRoute(candidate) && farFromStart(candidate));
        if (swapIndex === -1) {
            enemies.push({ x: cell.x, y: cell.y, kind: "wisp" });
        } else {
            const [swap] = left.splice(swapIndex, 1);
            enemies.push({ x: swap.x, y: swap.y, kind });
        }
    }

    const items: SpawnedItem[] = [];
    for (let i = 0; i < itemCount && i < left.length; i++) {
        items.push({ x: left[i].x, y: left[i].y, type: pickType(rng, energyShare) });
    }

    // Tool pickups come after the gear: the cells the items did not take, with each
    // type drawn from TOOL_IDS. The count is rolled last, so leaving `tools` out of
    // the call changes neither the enemies' nor the items' placement.
    const toolCount = rollCount(rng, counts.tools ?? 0);
    const firstFreeCell = Math.min(itemCount, left.length);
    for (let i = 0; i < toolCount && firstFreeCell + i < left.length; i++) {
        const cell = left[firstFreeCell + i];
        items.push({ x: cell.x, y: cell.y, type: rng.pick(TOOL_IDS) });
    }

    return { items, enemies };
}
