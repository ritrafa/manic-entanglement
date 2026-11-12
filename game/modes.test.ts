import { describe, expect, it } from "vitest";
import {
    MODES,
    MODE_IDS,
    betterScore,
    cycleMode,
    dailySeed,
    type ModeId,
} from "@/game/modes";

describe("MODES", () => {
    it("holds exactly the four ids, in order", () => {
        expect([...MODE_IDS]).toEqual(["descent", "sprint", "zen", "daily"]);
        expect(Object.keys(MODES).sort()).toEqual([...MODE_IDS].sort());
    });

    it("gives every mode a non-empty name and a short non-empty blurb", () => {
        for (const id of MODE_IDS) {
            const mode = MODES[id];
            expect(mode.id).toBe(id);
            expect(mode.name.length).toBeGreaterThan(0);
            expect(mode.blurb.length).toBeGreaterThan(0);
            expect(mode.blurb.length).toBeLessThanOrEqual(60);
        }
    });

    it("carries the rules each mode plays by", () => {
        expect(MODES.descent).toMatchObject({ clock: true, stepFactor: 1, levels: null, gear: true, seed: "random", scoring: "score" });
        expect(MODES.sprint).toMatchObject({ clock: true, stepFactor: 1, levels: 5, gear: false, seed: "random", scoring: "time" });
        expect(MODES.zen).toMatchObject({ clock: false, stepFactor: 2, levels: null, gear: true, seed: "random", scoring: "score" });
        expect(MODES.daily).toMatchObject({ clock: true, stepFactor: 1, levels: null, gear: false, seed: "daily", scoring: "score" });
    });
});

describe("dailySeed", () => {
    it("is stable and separates neighbouring days", () => {
        expect(dailySeed(20261112)).toBe(dailySeed(20261112));
        expect(dailySeed(20261112)).not.toBe(dailySeed(20261113));
    });

    it("stays a whole number in 0..2^32 - 1", () => {
        for (const day of [0, 1, 20260101, 20261112, 20261231, 99999999, 2 ** 31, 2 ** 32]) {
            const seed = dailySeed(day);
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(2 ** 32 - 1);
        }
        // Anything that is not a number reads as day 0 and still lands in range.
        for (const bad of [NaN, Infinity, -Infinity]) {
            const seed = dailySeed(bad);
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(2 ** 32 - 1);
        }
    });

    it("spreads a whole year of days apart", () => {
        const seeds = new Set<number>();
        for (let month = 1; month <= 12; month++) {
            for (let day = 1; day <= 28; day += 7) {
                seeds.add(dailySeed(20260000 + month * 100 + day));
            }
        }
        expect(seeds.size).toBe(48);
    });
});

describe("betterScore", () => {
    it("takes the lower time in a time mode", () => {
        expect(betterScore("sprint", 50000, 60000)).toBe(true);
        expect(betterScore("sprint", 60000, 50000)).toBe(false);
        expect(betterScore("sprint", 50000, 50000)).toBe(false);
    });

    it("takes the higher score in a score mode", () => {
        expect(betterScore("descent", 500, 600)).toBe(false);
        expect(betterScore("descent", 600, 500)).toBe(true);
        expect(betterScore("zen", 600, 500)).toBe(true);
        expect(betterScore("daily", 500, 600)).toBe(false);
    });

    it("lets any value beat no value at all", () => {
        expect(betterScore("zen", 1, undefined)).toBe(true);
        expect(betterScore("sprint", 9_999_999, undefined)).toBe(true);
        expect(betterScore("descent", 0, undefined)).toBe(true);
    });
});

describe("cycleMode", () => {
    it("steps forward and back with wrap-around", () => {
        expect(cycleMode("descent", -1)).toBe("daily");
        expect(cycleMode("daily", 1)).toBe("descent");
        expect(cycleMode("descent", 1)).toBe("sprint");
        expect(cycleMode("sprint", 1)).toBe("zen");
        expect(cycleMode("zen", 1)).toBe("daily");
        expect(cycleMode("zen", -1)).toBe("sprint");
    });

    it("comes back to itself after a full lap, any step size", () => {
        for (const id of MODE_IDS) {
            expect(cycleMode(id, 4)).toBe(id);
            expect(cycleMode(id, -4)).toBe(id);
            expect(cycleMode(id, 0)).toBe(id);
            expect(cycleMode(id, 2)).toBe(MODES[MODE_IDS[(MODE_IDS.indexOf(id) + 2) % 4]].id);
        }
    });

    it("starts from the first mode for an id that is not one", () => {
        expect(cycleMode("nope" as ModeId, 1)).toBe("sprint");
        expect(cycleMode("nope" as ModeId, 0)).toBe("descent");
    });
});
