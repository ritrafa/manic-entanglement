// How a run earns points: depth with energy to spare, kills and pickups. Walking
// back and forth earns nothing. Pure data: no DOM, no clocks, no global randomness.

import { LEVEL_SCORE_BASE } from "./config";

// The two flat awards live in game/config.ts next to the rest of the tunables.
export { KILL_SCORE, PICKUP_SCORE } from "./config";

export interface LevelAward {
    /** The level that was cleared. */
    level: number;
    /** Energy as it is on arrival at the exit, before the exit bonus. */
    energyLeft: number;
}

/**
 * Points for clearing a level: `100 * level + floor(max(0, energyLeft))`. A negative
 * or NaN energy counts as 0, so the award never dips below the depth term.
 */
export function levelScore({ level, energyLeft }: LevelAward): number {
    const spare = Number.isFinite(energyLeft) && energyLeft > 0 ? energyLeft : 0;
    return LEVEL_SCORE_BASE * level + Math.floor(spare);
}
