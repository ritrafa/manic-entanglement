import { describe, expect, it } from "vitest";
import {
    BACKGROUND_FEAT,
    decodeAttributes,
    defaultProgress,
    displayStats,
    encodeAttributes,
    mergeProgress,
    progressFromSave,
    progressVersion,
    saveWithProgress,
    type AttributeEntry,
    type NftProgress,
    type VerifiedRun,
} from "@/game/nftProgress";
import { FEATS } from "@/game/feats";
import { PICKUP_TRAITS } from "@/game/wardrobe";
import { GEAR_IDS, gearCap, noGear, statsFromGear } from "@/game/gear";
import { MODES } from "@/game/modes";
import { TRAITS } from "@/game/sprite";
import { defaultSave, type SaveData } from "@/game/save";
import type { Tally } from "@/game/run";

/** A made-up finished run: nothing done, standing on level 1, in Descent. */
function fakeTally(over: Partial<Tally> = {}): Tally {
    return {
        moves: 0, ms: 0, kills: 0, pickups: 0, bumps: 0, depth: 1, cleared: 0, lostToFights: 0,
        minExitEnergy: null, wardens: 0, toolsUsed: { anchor: 0, twist: 0, cut: 0 },
        darkCleared: 0, banked: 0, mode: "descent", ...over,
    };
}

/** A verified run for the merge, everything overridable. */
function fakeRun(over: Partial<VerifiedRun> = {}): VerifiedRun {
    return {
        issuedAt: 1000, mode: "descent", tally: fakeTally({ cleared: 1 }), score: 100,
        pickedUp: [], gear: {}, ...over,
    };
}

/** The whole encoded list in bytes: 4 + len(key) + 4 + len(value) per entry. */
function encodedBytes(list: readonly AttributeEntry[]): number {
    return list.reduce((total, entry) => total + 4 + entry.key.length + 4 + entry.value.length, 0);
}

/** A progress with everything a full save can hold. */
function fullProgress(): NftProgress {
    const longestTrait = (layer: keyof typeof TRAITS): string =>
        [...TRAITS[layer]].sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
    const progress = defaultProgress();
    progress.look = {
        Back: longestTrait("Back"),
        Body: longestTrait("Body"),
        Clothes: longestTrait("Clothes"),
        Eye: longestTrait("Eye"),
        Head: longestTrait("Head"),
        Background: "Solana",
    };
    progress.best = { descent: 999999999, sprint: 999999999, zen: 999999999, daily: 999999999 };
    progress.totals = { runs: 9999, kills: 99999, cleared: 9999, banked: 9999, deepest: 99 };
    progress.feats = FEATS.map((feat) => feat.id);
    progress.traits = PICKUP_TRAITS.map((pick) => ({ layer: pick.layer, trait: pick.trait }));
    for (const id of GEAR_IDS) progress.gear[id] = gearCap(id);
    progress.synced = 1_700_000_000_000; // 13 digits
    return progress;
}

describe("the bitmask tables", () => {
    it("pin the first ids of FEATS so a reorder fails", () => {
        expect(FEATS[0].id).toBe("first-exit");
        expect(FEATS[1].id).toBe("depth-5");
        expect(FEATS[2].id).toBe("depth-10");
        expect(FEATS[3].id).toBe("photo-finish");
    });

    it("pin the first entries of PICKUP_TRAITS so a reorder fails", () => {
        expect(PICKUP_TRAITS[0]).toMatchObject({ layer: "Back", trait: "Oxygen" });
        expect(PICKUP_TRAITS[1]).toMatchObject({ layer: "Back", trait: "Panel" });
        expect(PICKUP_TRAITS[2]).toMatchObject({ layer: "Body", trait: "Chrome" });
        expect(PICKUP_TRAITS[3]).toMatchObject({ layer: "Body", trait: "Ember" });
        expect(PICKUP_TRAITS[4]).toMatchObject({ layer: "Clothes", trait: "Scarf" });
    });

    it("the first feat and the first trait each set exactly the first bit", () => {
        const progress = defaultProgress();
        progress.feats = ["first-exit"];
        progress.traits = [{ layer: "Back", trait: "Oxygen" }];
        const list = encodeAttributes(progress);
        expect(list.find((entry) => entry.key === "Feats")?.value).toBe("AQ");
        expect(list.find((entry) => entry.key === "Traits")?.value).toBe("AQ");
    });
});

describe("encodeAttributes", () => {
    it("writes every known key with string values", () => {
        const list = encodeAttributes(fullProgress());
        const keys = list.map((entry) => entry.key);
        for (const key of ["Back", "Body", "Clothes", "Eye", "Head", "Background",
            "Best Descent", "Best Sprint", "Best Zen", "Best Daily",
            "Best Depth", "Runs", "Kills", "Cleared", "Banked", "Feats", "Traits",
            "Gear Boots", "Gear Gloves", "Gear Shield", "Gear Speed", "Gear Backpack",
            "Synced", "Version"]) {
            expect(keys, key).toContain(key);
        }
        expect(list.find((entry) => entry.key === "Version")?.value).toBe("1");
        for (const entry of list) expect(typeof entry.value).toBe("string");
    });

    it("writes a best only for modes that have one", () => {
        const progress = defaultProgress();
        progress.best = { sprint: 42000 };
        const keys = encodeAttributes(progress).map((entry) => entry.key);
        expect(keys).toContain("Best Sprint");
        expect(keys).not.toContain("Best Descent");
        expect(keys).not.toContain("Best Zen");
    });

    it("keeps unknown keep keys after the known ones, unchanged and sorted", () => {
        const keep = [
            { key: "Speed", value: "1.4" },
            { key: "Attack", value: "3" },
            { key: "Zebra", value: "z" },
        ];
        const list = encodeAttributes(defaultProgress(), keep);
        const keys = list.map((entry) => entry.key);
        const versionAt = keys.indexOf("Version");
        expect(keys.slice(versionAt + 1)).toEqual(["Attack", "Speed", "Zebra"]);
        expect(list.find((entry) => entry.key === "Speed")?.value).toBe("1.4");
        expect(list.find((entry) => entry.key === "Attack")?.value).toBe("3");
    });

    it("the Gear Speed key never collides with a passed-through Speed stat", () => {
        const progress = defaultProgress();
        progress.gear = { ...noGear(), speed: 5 };
        const list = encodeAttributes(progress, [{ key: "Speed", value: "1.4" }]);
        expect(list.find((entry) => entry.key === "Gear Speed")?.value).toBe("5");
        expect(list.find((entry) => entry.key === "Speed")?.value).toBe("1.4");
    });

    it("a keep entry naming a known key is dropped, the fresh value wins", () => {
        const list = encodeAttributes(defaultProgress(), [
            { key: "Body", value: "Ghost" },
            { key: "Version", value: "999" },
        ]);
        expect(list.find((entry) => entry.key === "Body")?.value).toBe("Green");
        expect(list.filter((entry) => entry.key === "Version")).toHaveLength(1);
        expect(list.find((entry) => entry.key === "Version")?.value).toBe("1");
    });

    it("no encoded list ever carries a duplicate key", () => {
        const keep = [
            { key: "Speed", value: "1" }, { key: "Speed", value: "2" },
            { key: "Body", value: "X" }, { key: "Attack", value: "4" },
            { key: "Attack", value: "4" },
        ];
        for (const progress of [defaultProgress(), fullProgress()]) {
            const keys = encodeAttributes(progress, keep).map((entry) => entry.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    it("the whole list of a full save fits the mint's 560 bytes", () => {
        const bytes = encodedBytes(encodeAttributes(fullProgress()));
        expect(bytes).toBeLessThanOrEqual(560);
    });
});

describe("decodeAttributes", () => {
    it("round trips a full progress", () => {
        const progress = fullProgress();
        expect(decodeAttributes(encodeAttributes(progress))).toEqual(progress);
    });

    it("round trips an empty progress", () => {
        const progress = defaultProgress();
        expect(decodeAttributes(encodeAttributes(progress))).toEqual(progress);
    });

    it("never throws on anything", () => {
        for (const junk of [undefined, null, "nonsense", 42, [], [null], [{ key: 1, value: 2 }],
            [{ key: "Synced", value: "abc" }, { key: "Feats", value: "!!!" }, { key: "Gear Boots", value: "-3" }]]) {
            expect(() => decodeAttributes(junk)).not.toThrow();
        }
        const broken = decodeAttributes([
            { key: "Synced", value: "abc" }, { key: "Runs", value: "" },
            { key: "Feats", value: "!!!" }, { key: "Gear Boots", value: "-3" },
        ]);
        expect(broken.synced).toBe(0);
        expect(broken.totals.runs).toBeUndefined();
        expect(broken.feats).toEqual([]);
        expect(broken.gear.boots).toBe(0);
    });

    it("ignores bits beyond the known lists", () => {
        // 24 bits set: the 12 known feats and 12 more the table does not know.
        const decoded = decodeAttributes([{ key: "Feats", value: "____" }]);
        expect(decoded.feats).toEqual(FEATS.map((feat) => feat.id));
        // 32 bits set over the trait table: only the known ones may appear.
        const traits = decodeAttributes([{ key: "Traits", value: "____" }]);
        expect(traits.traits).toEqual(
            PICKUP_TRAITS.slice(0, 24).map((pick) => ({ layer: pick.layer, trait: pick.trait })),
        );
    });

    it("an old holder's look-only list decodes and re-encodes with unknown keys kept", () => {
        const asset: AttributeEntry[] = [
            { key: "Back", value: "Wings" },
            { key: "Body", value: "Gold" },
            { key: "Clothes", value: "White" },
            { key: "Eye", value: "Regular" },
            { key: "Head", value: "Hood" },
            { key: "Speed", value: "1.4" },
            { key: "Attack", value: "3" },
        ];
        const progress = decodeAttributes(asset);
        expect(progress.look.Back).toBe("Wings");
        expect(progress.look.Head).toBe("Hood");
        expect(progress.synced).toBe(0);
        const list = encodeAttributes(progress, asset);
        const keys = list.map((entry) => entry.key);
        expect(new Set(keys).size).toBe(keys.length);
        const get = (key: string) => list.find((entry) => entry.key === key)?.value;
        expect(get("Speed")).toBe("1.4");
        expect(get("Attack")).toBe("3");
        expect(get("Clothes")).toBe("White");
    });

    it("keeps a look value the art does not know, never rewriting it to None", () => {
        const decoded = decodeAttributes([{ key: "Clothes", value: "White" }]);
        expect(decoded.look.Clothes).toBe("White");
        const list = encodeAttributes(decoded);
        expect(list.find((entry) => entry.key === "Clothes")?.value).toBe("White");
        // A second round trip still says White: a save never overwrites it.
        expect(decodeAttributes(list).look.Clothes).toBe("White");
        // A known missing layer still falls back the way sanitizeLook does.
        expect(decoded.look.Head).toBe("None");
        expect(decoded.look.Body).toBe("Green");
    });

    it("reads the mode bests by their names and the watermark", () => {
        const decoded = decodeAttributes([
            { key: "Best Sprint", value: "45123" },
            { key: "Best Depth", value: "7" },
            { key: "Synced", value: "1700000000000" },
        ]);
        expect(decoded.best.sprint).toBe(45123);
        expect(decoded.totals.deepest).toBe(7);
        expect(decoded.synced).toBe(1700000000000);
    });
});

describe("mergeProgress", () => {
    it("applies runs in issuedAt order and moves the watermark", () => {
        const { progress, applied } = mergeProgress(defaultProgress(), [
            fakeRun({ issuedAt: 300, tally: fakeTally({ cleared: 1, depth: 2 }), score: 50 }),
            fakeRun({ issuedAt: 100, tally: fakeTally({ cleared: 1, kills: 3, depth: 1 }), score: 80 }),
        ], null);
        expect(applied).toBe(2);
        expect(progress.synced).toBe(300);
        expect(progress.totals.runs).toBe(2);
        expect(progress.totals.kills).toBe(3);
        expect(progress.totals.deepest).toBe(2);
        expect(progress.feats).toContain("first-exit");
    });

    it("skips runs at or below the watermark", () => {
        const start = defaultProgress();
        start.synced = 500;
        const { progress, applied } = mergeProgress(start, [
            fakeRun({ issuedAt: 500 }), fakeRun({ issuedAt: 499 }), fakeRun({ issuedAt: 501 }),
        ], null);
        expect(applied).toBe(1);
        expect(progress.synced).toBe(501);
        expect(progress.totals.runs).toBe(1);
    });

    it("is idempotent: the same runs applied twice change nothing", () => {
        const runs = [
            fakeRun({ issuedAt: 10, tally: fakeTally({ cleared: 1, depth: 6, banked: 2 }), score: 300, pickedUp: [{ layer: "Back", trait: "Oxygen" }], gear: { boots: 2 } }),
            fakeRun({ issuedAt: 20, tally: fakeTally({ cleared: 2, kills: 50, mode: "zen" }), score: 500 }),
        ];
        const first = mergeProgress(defaultProgress(), runs, null);
        const second = mergeProgress(first.progress, runs, null);
        expect(second.applied).toBe(0);
        expect(second.progress).toEqual(first.progress);
        expect(second.progress.synced).toBe(20);
    });

    it("ranks Sprint by its own rule: the lower time wins", () => {
        const start = defaultProgress();
        start.best = { sprint: 50000 };
        const worse = mergeProgress(start, [fakeRun({ mode: "sprint", score: 60000 })], null);
        expect(worse.progress.best.sprint).toBe(50000);
        const better = mergeProgress(start, [fakeRun({ mode: "sprint", score: 40000 })], null);
        expect(better.progress.best.sprint).toBe(40000);
    });

    it("unions traits and takes capped gear maxima", () => {
        const start = defaultProgress();
        start.traits = [{ layer: "Back", trait: "Oxygen" }];
        start.gear = { ...noGear(), boots: gearCap("boots") - 1 };
        const { progress } = mergeProgress(start, [
            fakeRun({ pickedUp: [{ layer: "Back", trait: "Oxygen" }, { layer: "Head", trait: "Halo" }], gear: { boots: 99, gloves: 3 } }),
        ], null);
        expect(progress.traits).toEqual([
            { layer: "Back", trait: "Oxygen" },
            { layer: "Head", trait: "Halo" },
        ]);
        expect(progress.gear.boots).toBe(gearCap("boots"));
        expect(progress.gear.gloves).toBe(3);
    });

    it("ignores runs that are not shaped like proofs", () => {
        const { progress, applied } = mergeProgress(defaultProgress(), [
            null, 7, {}, { issuedAt: "soon" }, { issuedAt: 1 },
        ], null);
        expect(applied).toBe(0);
        expect(progress).toEqual(defaultProgress());
    });

    it("refuses a locked trait in the chosen look and keeps the current one", () => {
        const start = defaultProgress();
        const { progress } = mergeProgress(start, [], { Body: "Gold" });
        expect(progress.look.Body).toBe("Green");
    });

    it("accepts a chosen trait its feat unlocks", () => {
        const run = fakeRun({ tally: fakeTally({ mode: "sprint", cleared: 5, ms: 30000 }), mode: "sprint" });
        const { progress } = mergeProgress(defaultProgress(), [run], { Body: "Gold" });
        expect(progress.feats).toContain("sprinter");
        expect(progress.look.Body).toBe("Gold");
    });

    it("accepts a chosen trait the run handed over as a pickup", () => {
        const run = fakeRun({ pickedUp: [{ layer: "Head", trait: "Halo" }] });
        const { progress } = mergeProgress(defaultProgress(), [run], { Head: "Halo" });
        expect(progress.look.Head).toBe("Halo");
    });

    it("gives the Solana background only with its reward feat", () => {
        const refused = mergeProgress(defaultProgress(), [], { Background: "Solana" });
        expect(refused.progress.look.Background).toBe("Void");
        const run = fakeRun({ tally: fakeTally({ mode: "zen", depth: 8 }) });
        const earned = mergeProgress(defaultProgress(), [run], { Background: "Solana" });
        expect(earned.progress.feats).toContain(BACKGROUND_FEAT);
        expect(earned.progress.look.Background).toBe("Solana");
        // Void is always allowed and clears the gradient.
        const back = mergeProgress(earned.progress, [], { Background: "Void" });
        expect(back.progress.look.Background).toBe("Void");
    });

    it("never mutates its inputs", () => {
        const start = defaultProgress();
        const run = fakeRun();
        const chosen = { Body: "Gold" } as const;
        const startCopy = JSON.parse(JSON.stringify(start));
        const runCopy = JSON.parse(JSON.stringify(run));
        mergeProgress(start, [run], chosen);
        expect(start).toEqual(startCopy);
        expect(run).toEqual(runCopy);
    });
});

describe("progressVersion", () => {
    it("is eight hex characters, steady for equal progress", () => {
        const a = progressVersion(defaultProgress());
        expect(a).toMatch(/^[0-9a-f]{8}$/);
        expect(progressVersion(defaultProgress())).toBe(a);
    });

    it("moves when the encoded list moves", () => {
        const before = progressVersion(defaultProgress());
        const changed = defaultProgress();
        changed.totals.runs = 1;
        expect(progressVersion(changed)).not.toBe(before);
    });
});

describe("displayStats", () => {
    it("derives the stats from the gear levels", () => {
        const progress = defaultProgress();
        progress.gear = { ...noGear(), gloves: 4, speed: 3 };
        expect(displayStats(progress)).toEqual(statsFromGear(progress.gear));
    });

    it("does not store the derived stats on-chain", () => {
        const list = encodeAttributes(fullProgress(), [
            { key: "Attack", value: "3" }, { key: "Defense", value: "2" }, { key: "Speed", value: "1.4" },
        ]);
        const get = (key: string) => list.find((entry) => entry.key === key)?.value;
        expect(get("Attack")).toBe("3");
        expect(get("Defense")).toBe("2");
        expect(get("Speed")).toBe("1.4");
        // The gear levels themselves ride under their Gear prefix.
        expect(get("Gear Speed")).toBe(String(gearCap("speed")));
    });
});

describe("progressFromSave and saveWithProgress", () => {
    function fullSave(over: Partial<SaveData> = {}): SaveData {
        return {
            ...defaultSave(),
            best: { descent: 100, sprint: 60000 },
            totals: { runs: 5, kills: 10, cleared: 6, banked: 3, deepest: 4 },
            feats: ["first-exit"],
            pickedUp: [{ layer: "Back", trait: "Oxygen" }],
            gear: { boots: 2 },
            look: { Back: "None", Body: "Green", Clothes: "White", Eye: "Regular", Head: "None" },
            ...over,
        };
    }

    it("reads a save into a progress with the local look kept", () => {
        const progress = progressFromSave(fullSave());
        expect(progress.look.Clothes).toBe("White");
        expect(progress.best.descent).toBe(100);
        expect(progress.feats).toEqual(["first-exit"]);
        expect(progress.traits).toEqual([{ layer: "Back", trait: "Oxygen" }]);
        expect(progress.gear.boots).toBe(2);
        expect(progress.synced).toBe(0);
    });

    it("only reads the Solana background when the reward feat is there", () => {
        const save = fullSave({ look: { Body: "Solana", Background: "Solana" } as SaveData["look"] });
        expect(progressFromSave(save).look.Background).toBe("Void");
        save.feats = [BACKGROUND_FEAT];
        expect(progressFromSave(save).look.Background).toBe("Solana");
    });

    it("folds verified progress into the save by max and union, keeping the look", () => {
        const save = fullSave();
        const progress = defaultProgress();
        progress.best = { descent: 90, sprint: 50000, zen: 10 };
        progress.totals = { runs: 9, kills: 5, cleared: 2, banked: 40, deepest: 12 };
        progress.feats = ["depth-5"];
        progress.traits = [{ layer: "Head", trait: "Halo" }];
        progress.gear = { ...noGear(), boots: 5, shield: 2 };
        const merged = saveWithProgress(save, progress);
        expect(merged.best.descent).toBe(100);          // the higher score stays
        expect(merged.best.sprint).toBe(50000);         // the Sprint time takes the lower
        expect(merged.best.zen).toBe(10);               // the missing mode arrives
        expect(merged.totals).toEqual({ runs: 9, kills: 10, cleared: 6, banked: 40, deepest: 12 });
        expect(merged.feats).toEqual(["first-exit", "depth-5"]);
        expect(merged.pickedUp).toEqual([
            { layer: "Back", trait: "Oxygen" },
            { layer: "Head", trait: "Halo" },
        ]);
        expect(merged.gear.boots).toBe(5);
        expect(merged.gear.shield).toBe(2);
        expect(merged.look).toEqual(save.look);         // the local look is kept
        expect(save.best.descent).toBe(100);            // the input save is untouched
    });

    it("a save round trips through progress and back without losing progress", () => {
        const save = fullSave();
        const merged = saveWithProgress(save, progressFromSave(save));
        expect(merged.best).toEqual(save.best);
        expect(merged.totals).toEqual(save.totals);
        expect(merged.feats).toEqual(save.feats);
        expect(merged.pickedUp).toEqual(save.pickedUp);
        expect(merged.gear).toEqual({ ...noGear(), boots: 2 });
    });
});

describe("the modes' best names", () => {
    it("encode under each mode's own display name", () => {
        const progress = defaultProgress();
        for (const id of Object.keys(MODES) as (keyof typeof MODES)[]) progress.best[id] = 1;
        const keys = encodeAttributes(progress).map((entry) => entry.key);
        for (const id of Object.keys(MODES) as (keyof typeof MODES)[]) {
            expect(keys).toContain(`Best ${MODES[id].name}`);
        }
    });
});
