// One pure function decides what a level contains: pickups and enemies on distinct free
// cells, chosen from a seeded shuffle so placement is fair, never loops and is testable.
// No DOM, no global randomness, no clocks: every choice comes from the given Rng.

import type { Rng } from "./rng";
import type { ItemType } from "./events";

/** The six pickup types, chosen evenly for each placed pickup. */
export const ITEM_TYPES: readonly ItemType[] = ["energy", "boots", "gloves", "shield", "speed", "backpack"];

/** A whole number already rolled, or a closed range for spawnLevel to roll once. */
export type SpawnCount = number | { min: number; max: number };

export interface SpawnCounts {
    items: SpawnCount;
    enemies: SpawnCount;
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

/** The player's start cell for a level of the given size. */
export function startCell(size: number): { x: number; y: number } {
    return { x: Math.floor(size / 2), y: size - 1 };
}

/** The exit cell for a level of the given size. */
export function exitCell(size: number): { x: number; y: number } {
    return { x: Math.floor(size / 2), y: 0 };
}

function rollCount(rng: Rng, count: SpawnCount): number {
    if (typeof count === "number") return Math.max(0, Math.floor(count));
    const min = Math.max(0, Math.floor(count.min));
    const max = Math.max(min, Math.floor(count.max));
    return min + rng.int(max - min + 1);
}

/**
 * Place the level's contents on free cells: every cell except the start and the exit,
 * shuffled with the rng; enemies first from the cells at Manhattan distance >= 2 from
 * the start, then pickups from what is left. Requests that exceed the free cells place
 * as many as fit and return — the function always terminates. Same rng state, same result.
 */
export function spawnLevel(rng: Rng, size: number, counts: SpawnCounts): SpawnedLevel {
    const items: SpawnedItem[] = [];
    const enemies: SpawnedEnemy[] = [];
    const start = startCell(size);
    const exit = exitCell(size);

    const free: { x: number; y: number }[] = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (x === start.x && y === start.y) continue;
            if (x === exit.x && y === exit.y) continue;
            free.push({ x, y });
        }
    }
    // Fisher-Yates with the seeded rng: a fair shuffle, no loops beyond the cell count.
    for (let i = free.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const swap = free[i];
        free[i] = free[j];
        free[j] = swap;
    }

    const enemyCount = rollCount(rng, counts.enemies);
    const itemCount = rollCount(rng, counts.items);

    const left: { x: number; y: number }[] = [];
    for (const cell of free) {
        const farFromStart = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y) >= 2;
        if (enemies.length < enemyCount && farFromStart) {
            enemies.push({ x: cell.x, y: cell.y });
        } else {
            left.push(cell);
        }
    }

    for (const cell of left) {
        if (items.length >= itemCount) break;
        items.push({ x: cell.x, y: cell.y, type: rng.pick(ITEM_TYPES) });
    }

    return { items, enemies };
}
