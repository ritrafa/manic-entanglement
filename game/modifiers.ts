// The entanglements: named twists that depth ties to every third level from
// MODIFIER_RULES.firstDepth. Blackout dims what is far away, Storm doubles the
// maze shifts and pays the exit more, Hoard doubles the pickups and adds two
// enemies. Pure data and pure functions: no DOM, no clocks, no global randomness;
// the draw comes from the caller's rng and consumes it only when a twist lands.

import { MODIFIER_RULES } from "./config";
import type { LevelPlan } from "./plan";
import type { Rng } from "./rng";

/** The three twists a level can carry. */
export type ModifierId = "blackout" | "storm" | "hoard";

/** The three ids in draw order; rng.pick over this decides the level's twist. */
export const MODIFIER_IDS: readonly ModifierId[] = ["blackout", "storm", "hoard"];

/** How each twist presents itself: the name and one short line for the banner. */
export const MODIFIER_INFO: Record<ModifierId, { name: string; line: string }> = {
    blackout: { name: "Blackout", line: "You see only what is near you, the Knot and the exit." },
    storm: { name: "Storm", line: "The maze shifts twice as fast; the exit pays 25 more energy." },
    hoard: { name: "Hoard", line: "Twice the pickups, two more enemies wait in the maze." },
};

/** A LevelPlan as the run builds it: the plan plus Blackout's vision radius. */
export type ModifiedPlan = LevelPlan & {
    /** Cells the player can see on a Blackout level (Chebyshev radius); absent otherwise. */
    vision?: number;
};

/**
 * The twist depth is entangled with, or null: only depths from firstDepth that
 * are a multiple of everyDepths carry one, chosen uniformly with the rng. The
 * rng is consumed only when a twist lands, so plain depths cost it nothing.
 */
export function modifierFor(depth: number, rng: Rng): ModifierId | null {
    if (!Number.isFinite(depth)) return null;
    const d = Math.floor(depth);
    if (d < MODIFIER_RULES.firstDepth || d % MODIFIER_RULES.everyDepths !== 0) return null;
    return rng.pick(MODIFIER_IDS);
}

/** The plan as the entangled level builds it; null leaves it unchanged. Never mutates the input. */
export function applyModifier(plan: LevelPlan, id: ModifierId | null): ModifiedPlan {
    const base: ModifiedPlan = { ...plan, items: [plan.items[0], plan.items[1]] };
    if (id === "storm") {
        return {
            ...base,
            shifts: Math.min(MODIFIER_RULES.stormShiftMax, plan.shifts * MODIFIER_RULES.stormShiftFactor),
            exitBonus: plan.exitBonus + MODIFIER_RULES.stormExitBonus,
        };
    }
    if (id === "hoard") {
        return {
            ...base,
            items: [plan.items[0] * MODIFIER_RULES.hoardItemsFactor, plan.items[1] * MODIFIER_RULES.hoardItemsFactor],
            enemies: plan.enemies + MODIFIER_RULES.hoardExtraEnemies,
        };
    }
    if (id === "blackout") {
        return { ...base, vision: MODIFIER_RULES.blackoutVision };
    }
    return base;
}

/** What Blackout asks about: the board, the viewer and what must stay lit. */
export interface VisionInput {
    /** Side length of the square maze. */
    size: number;
    /** The player's cell. */
    player: { x: number; y: number };
    /** The Knot's cell (the maze origin). */
    knot: { x: number; y: number };
    /** The exit's cell. */
    exit: { x: number; y: number };
    /** The cells of the forecast walk; every one of them stays visible. */
    walk: readonly { x: number; y: number }[];
    /** Chebyshev radius (max(|dx|, |dy|)) seen around the player. */
    radius: number;
}

/**
 * Which cells of a Blackout level show: true within `radius` of the player
 * (by max(|dx|, |dy|)), on the Knot's cell, on every cell of the forecast
 * walk and on the exit. Indexed [y][x], size rows of size booleans.
 */
export function visibleCells(input: VisionInput): boolean[][] {
    const { size, player, knot, exit, walk, radius } = input;
    const n = Math.max(0, Math.floor(size));
    const grid: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
    const mark = (x: number, y: number): void => {
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        if (cx >= 0 && cx < n && cy >= 0 && cy < n) grid[cy][cx] = true;
    };
    const r = Math.max(0, Math.floor(radius));
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) mark(player.x + dx, player.y + dy);
    }
    mark(knot.x, knot.y);
    for (const cell of walk) mark(cell.x, cell.y);
    mark(exit.x, exit.y);
    return grid;
}
