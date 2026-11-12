// The four enemy kinds: their numbers, the depth each first appears at and the
// seeded draw enemyFor. Pure data and one seeded choice: no DOM, no clocks, no
// global randomness. The energy a fight really costs is fightCost(stats, enemy) in
// game/combat.ts; the baseCost below is what that formula gives at the default
// stats (attack 1, defense 1).
import { CONFIG } from "./config";
import type { Rng } from "./rng";

export type EnemyKind = "wisp" | "brute" | "warden" | "stalker";

export interface EnemyDef {
    /** Hit points on the enemy's side of the cost formula. */
    hp: number;
    /** Attack on the enemy's side of the cost formula. */
    power: number;
    /** The first depth this kind can be drawn at. */
    fromDepth: number;
    /** Gear pickups dropped at once when one is beaten. */
    drops: number;
    /** fightCost at the default stats (attack 1, defense 1): the toll a fresh run sees. */
    baseCost: number;
}

/** The three kinds with the numbers from game/config.ts. */
export const ENEMY_KINDS: Record<EnemyKind, EnemyDef> = {
    wisp: { ...CONFIG.enemyKinds.wisp },
    brute: { ...CONFIG.enemyKinds.brute },
    warden: { ...CONFIG.enemyKinds.warden },
    stalker: { ...CONFIG.enemyKinds.stalker },
};

/** The kinds in table order. */
export const ENEMY_KIND_LIST: readonly EnemyKind[] = ["wisp", "brute", "warden", "stalker"];

/** The kinds that are not the cheap one: these pay gear and stay off the opening route. */
export function isHeavy(kind: EnemyKind): boolean {
    return ENEMY_KINDS[kind].drops > 0;
}

/**
 * The kind of one enemy at this depth, drawn from the rng. The stalker is never
 * drawn here: the spawner assigns that kind to one or two of the level's enemies
 * (game/spawn.ts), so this draw stays the wisp / brute / warden table.
 * below brute.fromDepth always "wisp"; between brute.fromDepth and warden.fromDepth
 * 70% wisp / 30% brute; from warden.fromDepth 50% wisp / 35% brute / 15% warden.
 * A depth below 1 (or not a number) counts as 1. Only depths that can draw more
 * than the wisp consume the rng.
 */
export function enemyFor(depth: number, rng: Rng): EnemyKind {
    const d = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
    if (d < ENEMY_KINDS.brute.fromDepth) return "wisp";
    const roll = rng.next();
    if (d < ENEMY_KINDS.warden.fromDepth) {
        return roll < CONFIG.enemyShares.mid.wisp ? "wisp" : "brute";
    }
    if (roll < CONFIG.enemyShares.high.wisp) return "wisp";
    if (roll < CONFIG.enemyShares.high.wisp + CONFIG.enemyShares.high.brute) return "brute";
    return "warden";
}
