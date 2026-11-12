// The fight maths of the run: what stepping on an enemy costs in energy. Pure data
// in, whole number out: no DOM, no audio, no clocks, no global randomness.

/** The attacker-side stats that lower a cost. */
export interface CombatStats {
    attack: number;
    defense: number;
}

/** The enemy-side numbers that raise a cost. */
export interface CombatEnemy {
    hp: number;
    power: number;
}

const DEFAULT_ATTACK = 1;
const DEFAULT_DEFENSE = 1;
const MIN_ATTACK = 0.1;
const MIN_POWER_DIFFERENCE = 1;
const MIN_COST = 1;
const MAX_COST = 999;

/**
 * The energy a fight costs: round(hp / max(0.1, attack) * max(1, power - defense)),
 * clamped to 1..999 so the result is always a whole, positive, finite number.
 * A stat that is not a finite number counts as its default (attack 1, defense 1).
 */
export function fightCost(stats: CombatStats, enemy: CombatEnemy): number {
    const attack = Number.isFinite(stats.attack) ? Math.max(MIN_ATTACK, stats.attack) : DEFAULT_ATTACK;
    const defense = Number.isFinite(stats.defense) ? stats.defense : DEFAULT_DEFENSE;
    const raw = (enemy.hp / attack) * Math.max(MIN_POWER_DIFFERENCE, enemy.power - defense);
    if (!Number.isFinite(raw)) return MAX_COST;
    return Math.min(MAX_COST, Math.max(MIN_COST, Math.round(raw)));
}
