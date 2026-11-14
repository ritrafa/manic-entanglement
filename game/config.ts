// Every tunable number of the run rules in one place. Pure data: no DOM, no clocks,
// no global randomness. Ported from lib/GameState.ts and lib/maze.ts.

export const CONFIG = {
    /** Side length of the level-1 maze (and of level 2: the size steps every two levels). */
    startSize: 5,
    /** Cells added to each side per size step of the depth curve (game/plan.ts). */
    sizeStep: 2,
    /** Levels per size step: the size grows every this many levels. */
    sizeEveryLevels: 2,
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
    /** Successful moves an Anchor freezes the maze for (game/tools.ts, game/run.ts). */
    anchorMoves: 6,
    /** Most charges of one tool a run can carry at a time (game/run.ts). */
    toolMax: 3,
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
    /** Energy lost when a move ends on the Knot's cell (game/run.ts). */
    knotHurt: 5,
    /** Per-pickup effects, keyed by item type (gear lives in GEAR_RULES below). */
    pickups: {
        /** Energy restored by an "energy" pickup (capped at storage). */
        energy: 25,
    },
    /** Fight maths: cost = round(hp / max(0.1, attack) * max(1, power - defense)) clamped to 1..999 (game/combat.ts). */
    enemy: { hp: 3, power: 6 },
    /**
     * The four enemy kinds (game/enemies.ts): the hp/power fed to the fight formula,
     * the first depth each can be drawn at, the gear pickups it drops when beaten and
     * the cost the fight formula gives at the default stats (attack 1, defense 1).
     * The stalker is never drawn by enemyFor: the spawner assigns the kind (game/spawn.ts).
     */
    enemyKinds: {
        wisp: { hp: 3, power: 6, fromDepth: 1, drops: 0, baseCost: 15 },
        brute: { hp: 6, power: 6, fromDepth: 3, drops: 1, baseCost: 30 },
        warden: { hp: 9, power: 7, fromDepth: 6, drops: 2, baseCost: 54 },
        stalker: { hp: 3, power: 6, fromDepth: 4, drops: 0, baseCost: 15 },
    },
    /** Successful player moves between two steps of one stalker (game/run.ts). */
    stalkerEvery: 2,
    /** Manhattan distance (|dx| + |dy|) a stalker keeps from the start at spawn (game/spawn.ts). */
    stalkerMinDist: 4,
    /** From this depth a level holds two stalkers instead of one (game/spawn.ts). */
    stalkerPairDepth: 8,
    /** enemyFor's draw (game/enemies.ts): shares per depth band, each band summing to 1. */
    enemyShares: {
        /** Depths from brute.fromDepth up to warden.fromDepth. */
        mid: { wisp: 0.7, brute: 0.3 },
        /** Depths from warden.fromDepth on. */
        high: { wisp: 0.5, brute: 0.35, warden: 0.15 },
    },
} as const;

// --- Gear (game/gear.ts, owner decision Q10) ------------------------------------------
// Gear helps from the moment it is picked up, becomes permanent when the level's
// exit is reached, and is lost when the run dies before that. Each kind has a
// cap: the smallest level at which its stat reaches its limit.

export const GEAR_RULES = {
    /** attack = min(attackMax, attackBase + attackStep * gloves). */
    attackBase: 1,
    attackStep: 0.1,
    attackMax: 3,
    /** defense = min(defenseMax, defenseBase + defenseStep * shield). */
    defenseBase: 1,
    defenseStep: 0.1,
    defenseMax: 3,
    /** consumption = max(consumptionMin, consumptionBase * bootsFactor ^ boots). */
    consumptionBase: 1,
    bootsFactor: 0.98,
    consumptionMin: 0.6,
    /** speed = min(speedMax, speedBase * speedFactor ^ speed). */
    speedBase: 1,
    speedFactor: 1.02,
    speedMax: 1.5,
    /** storage = min(storageMax, storageBase + storageStep * backpack). */
    storageBase: 100,
    storageStep: 5,
    storageMax: 200,
    /** The smallest level at which each kind's stat sits at its limit. */
    caps: { boots: 26, gloves: 20, shield: 20, speed: 21, backpack: 20 },
    /** Energy given instead when a gear pickup arrives at the cap. */
    maxedEnergy: 10,
    /** Energy a backpack adds on top of the storage it brings. */
    backpackEnergy: 5,
} as const;

// --- Score rules (game/score.ts, owner decision Q9) -----------------------------------
// Steps earn nothing: the score comes from depth, leftover energy, kills and pickups.

/** Points per level of depth in levelScore's `100 * level` term. */
export const LEVEL_SCORE_BASE = 100;
/** Points for defeating one enemy. */
export const KILL_SCORE = 25;
/** Points for collecting one pickup. */
export const PICKUP_SCORE = 10;

// --- Juice (game/fx.ts decides, lib/board.ts draws) -----------------------------------
// Every duration in milliseconds and every count of the effects bus. The shell
// rate-limits shakes and flashes with these; lib/board.ts caps the particles.

export const FX = {
    /** Particles a pickup burst throws. */
    pickupBurstCount: 5,
    /** Particles a fight burst throws. */
    fightBurstCount: 8,
    /** Particles the level-clear burst throws at the exit. */
    clearBurstCount: 14,
    /** Hard cap: no burst ever throws more particles than this. */
    maxBurstCount: 20,
    /** At most this many .spark particles alive on the fx layer at once. */
    maxParticles: 60,
    /** Milliseconds a spark flies (the CSS animation's length). */
    sparkMs: 600,
    /** Milliseconds the pickup pop ring takes to open and fade. */
    popMs: 350,
    /** Milliseconds of the fight's red flash. */
    fightFlashMs: 120,
    /** Particles the Knot's hurt burst throws on the cell (game/fx.ts). */
    hurtBurstCount: 4,
    /** Milliseconds of the Knot hurt's red flash (smaller than the fight's). */
    hurtFlashMs: 80,
    /** Pixels and milliseconds of the fight's board shake. */
    fightShakePx: 4,
    fightShakeMs: 150,
    /** Milliseconds the cleared maze holds (the exit burst, the gained
     *  points) before the dive into the next level begins. */
    clearZoomMs: 300,
    /** Milliseconds of the level dive: the next maze grows out of the exit
     *  square to fill the board while the reptile glides to its start. */
    levelDiveMs: 900,
    /** Milliseconds of the fade that opens a level. */
    levelStartFadeMs: 200,
    /** Milliseconds of the death flash. */
    deadFlashMs: 400,
    /** Pixels and milliseconds of the death shake. */
    deadShakePx: 8,
    deadShakeMs: 300,
    /** Hard cap: no effect lasts longer than this. */
    maxDurationMs: 500,
    /** FxLimiter: at most this many shakes within limitWindowMs. */
    maxShakesPerWindow: 3,
    /** FxLimiter: at most this many flashes within limitWindowMs. */
    maxFlashesPerWindow: 3,
    /** FxLimiter: the sliding window every limit counts inside. */
    limitWindowMs: 1000,
    /** Below this fraction of storage the board breathes the low-energy pulse. */
    lowEnergyPct: 0.25,
} as const;

// --- Entanglements (game/modifiers.ts) --------------------------------------------------
// Every third level from firstDepth carries one named twist: Blackout dims the
// far board, Storm doubles the shifts and pays the exit more, Hoard doubles
// the pickups and adds enemies. Pure data: no DOM, no clocks, no randomness.

export const MODIFIER_RULES = {
    /** The first depth that can be entangled. */
    firstDepth: 3,
    /** Only depths that are a multiple of this carry a twist. */
    everyDepths: 3,
    /** Storm: the planned shifts per move multiplied by this... */
    stormShiftFactor: 2,
    /** ...and capped at this many shifts. */
    stormShiftMax: 14,
    /** Storm: energy the exit pays on top of the plan's exit bonus. */
    stormExitBonus: 25,
    /** Hoard: both ends of the pickup count range multiplied by this. */
    hoardItemsFactor: 2,
    /** Hoard: enemies added to the level. */
    hoardExtraEnemies: 2,
    /** Blackout: Chebyshev radius (max(|dx|, |dy|)) the player can see. */
    blackoutVision: 2,
    /** Milliseconds the banner naming the twist stays over the board. */
    bannerMs: 2000,
} as const;
