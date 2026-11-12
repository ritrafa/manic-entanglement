// The pure maths of a fight: how much energy defeating one enemy costs.
// No DOM, no clocks, no global randomness.

import { CONFIG } from "./config";

/** The fighter's side of the cost: only attack and defense matter. */
export interface FightStats {
    attack: number;
    defense: number;
}

/** The enemy's side of the cost. */
export interface FightEnemy {
    hp: number;
    power: number;
}

/** Attack below this is treated as this: an attack of 0 cannot make the cost infinite. */
const MIN_ATTACK = 0.1;
/** The damage difference never drops below this: a defense above the power cannot give energy back. */
const MIN_POWER_DIFF = 1;
/** A fight always costs at least this and never more than MAX_COST energy. */
const MIN_COST = 1;
const MAX_COST = 999;

/** The value itself when it is a finite number, the fallback otherwise. */
function finite(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

/**
 * The energy defeating this enemy costs with these stats:
 * `round(enemy.hp / max(0.1, attack) * max(1, enemy.power - defense))` clamped to 1..999.
 * A stat or enemy number that is not a finite number counts as its default
 * (attack 1, defense 1, the config enemy), so the result is always a whole number in 1..999.
 */
export function fightCost(stats: FightStats, enemy: FightEnemy): number {
    const attack = Math.max(MIN_ATTACK, finite(stats.attack, 1));
    const defense = finite(stats.defense, 1);
    const hp = finite(enemy.hp, CONFIG.enemy.hp);
    const power = finite(enemy.power, CONFIG.enemy.power);
    const raw = (hp / attack) * Math.max(MIN_POWER_DIFF, power - defense);
    const cost = Math.round(raw);
    if (!Number.isFinite(cost)) return MAX_COST; // unreachable with the guards above, kept as a belt
    return Math.min(MAX_COST, Math.max(MIN_COST, cost));
}
