// One pure function decides what a level contains: pickups and enemies are dealt out
// of the free cells (everything but the start and the exit), shuffled with the seeded
// rng, so placement is fair, deterministic and can never loop forever — even when more
// things are asked for than there are cells. No DOM, no clocks, no global randomness.

import type { Rng } from "./rng";
import type { ItemType } from "./events";
import { toolsFor, type ToolId } from "./tools";
import { ENEMY_KINDS, enemyFor, type EnemyKind } from "./enemies";
import { CONFIG } from "./config";
import type { PickupRarity } from "./wardrobe";

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

/** A trait the maze hands out (game/wardrobe.ts PICKUP_TRAITS), as one candidate for a drop. */
export interface TraitCandidate {
    layer: string;
    trait: string;
    rarity: PickupRarity;
}

/** The trait pickup lying on a cell of the level, ready to be held by the run. */
export interface SpawnedTrait extends TraitCandidate {
    x: number;
    y: number;
}

/**
 * The trait drop chances (E58): at most one trait pickup per level. The Rare
 * roll comes first (6% from depth 5); a level that did not roll it then rolls
 * Found (20% from depth 2), so a level never carries both. The first level
 * never drops one. When the roll wins but no unheld trait of that rarity is
 * left, no trait drops.
 */
export const TRAIT_DROPS: readonly { rarity: PickupRarity; fromDepth: number; chance: number }[] = [
    { rarity: "rare", fromDepth: 5, chance: 0.06 },
    { rarity: "found", fromDepth: 2, chance: 0.2 },
];

export interface SpawnedLevel {
    items: SpawnedItem[];
    enemies: SpawnedEnemy[];
    /** The trait pickup of the level, or null when none dropped (E58). */
    trait: SpawnedTrait | null;
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
    /**
     * The traits this level may drop (E58): the PICKUP_TRAITS the player does
     * not hold yet. At most one of them lies on the board; an empty or missing
     * list drops nothing and draws no rng at all, so the rest of the level is
     * untouched.
     */
    traits?: readonly TraitCandidate[];
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
 * Roll the level's trait drop (E58): the Rare chance is rolled first from
 * depth 5, then — only when Rare did not win — the Found chance from depth 2.
 * A level therefore never carries both, and the first level never drops one.
 * The winner is drawn uniformly from the candidates of that rarity; when the
 * roll wins but no candidate of that rarity is left, nothing drops. An empty
 * candidate list draws no rng at all.
 */
export function rollTraitDrop(
    rng: Rng,
    depth: number,
    candidates: readonly TraitCandidate[],
): TraitCandidate | null {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const [rare, found] = TRAIT_DROPS;
    if (depth < found.fromDepth) return null;
    if (depth >= rare.fromDepth && rng.next() < rare.chance) {
        const pool = candidates.filter((candidate) => candidate.rarity === "rare");
        if (pool.length === 0) return null;
        return rng.pick(pool);
    }
    if (rng.next() < found.chance) {
        const pool = candidates.filter((candidate) => candidate.rarity === "found");
        if (pool.length === 0) return null;
        return rng.pick(pool);
    }
    return null;
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

    // Stalkers (game/enemies.ts, game/run.ts): from the stalker's depth one of the
    // level's enemies hunts the player, from CONFIG.stalkerPairDepth two. A stalker
    // replaces an enemy, never adds to the count, and prefers a wisp. It must start
    // at least CONFIG.stalkerMinDist (|dx| + |dy|) from the start: an enemy dealt a
    // nearer cell is moved to a free farther one, and when no such cell is free it
    // becomes a wisp instead. No rng is drawn here, so the items' placement is
    // untouched by the stalkers.
    const stalkerWant = depth >= CONFIG.stalkerPairDepth
        ? 2
        : depth >= ENEMY_KINDS.stalker.fromDepth
            ? 1
            : 0;
    if (stalkerWant > 0) {
        const farEnough = (cell: { x: number; y: number }): boolean =>
            Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y) >= CONFIG.stalkerMinDist;
        const candidates = [
            ...enemies.filter((enemy) => enemy.kind === "wisp"),
            ...enemies.filter((enemy) => enemy.kind !== "wisp"),
        ];
        let made = 0;
        for (const enemy of candidates) {
            if (made >= stalkerWant) break;
            if (enemy.kind === "stalker") continue;
            if (farEnough(enemy)) {
                enemy.kind = "stalker";
                made += 1;
                continue;
            }
            const swapIndex = left.findIndex(farEnough);
            if (swapIndex !== -1) {
                const [cell] = left.splice(swapIndex, 1);
                enemy.x = cell.x;
                enemy.y = cell.y;
                enemy.kind = "stalker";
                made += 1;
            } else if (enemy.kind !== "wisp") {
                enemy.kind = "wisp";
            }
        }
    }

    const items: SpawnedItem[] = [];
    for (let i = 0; i < itemCount && i < left.length; i++) {
        items.push({ x: left[i].x, y: left[i].y, type: pickType(rng, energyShare) });
    }
    const itemsPlaced = items.length;

    // Tool pickups come after the gear: the cells the items did not take, with each
    // type drawn from the tools that spawn at this depth (toolsFor, game/tools.ts:
    // Cut only joins from depth 3). The count is rolled last, so leaving `tools`
    // out of the call changes neither the enemies' nor the items' placement.
    const toolCount = rollCount(rng, counts.tools ?? 0);
    const firstFreeCell = Math.min(itemCount, left.length);
    let toolsPlaced = 0;
    for (let i = 0; i < toolCount && firstFreeCell + i < left.length; i++) {
        const cell = left[firstFreeCell + i];
        items.push({ x: cell.x, y: cell.y, type: rng.pick(toolsFor(depth)) });
        toolsPlaced += 1;
    }

    // The trait pickup (E58) comes last and rolls on its own branch of the
    // rng (Rng.clone): the drop never disturbs the enemies' or the items'
    // placement, and a level without candidates reads exactly like a level
    // before the trait card. It takes the first free cell the gear and tools
    // did not use; when no cell is free, the roll still happens but nothing drops.
    const roll = rollTraitDrop(rng.clone(), depth, options.traits ?? []);
    let trait: SpawnedTrait | null = null;
    if (roll !== null) {
        const cell = left[itemsPlaced + toolsPlaced];
        if (cell !== undefined) trait = { x: cell.x, y: cell.y, ...roll };
    }

    return { items, enemies, trait };
}
