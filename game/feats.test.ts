import { describe, expect, it } from "vitest";
import {
    FEATS,
    evaluateFeats,
    featById,
    featProgress,
    updateTotals,
} from "@/game/feats";
import type { Tally } from "@/game/run";
import { TOOL_IDS } from "@/game/tools";

/** A made-up finished run: nothing done, standing on level 1, in Descent. */
function fakeTally(over: Partial<Tally> = {}): Tally {
    return {
        moves: 0, ms: 0, kills: 0, pickups: 0, bumps: 0, depth: 1, cleared: 0, lostToFights: 0,
        minExitEnergy: null, wardens: 0, toolsUsed: { anchor: 0, twist: 0, cut: 0 },
        darkCleared: 0, banked: 0, mode: "descent", ...over,
    };
}

const NO_TOTALS: Record<string, number> = {};


describe("FEATS", () => {
    it("is a dozen strong with unique ids", () => {
        expect(FEATS.length).toBeGreaterThanOrEqual(8);
        const ids = FEATS.map((feat) => feat.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("every feat has a name and a short text", () => {
        for (const feat of FEATS) {
            expect(feat.id.length, feat.id).toBeGreaterThan(0);
            expect(feat.name.length, feat.id).toBeGreaterThan(0);
            expect(feat.text.length, feat.id).toBeGreaterThan(0);
            expect(feat.text.length, `${feat.id}: ${feat.text}`).toBeLessThanOrEqual(80);
            expect(typeof feat.test).toBe("function");
        }
    });

    it("featById finds by id and answers null for anything else", () => {
        expect(featById("first-exit")?.name).toBe(FEATS[0].name);
        expect(featById("no-such-feat")).toBeNull();
    });
});

describe("evaluateFeats", () => {
    it("a first clear earns first-exit and nothing else", () => {
        const tally = fakeTally({ cleared: 1 });
        expect(evaluateFeats([], tally, NO_TOTALS)).toEqual(["first-exit"]);
    });

    it("the same tally earns nothing once first-exit is already earned", () => {
        const tally = fakeTally({ cleared: 1 });
        expect(evaluateFeats(["first-exit"], tally, NO_TOTALS)).toEqual([]);
    });

    it("an earned list with an unknown id still works", () => {
        const tally = fakeTally({ cleared: 1 });
        expect(evaluateFeats(["made-up-id"], tally, NO_TOTALS)).toEqual(["first-exit"]);
        expect(evaluateFeats(["made-up-id", "first-exit"], tally, NO_TOTALS)).toEqual([]);
    });

    it("depth-5 needs depth 5: 4 does not earn it, 5 and 7 do", () => {
        expect(evaluateFeats([], fakeTally({ depth: 4 }), NO_TOTALS)).not.toContain("depth-5");
        expect(evaluateFeats([], fakeTally({ depth: 5 }), NO_TOTALS)).toContain("depth-5");
        expect(evaluateFeats([], fakeTally({ depth: 7 }), NO_TOTALS)).toContain("depth-5");
    });

    it("depth-10 needs depth 10", () => {
        expect(evaluateFeats([], fakeTally({ depth: 9 }), NO_TOTALS)).not.toContain("depth-10");
        expect(evaluateFeats([], fakeTally({ depth: 10 }), NO_TOTALS)).toContain("depth-10");
    });

    it("photo-finish: 5 earns it, 5.01 and null do not", () => {
        expect(evaluateFeats([], fakeTally({ minExitEnergy: 5 }), NO_TOTALS)).toContain("photo-finish");
        expect(evaluateFeats([], fakeTally({ minExitEnergy: 5.01 }), NO_TOTALS)).not.toContain("photo-finish");
        expect(evaluateFeats([], fakeTally({ minExitEnergy: null }), NO_TOTALS)).not.toContain("photo-finish");
        expect(evaluateFeats([], fakeTally({ minExitEnergy: 4.9 }), NO_TOTALS)).toContain("photo-finish");
    });

    it("no-toll: three clears without a fight, and not with one", () => {
        expect(evaluateFeats([], fakeTally({ cleared: 3, kills: 0 }), NO_TOTALS)).toContain("no-toll");
        expect(evaluateFeats([], fakeTally({ cleared: 3, kills: 1 }), NO_TOTALS)).not.toContain("no-toll");
        expect(evaluateFeats([], fakeTally({ cleared: 2, kills: 0 }), NO_TOTALS)).not.toContain("no-toll");
    });

    it("toll-road is judged on the totals after updateTotals", () => {
        const totals = updateTotals({ kills: 48 }, fakeTally({ kills: 2 }));
        expect(totals.kills).toBe(50);
        expect(evaluateFeats([], fakeTally({ kills: 2 }), totals)).toContain("toll-road");
        // One short of fifty, the very same run earns nothing there.
        const short = updateTotals({ kills: 47 }, fakeTally({ kills: 2 }));
        expect(evaluateFeats([], fakeTally({ kills: 2 }), short)).not.toContain("toll-road");
    });

    it("warden: beating one Warden earns it", () => {
        expect(evaluateFeats([], fakeTally({ wardens: 1 }), NO_TOTALS)).toContain("warden");
        expect(evaluateFeats([], fakeTally({ wardens: 0, kills: 9 }), NO_TOTALS)).not.toContain("warden");
    });

    it("collector is judged on the banked total", () => {
        expect(evaluateFeats([], fakeTally(), { banked: 25 })).toContain("collector");
        expect(evaluateFeats([], fakeTally(), { banked: 24 })).not.toContain("collector");
    });

    it("toolbox needs every kind of tool in one run", () => {
        const all = { anchor: 1, twist: 1, cut: 1 };
        expect(evaluateFeats([], fakeTally({ toolsUsed: all }), NO_TOTALS)).toContain("toolbox");
        for (const missing of TOOL_IDS) {
            const partial = { ...all, [missing]: 0 };
            expect(evaluateFeats([], fakeTally({ toolsUsed: partial }), NO_TOTALS)).not.toContain("toolbox");
        }
    });

    it("in-the-dark: clearing a Blackout level earns it", () => {
        expect(evaluateFeats([], fakeTally({ darkCleared: 1 }), NO_TOTALS)).toContain("in-the-dark");
        expect(evaluateFeats([], fakeTally({ cleared: 4, darkCleared: 0 }), NO_TOTALS)).not.toContain("in-the-dark");
    });

    it("sprinter: a finished Sprint under a minute, and not otherwise", () => {
        const fast = fakeTally({ mode: "sprint", cleared: 5, ms: 59_999 });
        expect(evaluateFeats([], fast, NO_TOTALS)).toContain("sprinter");
        // A Sprint that died never has all five levels cleared.
        expect(evaluateFeats([], fakeTally({ mode: "sprint", cleared: 4, ms: 30_000 }), NO_TOTALS)).not.toContain("sprinter");
        // Too slow, or another mode at the same numbers, do not earn it either.
        expect(evaluateFeats([], fakeTally({ mode: "sprint", cleared: 5, ms: 60_000 }), NO_TOTALS)).not.toContain("sprinter");
        expect(evaluateFeats([], fakeTally({ mode: "descent", cleared: 5, ms: 30_000 }), NO_TOTALS)).not.toContain("sprinter");
    });

    it("still-water: depth 8 in Zen, not in another mode", () => {
        expect(evaluateFeats([], fakeTally({ mode: "zen", depth: 8 }), NO_TOTALS)).toContain("still-water");
        expect(evaluateFeats([], fakeTally({ mode: "zen", depth: 7 }), NO_TOTALS)).not.toContain("still-water");
        expect(evaluateFeats([], fakeTally({ mode: "descent", depth: 8 }), NO_TOTALS)).not.toContain("still-water");
    });

    it("returns the new ids in FEATS order, and only the new ones", () => {
        const tally = fakeTally({ cleared: 5, depth: 5, wardens: 1 });
        const fresh = evaluateFeats(["warden"], tally, NO_TOTALS);
        const order = FEATS.map((feat) => feat.id);
        expect(fresh).toEqual(["first-exit", "depth-5", "no-toll"]);
        expect(fresh).not.toContain("warden");
        expect(order.indexOf("first-exit")).toBeLessThan(order.indexOf("depth-5"));
    });
});

describe("updateTotals", () => {
    it("counts the run into runs, kills, cleared and banked, and deepest as a maximum", () => {
        const totals = updateTotals({}, fakeTally({ kills: 4, cleared: 2, banked: 3, depth: 6 }));
        expect(totals).toEqual({ runs: 1, kills: 4, cleared: 2, banked: 3, deepest: 6 });
        const again = updateTotals(totals, fakeTally({ kills: 1, cleared: 1, banked: 0, depth: 2 }));
        expect(again).toEqual({ runs: 2, kills: 5, cleared: 3, banked: 3, deepest: 6 });
    });

    it("deepest never decreases", () => {
        const deep = updateTotals({ deepest: 12 }, fakeTally({ depth: 1 }));
        expect(deep.deepest).toBe(12);
    });

    it("keeps any other key, such as scoreRule and dailyDay", () => {
        const totals = updateTotals({ scoreRule: 2, dailyDay: 20240601 }, fakeTally({ kills: 1 }));
        expect(totals.scoreRule).toBe(2);
        expect(totals.dailyDay).toBe(20240601);
        expect(totals.kills).toBe(1);
    });

    it("does not mutate its input", () => {
        const before = { runs: 3, kills: 10, deepest: 4, scoreRule: 2 };
        const frozen = { ...before };
        const after = updateTotals(before, fakeTally({ kills: 5, cleared: 1, banked: 2, depth: 9 }));
        expect(before).toEqual(frozen);
        expect(after).not.toBe(before);
        expect(after.runs).toBe(4);
        expect(after.kills).toBe(15);
        expect(after.deepest).toBe(9);
    });
});

describe("featProgress", () => {
    it("counts the known ids out of all the feats there is", () => {
        expect(featProgress([])).toEqual({ have: 0, of: FEATS.length });
        expect(featProgress(["first-exit", "warden"])).toEqual({ have: 2, of: FEATS.length });
        expect(featProgress(FEATS.map((feat) => feat.id))).toEqual({ have: FEATS.length, of: FEATS.length });
    });

    it("unknown ids and duplicates do not count", () => {
        expect(featProgress(["made-up"])).toEqual({ have: 0, of: FEATS.length });
        expect(featProgress(["first-exit", "first-exit", "nonsense"])).toEqual({ have: 1, of: FEATS.length });
    });
});
