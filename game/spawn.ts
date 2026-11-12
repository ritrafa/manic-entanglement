// One pure function decides what a level contains: pickups and enemies are dealt out
// of the free cells (everything but the start and the exit), shuffled with the seeded
// rng, so placement is fair, deterministic and can never loop forever — even when more
// things are asked for than there are cells. No DOM, no clocks, no global randomness.

import type { Rng } from "./rng";
import type { ItemType } from "./events";

/** The six pickup kinds, chosen evenly. */
export const ITEM_TYPES: readonly ItemType[] = ["energy", "boots", "gloves", "shield", "speed", "backpack"];

/** A whole number the caller rolled, or a range to roll from (inclusive on both ends). */
export type Count = number | { min: number; max: number };

export interface SpawnCounts {
    items: Count;
    enemies: Count;
}

export interface SpawnedItem {
    x: number;
    y: number;
    type: ItemType;
}

export interface SpawnedEnemy {
    x: number;
    y: number;
}

export interface SpawnedLevel {
    items: SpawnedItem[];
    enemies: SpawnedEnemy[];
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
    const min = Math.max(0, Math.floor(count.min));
    const max = Math.max(min, Math.floor(count.max));
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

/**
 * Decide the contents of a level: `counts` pickups and enemies on the cells of a
 * size x size board that are neither the start (floor(size/2), size-1) nor the exit
 * (floor(size/2), 0). The free cells are shuffled with the rng; enemies are taken
 * first from those at least 2 steps (|dx| + |dy|) away from the start, then pickups
 * from whatever is left. When there are not enough cells, as many as fit are placed
 * and the result is returned — the function always terminates.
 */
export function spawnLevel(rng: Rng, size: number, counts: SpawnCounts): SpawnedLevel {
    const start = startCell(size);
    const exit = exitCell(size);
    const enemyCount = rollCount(rng, counts.enemies);
    const itemCount = rollCount(rng, counts.items);

    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const isStart = x === start.x && y === start.y;
            const isExit = x === exit.x && y === exit.y;
            if (!isStart && !isExit) cells.push({ x, y });
        }
    }
    shuffle(cells, rng);

    const enemies: SpawnedEnemy[] = [];
    const left: { x: number; y: number }[] = [];
    for (const cell of cells) {
        const farFromStart = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y) >= 2;
        if (enemies.length < enemyCount && farFromStart) enemies.push({ x: cell.x, y: cell.y });
        else left.push(cell);
    }

    const items: SpawnedItem[] = [];
    for (let i = 0; i < itemCount && i < left.length; i++) {
        items.push({ x: left[i].x, y: left[i].y, type: rng.pick(ITEM_TYPES) });
    }

    return { items, enemies };
}
