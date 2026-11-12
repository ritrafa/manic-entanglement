// Every tunable number of the run rules in one place. Pure data: no DOM, no clocks,
// no global randomness. Ported from lib/GameState.ts and lib/maze.ts.

export const CONFIG = {
    /** Side length of the level-1 maze. */
    startSize: 5,
    /** Cells added to each side per level. */
    sizeStep: 2,
    /** Origin shifts applied to the maze after each successful move. */
    shiftsPerMove: 15,
    /** Milliseconds per 1 energy of the idle clock (multiplied by stats.speed). */
    drainMs: 150,
    /** Energy at the start of every level (also the floor, storage may raise it). */
    startEnergy: 100,
    /** Pickups per level, drawn uniformly from [min, max]. */
    pickupCount: { min: 2, max: 5 },
    /** Enemies per level, drawn uniformly from [min, max]. */
    enemyCount: { min: 1, max: 3 },
    /** Per-pickup effects, keyed by item type. */
    pickups: {
        /** Energy restored by an "energy" pickup (capped at storage). */
        energy: 25,
        /** Multiplier applied to consumption by "boots". */
        boots: 0.99,
        /** Attack gained by "gloves". */
        gloves: 0.1,
        /** Defense gained by "shield". */
        shield: 0.1,
        /** Multiplier applied to speed by "speed". */
        speed: 1.01,
        /** Storage (and energy) gained by "backpack". */
        backpack: 5,
    },
    /** Fight maths: cost = round(hp / max(0.1, attack) * max(1, power - defense)) clamped to 1..999. */
    enemy: { hp: 3, power: 6 },
} as const;
