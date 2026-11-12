// Every tunable number of the run rules in one place. Pure data: no DOM, no clocks,
// no global randomness. Ported from lib/GameState.ts and lib/maze.ts.

export const CONFIG = {
    /** Side length of the level-1 maze (and of level 2: the size steps every two levels). */
    startSize: 5,
    /** Cells added to each side per size step of the depth curve (game/plan.ts). */
    sizeStep: 2,
    /** Levels per size step: the size grows every this many levels. */
    sizeEveryLevels: 2,
    /** Largest maze the depth curve reaches. */
    maxSize: 13,
    /** Maze shifts applied to the maze after each successful move at depth 1. */
    baseShifts: 3,
    /** Largest number of shifts per move the depth curve reaches. */
    maxShifts: 9,
    /** Fewest pickups a level holds. */
    minItems: 2,
    /** Most enemies a level holds. */
    maxEnemies: 6,
    /** Chance that a pickup is "energy"; the other five types share the rest evenly. */
    energyShare: 0.4,
    /** Energy added on top of what is left when the exit is reached (capped at storage). */
    exitBonus: 50,
    /** Tiles across the dark aura that sits under the Knot (lib/board.ts passes it to blobRect). */
    blobTiles: 4,
    /** Milliseconds between steps while a direction is held (game/stepper.ts). */
    stepMs: 110,
    /** Milliseconds from the first step to the second while a key stays down. */
    firstRepeatMs: 170,
    /** Milliseconds per 1 energy of the idle clock (multiplied by stats.speed). */
    drainMs: 150,
    /** Energy at the start of the run (also the floor, storage may raise it). */
    startEnergy: 100,
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
    /** Fight maths: cost = round(hp / max(0.1, attack) * max(1, power - defense)) clamped to 1..999 (game/combat.ts). */
    enemy: { hp: 3, power: 6 },
} as const;
