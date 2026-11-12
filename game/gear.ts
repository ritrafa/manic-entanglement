// The run's long-term progress: five kinds of gear, each with a capped level.
// The bank holds the levels kept by reaching exits; a run carries what it has
// picked up since its last exit. Pure data: no DOM, no clocks, no randomness.

import { GEAR_RULES } from "./config";

/** The five kinds of gear pickup (the sixth pickup, "energy", is not gear). */
export type GearId = "boots" | "gloves" | "shield" | "speed" | "backpack";

/** Every gear id, in pickup-table order. */
export const GEAR_IDS: readonly GearId[] = ["boots", "gloves", "shield", "speed", "backpack"];

/** One level per gear kind; 0 means nothing of that kind. */
export type GearLevels = Record<GearId, number>;

/** The run's five numbers, all derived from gear levels (game/run.ts). */
export interface Stats {
    attack: number;
    defense: number;
    speed: number;
    consumption: number;
    storage: number;
}

/** A fresh set of levels: nothing owned, nothing carried. */
export function noGear(): GearLevels {
    return { boots: 0, gloves: 0, shield: 0, speed: 0, backpack: 0 };
}

/** The smallest level at which this kind's stat reaches its limit. */
export function gearCap(id: GearId): number {
    return GEAR_RULES.caps[id];
}

/** The five numbers a set of gear levels gives: every stat monotonic in its
 * kind and never past its limit, whatever the level. */
export function statsFromGear(levels: GearLevels): Stats {
    const safe = sanitizeGear(levels);
    return {
        attack: Math.min(GEAR_RULES.attackMax, GEAR_RULES.attackBase + GEAR_RULES.attackStep * safe.gloves),
        defense: Math.min(GEAR_RULES.defenseMax, GEAR_RULES.defenseBase + GEAR_RULES.defenseStep * safe.shield),
        consumption: Math.max(
            GEAR_RULES.consumptionMin,
            GEAR_RULES.consumptionBase * Math.pow(GEAR_RULES.bootsFactor, safe.boots),
        ),
        speed: Math.min(GEAR_RULES.speedMax, GEAR_RULES.speedBase * Math.pow(GEAR_RULES.speedFactor, safe.speed)),
        storage: Math.min(GEAR_RULES.storageMax, GEAR_RULES.storageBase + GEAR_RULES.storageStep * safe.backpack),
    };
}

/**
 * Levels from anything stored: whole numbers clamped into 0..cap; a missing,
 * non-numeric or non-finite entry is 0. A fraction floors down (3.7 reads as 3).
 */
export function sanitizeGear(value: unknown): GearLevels {
    const levels = noGear();
    if (typeof value !== "object" || value === null) return levels;
    const source = value as Record<string, unknown>;
    for (const id of GEAR_IDS) {
        const raw = source[id];
        if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
        levels[id] = Math.min(gearCap(id), Math.max(0, Math.floor(raw)));
    }
    return levels;
}

/** Level-wise sum of two sets of levels, each kind capped. */
export function addGear(a: GearLevels, b: GearLevels): GearLevels {
    const levels = noGear();
    for (const id of GEAR_IDS) {
        levels[id] = Math.min(gearCap(id), a[id] + b[id]);
    }
    return levels;
}

/** How many pieces a set of levels holds in total (one per level). */
export function countGear(levels: GearLevels): number {
    return GEAR_IDS.reduce((total, id) => total + levels[id], 0);
}

/** The display name of a gear kind, for pickup texts. */
export const GEAR_NAMES: Record<GearId, string> = {
    boots: "Boots",
    gloves: "Gloves",
    shield: "Shield",
    speed: "Speed",
    backpack: "Backpack",
};
