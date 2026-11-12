// One pure function decides how a level is built from its depth: the maze size, the
// shifts per move, the pickup count range, the energy share of the pickups, the enemy
// count and the exit bonus. Every number comes from CONFIG; no DOM, no clocks, no
// global randomness. The curve: one size step every two levels up to 13 x 13, shifts
// from 3 to 9 per move, 2 to 2 + floor(size / 3) pickups, 1 to 6 enemies.

import { CONFIG } from "./config";

/** Everything a level needs, derived from its depth alone. */
export interface LevelPlan {
    /** Side length of the maze, always odd. */
    size: number;
    /** Maze shifts after each successful move. */
    shifts: number;
    /** Pickup count range [min, max], rolled by the spawner. */
    items: [number, number];
    /** Chance that a pickup is "energy"; the other five types share the rest evenly. */
    energyShare: number;
    /** Enemies on the level. */
    enemies: number;
    /** Tool pickups on the level (game/tools.ts): 1 at depth 1 and every even depth, else 0. */
    tools: number;
    /** Energy added on top of what is left when the exit is reached. */
    exitBonus: number;
}

/** The build plan for a depth: depth below 1 is treated as 1. */
export function levelPlan(depth: number): LevelPlan {
    const d = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
    const step = Math.floor((d - 1) / 2);
    const size = Math.min(CONFIG.maxSize, CONFIG.startSize + CONFIG.sizeStep * step);
    return {
        size,
        shifts: Math.min(CONFIG.maxShifts, CONFIG.baseShifts + step),
        items: [CONFIG.minItems, CONFIG.minItems + Math.floor(size / 3)],
        energyShare: CONFIG.energyShare,
        enemies: Math.min(CONFIG.maxEnemies, 1 + Math.floor(d / 2)),
        exitBonus: CONFIG.exitBonus,
        tools: d === 1 || d % 2 === 0 ? 1 : 0,
    };
}
