// The four ways to play as pure data: one record of rules per mode, the daily
// seed hash, the best-score comparison and the title menu's mode cycling.
// Pure: no DOM, no clocks, no Date — the shell passes the date number in.

/** The four modes, in the order the title menu offers them. */
export type ModeId = "descent" | "sprint" | "zen" | "daily";

/** Every mode id, in title-menu order. */
export const MODE_IDS: readonly ModeId[] = ["descent", "sprint", "zen", "daily"];

/** How one mode plays: everything the run and the shell steer by. */
export interface ModeRules {
    id: ModeId;
    /** The name the title menu and the summary show. */
    name: string;
    /** One short sentence under the name; never over 60 characters. */
    blurb: string;
    /** False means the energy clock never drains (the tally still counts time). */
    clock: boolean;
    /** What a step costs on top of the stats' consumption: 2 makes steps double. */
    stepFactor: number;
    /** How many levels the run has, or null for endless descent. */
    levels: number | null;
    /** False keeps the bank out of the run: base stats, and gear gives energy. */
    gear: boolean;
    /** "daily" pins the seed to the calendar day; "random" is the shell's call. */
    seed: "random" | "daily";
    /** "time" modes rank by milliseconds (lower wins); "score" modes by score. */
    scoring: "score" | "time";
}

/** The four modes' rules, keyed by id. */
export const MODES: Record<ModeId, ModeRules> = {
    descent: {
        id: "descent", name: "Descent", blurb: "Go as deep as you can, with your gear.",
        clock: true, stepFactor: 1, levels: null, gear: true, seed: "random", scoring: "score",
    },
    sprint: {
        id: "sprint", name: "Sprint", blurb: "Five levels, no gear, fastest time wins.",
        clock: true, stepFactor: 1, levels: 5, gear: false, seed: "random", scoring: "time",
    },
    zen: {
        id: "zen", name: "Zen", blurb: "No clock. Study the maze; steps cost double.",
        clock: false, stepFactor: 2, levels: null, gear: true, seed: "random", scoring: "score",
    },
    daily: {
        id: "daily", name: "Daily", blurb: "One seed a day, the same maze for everyone.",
        clock: true, stepFactor: 1, levels: null, gear: false, seed: "daily", scoring: "score",
    },
};

/**
 * The run seed for one calendar day: a 32-bit hash of the yyyymmdd number, so
 * everyone playing the same day gets the same maze. The result is always a
 * whole number from 0 to 2^32 - 1; anything not a number reads as day 0.
 */
export function dailySeed(yyyymmdd: number): number {
    // Murmur3's finalizer: three avalanche rounds so neighbouring days differ wildly.
    let x = Math.floor(Number.isFinite(yyyymmdd) ? yyyymmdd : 0) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
}

/**
 * Is `a` a better result than `b` for this mode? Score modes take the higher
 * number, time modes the lower (milliseconds); any value beats no value at all.
 */
export function betterScore(mode: ModeId, a: number, b: number | undefined): boolean {
    if (b === undefined) return true;
    const rules = MODES[mode];
    return rules !== undefined && rules.scoring === "time" ? a < b : a > b;
}

/**
 * The mode id `step` places away from `id` in `MODE_IDS`, wrapping around at
 * both ends: the title menu's arrows step by 1 or -1. An unknown id starts
 * from the first mode; a fractional step floors toward zero, a broken one is 0.
 */
export function cycleMode(id: ModeId, step: number): ModeId {
    const count = MODE_IDS.length;
    const at = MODE_IDS.indexOf(id);
    const base = at === -1 ? 0 : at;
    const delta = Number.isFinite(step) ? Math.trunc(step) : 0;
    return MODE_IDS[((base + delta) % count + count) % count];
}
