import { describe, expect, it } from "vitest";
import {
    GEAR_IDS,
    addGear,
    countGear,
    gearCap,
    noGear,
    sanitizeGear,
    statsFromGear,
    type GearId,
    type GearLevels,
} from "@/game/gear";

/** The stat each gear kind alone drives, and the limit it must never pass. */
const STAT_OF: Record<GearId, "attack" | "defense" | "consumption" | "speed" | "storage"> = {
    gloves: "attack",
    shield: "defense",
    boots: "consumption",
    speed: "speed",
    backpack: "storage",
};

/** Levels with one kind raised to `level`, everything else at 0. */
function levelsOf(id: GearId, level: number): GearLevels {
    return { ...noGear(), [id]: level };
}

describe("noGear", () => {
    it("is zero for every kind, a fresh object each call", () => {
        expect(noGear()).toEqual({ boots: 0, gloves: 0, shield: 0, speed: 0, backpack: 0 });
        const a = noGear();
        a.gloves = 3;
        expect(noGear().gloves).toBe(0);
    });

    it("covers exactly the five gear kinds", () => {
        expect([...GEAR_IDS].sort()).toEqual(["backpack", "boots", "gloves", "shield", "speed"]);
    });
});

describe("statsFromGear", () => {
    it("gives the starting numbers for no gear at all", () => {
        expect(statsFromGear(noGear())).toEqual({
            attack: 1,
            defense: 1,
            speed: 1,
            consumption: 1,
            storage: 100,
        });
    });

    it("follows the formulas for a few known levels", () => {
        expect(statsFromGear(levelsOf("gloves", 3)).attack).toBeCloseTo(1.3, 10);
        expect(statsFromGear(levelsOf("shield", 5)).defense).toBeCloseTo(1.5, 10);
        expect(statsFromGear(levelsOf("boots", 2)).consumption).toBeCloseTo(0.98 * 0.98, 10);
        expect(statsFromGear(levelsOf("speed", 2)).speed).toBeCloseTo(1.02 * 1.02, 10);
        expect(statsFromGear(levelsOf("backpack", 4)).storage).toBe(120);
    });

    it("moves every stat monotonically in its own kind", () => {
        for (const id of GEAR_IDS) {
            const stat = STAT_OF[id];
            let previous = statsFromGear(levelsOf(id, 0))[stat];
            for (let level = 1; level <= 60; level++) {
                const now = statsFromGear(levelsOf(id, level))[stat];
                const better = stat === "consumption" ? now <= previous : now >= previous;
                expect(better, `${id} level ${level}: ${stat} ${previous} -> ${now}`).toBe(true);
                previous = now;
            }
        }
    });

    it("never passes the limit, even at level 1000", () => {
        const huge = {} as GearLevels;
        for (const id of GEAR_IDS) huge[id] = 1000;
        expect(statsFromGear(huge)).toEqual({
            attack: 3,
            defense: 3,
            speed: 1.5,
            consumption: 0.6,
            storage: 200,
        });
    });

    it("ignores whatever the other kinds are", () => {
        const only = statsFromGear(levelsOf("gloves", 7));
        const mixed = statsFromGear({ ...levelsOf("gloves", 7), boots: 12, backpack: 3 });
        expect(mixed.attack).toBe(only.attack);
    });
});

describe("gearCap", () => {
    it("is the listed level for every kind", () => {
        expect(gearCap("gloves")).toBe(20);
        expect(gearCap("shield")).toBe(20);
        expect(gearCap("boots")).toBe(26);
        expect(gearCap("speed")).toBe(21);
        expect(gearCap("backpack")).toBe(20);
    });

    it("lands each stat exactly on its limit, one below does not", () => {
        const limits = { attack: 3, defense: 3, consumption: 0.6, speed: 1.5, storage: 200 } as const;
        for (const id of GEAR_IDS) {
            const stat = STAT_OF[id];
            expect(statsFromGear(levelsOf(id, gearCap(id)))[stat], `${id} at the cap`).toBe(limits[stat]);
            const oneShort = statsFromGear(levelsOf(id, gearCap(id) - 1))[stat];
            const stillShort = stat === "consumption" ? oneShort > limits[stat] : oneShort < limits[stat];
            expect(stillShort, `${id} one below the cap`).toBe(true);
        }
    });
});

describe("sanitizeGear", () => {
    it("floors fractions, clamps to the cap and zeroes what is not a number", () => {
        expect(sanitizeGear({ boots: 3.7, gloves: -2, shield: "x", speed: 999 })).toEqual({
            boots: 3,
            gloves: 0,
            shield: 0,
            speed: 21,
            backpack: 0,
        });
    });

    it("keeps whole levels inside 0..cap untouched", () => {
        const levels = { boots: 26, gloves: 20, shield: 1, speed: 0, backpack: 20 };
        expect(sanitizeGear(levels)).toEqual(levels);
    });

    it("gives noGear for anything that is not a record of numbers", () => {
        expect(sanitizeGear(undefined)).toEqual(noGear());
        expect(sanitizeGear(null)).toEqual(noGear());
        expect(sanitizeGear("gloves")).toEqual(noGear());
        expect(sanitizeGear(7)).toEqual(noGear());
        expect(sanitizeGear([])).toEqual(noGear());
        expect(sanitizeGear({ gloves: Number.NaN })).toEqual(noGear());
        expect(sanitizeGear({ gloves: Number.POSITIVE_INFINITY })).toEqual(noGear());
        expect(sanitizeGear({ gloves: 5, unknown: 9 })).toEqual({ ...noGear(), gloves: 5 });
    });
});

describe("addGear", () => {
    it("sums level by level", () => {
        expect(
            addGear({ ...noGear(), gloves: 2, boots: 3 }, { ...noGear(), gloves: 5, backpack: 1 }),
        ).toEqual({ ...noGear(), gloves: 7, boots: 3, backpack: 1 });
    });

    it("never goes past the cap", () => {
        const near = { ...noGear(), speed: 20 };
        expect(addGear(near, near).speed).toBe(21);
        expect(addGear({ ...noGear(), boots: 26 }, noGear()).boots).toBe(26);
    });

    it("is noGear-neutral", () => {
        const levels = { ...noGear(), shield: 9 };
        expect(addGear(levels, noGear())).toEqual(levels);
    });
});

describe("countGear", () => {
    it("counts one per level", () => {
        expect(countGear(noGear())).toBe(0);
        expect(countGear({ boots: 26, gloves: 20, shield: 2, speed: 21, backpack: 20 })).toBe(89);
        expect(countGear(levelsOf("gloves", 1))).toBe(1);
    });
});
