import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK, LAYER_ORDER, TRAITS, type Layer, type Look } from "@/game/sprite";
import { FEATS } from "@/game/feats";
import {
    FREE_TRAITS,
    PICKUP_TRAITS,
    UNLOCKS,
    availableTraits,
    cycleTrait,
    fitLook,
    isUnlocked,
    pickupRarity,
    unlockedBy,
} from "@/game/wardrobe";

/** Every non-None trait held in the save's `pickedUp` form. */
const ALL_PICKUPS = PICKUP_TRAITS.map(({ layer, trait }) => ({ layer, trait }));

/** Every non-None trait of every layer, as "Layer/Trait" pairs. */
function allTraits(): { layer: Layer; trait: string }[] {
    const out: { layer: Layer; trait: string }[] = [];
    for (const layer of LAYER_ORDER) {
        for (const trait of TRAITS[layer]) {
            if (trait !== "None") out.push({ layer, trait });
        }
    }
    return out;
}

const ALL_FEAT_IDS = FEATS.map((feat) => feat.id);

describe("the unlock table", () => {
    it("the free traits plus every UNLOCKS and PICKUP_TRAITS entry are exactly the 32 non-None traits, none twice", () => {
        const seen = new Map<string, number>();
        const record = (layer: Layer, trait: string) => {
            const key = `${layer}/${trait}`;
            seen.set(key, (seen.get(key) ?? 0) + 1);
        };
        for (const layer of LAYER_ORDER) {
            for (const trait of FREE_TRAITS[layer] ?? []) record(layer, trait);
        }
        for (const entries of Object.values(UNLOCKS)) {
            for (const entry of entries) record(entry.layer, entry.trait);
        }
        for (const entry of PICKUP_TRAITS) record(entry.layer, entry.trait);
        const expected = new Set(allTraits().map(({ layer, trait }) => `${layer}/${trait}`));
        expect([...seen.keys()].sort()).toEqual([...expected].sort());
        expect(expected.size).toBe(32);
        for (const [key, count] of seen) expect(count, key).toBe(1);
    });

    it("PICKUP_TRAITS names real traits, five Found and five Rare, and never None", () => {
        expect(PICKUP_TRAITS).toHaveLength(10);
        const rarities = PICKUP_TRAITS.map((entry) => entry.rarity);
        expect(rarities.filter((rarity) => rarity === "found")).toHaveLength(5);
        expect(rarities.filter((rarity) => rarity === "rare")).toHaveLength(5);
        for (const entry of PICKUP_TRAITS) {
            expect(entry.trait).not.toBe("None");
            expect(TRAITS[entry.layer], `${entry.layer}/${entry.trait}`).toContain(entry.trait);
            expect(pickupRarity(entry.layer, entry.trait)).toBe(entry.rarity);
        }
        // The named rarities of the shipped batch, layer by layer.
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Back", trait: "Oxygen", rarity: "found" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Back", trait: "Panel", rarity: "rare" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Body", trait: "Chrome", rarity: "found" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Body", trait: "Ember", rarity: "rare" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Clothes", trait: "Scarf", rarity: "found" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Clothes", trait: "Plate", rarity: "rare" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Eye", trait: "Visor", rarity: "found" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Eye", trait: "Eclipse", rarity: "rare" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Head", trait: "Miner", rarity: "found" });
        expect(PICKUP_TRAITS).toContainEqual({ layer: "Head", trait: "Halo", rarity: "rare" });
    });

    it("pickupRarity is null for free, feat-only, None and unknown traits", () => {
        expect(pickupRarity("Body", "Green")).toBeNull();
        expect(pickupRarity("Body", "Gold")).toBeNull();
        expect(pickupRarity("Back", "None")).toBeNull();
        expect(pickupRarity("Body", "Rainbow")).toBeNull();
    });

    it("every key of UNLOCKS is the id of a feat in FEATS", () => {
        for (const id of Object.keys(UNLOCKS)) {
            expect(ALL_FEAT_IDS, id).toContain(id);
        }
    });

    it("every UNLOCKS entry names a real trait of its layer", () => {
        for (const entries of Object.values(UNLOCKS)) {
            for (const entry of entries) {
                expect(TRAITS[entry.layer], `${entry.layer}/${entry.trait}`).toContain(entry.trait);
            }
        }
    });

    it("no feat unlocks None and none unlocks more than two traits", () => {
        for (const entries of Object.values(UNLOCKS)) {
            expect(entries.length).toBeGreaterThanOrEqual(1);
            expect(entries.length).toBeLessThanOrEqual(2);
            for (const entry of entries) expect(entry.trait).not.toBe("None");
        }
    });
});

describe("availableTraits", () => {
    it("with no feats the body offers only the two free colours", () => {
        expect(availableTraits("Body", [])).toEqual(["Blue", "Green"]);
    });

    it("with no feats the back offers only None", () => {
        expect(availableTraits("Back", [])).toEqual(["None"]);
    });

    it("with no feats the head holds Hood and None", () => {
        const head = availableTraits("Head", []);
        expect(head).toContain("Hood");
        expect(head).toContain("None");
    });

    it("keeps TRAITS order when a feat adds a trait", () => {
        expect(availableTraits("Body", ["still-water"])).toEqual(["Blue", "Green", "Skeleton", "Solana"]);
    });

    it("ignores unknown feat ids", () => {
        expect(availableTraits("Body", ["not-a-feat"])).toEqual(["Blue", "Green"]);
    });

    it("with every feat earned, all 22 feat-and-free traits are available but no pickup", () => {
        let total = 0;
        for (const layer of LAYER_ORDER) {
            const available = availableTraits(layer, ALL_FEAT_IDS);
            expect(available).toEqual(TRAITS[layer].filter((trait) => pickupRarity(layer, trait) === null));
            total += available.filter((trait) => trait !== "None").length;
        }
        expect(total).toBe(22);
    });

    it("with every feat earned and every pickup held, all 32 traits are available", () => {
        let total = 0;
        for (const layer of LAYER_ORDER) {
            const available = availableTraits(layer, ALL_FEAT_IDS, ALL_PICKUPS);
            expect(available).toEqual([...TRAITS[layer]]);
            total += available.filter((trait) => trait !== "None").length;
        }
        expect(total).toBe(32);
    });

    it("a held pickup joins its layer without any feat", () => {
        expect(availableTraits("Head", [], [{ layer: "Head", trait: "Halo" }])).toEqual([
            "Halo",
            "Hood",
            "None",
        ]);
    });

    it("a held pickup of another layer or an unknown trait unlocks nothing", () => {
        expect(availableTraits("Body", [], [{ layer: "Body", trait: "Halo" }])).toEqual(["Blue", "Green"]);
        expect(availableTraits("Body", [], [{ layer: "Body", trait: "Rainbow" }])).toEqual(["Blue", "Green"]);
    });
});

describe("isUnlocked", () => {
    it("None is available wherever it exists, and nowhere it does not", () => {
        expect(isUnlocked("Back", "None", [])).toBe(true);
        expect(isUnlocked("Clothes", "None", [])).toBe(true);
        expect(isUnlocked("Body", "None", [])).toBe(false);
    });

    it("a free trait answers true and a locked one false without its feat", () => {
        expect(isUnlocked("Body", "Green", [])).toBe(true);
        expect(isUnlocked("Head", "Hood", [])).toBe(true);
        expect(isUnlocked("Body", "Gold", [])).toBe(false);
        expect(isUnlocked("Body", "Gold", ["sprinter"])).toBe(true);
    });

    it("an unknown trait is never unlocked", () => {
        expect(isUnlocked("Body", "Rainbow", ALL_FEAT_IDS)).toBe(false);
    });

    it("a pickup trait waits for the save to hold it, feat or no feat", () => {
        expect(isUnlocked("Head", "Miner", [])).toBe(false);
        expect(isUnlocked("Head", "Miner", ALL_FEAT_IDS)).toBe(false);
        expect(isUnlocked("Head", "Miner", [], [{ layer: "Head", trait: "Miner" }])).toBe(true);
    });

    it("a pickedUp list that is not an array unlocks nothing", () => {
        expect(isUnlocked("Head", "Miner", [], "Miner" as unknown as { layer: string; trait: string }[])).toBe(false);
    });
});

describe("cycleTrait", () => {
    it("from Green forward with no feats gives Blue, and forward again gives Green", () => {
        const start: Look = { ...DEFAULT_LOOK };
        const first = cycleTrait(start, "Body", 1, []);
        expect(first.Body).toBe("Blue");
        expect(cycleTrait(first, "Body", 1, []).Body).toBe("Green");
    });

    it("backward wraps the same way forward does", () => {
        expect(cycleTrait({ ...DEFAULT_LOOK }, "Body", -1, []).Body).toBe("Blue");
    });

    it("on a layer with one available trait it returns the same look", () => {
        const look = { ...DEFAULT_LOOK };
        expect(cycleTrait(look, "Back", 1, [])).toEqual(look);
        expect(cycleTrait(look, "Back", -5, [])).toEqual(look);
    });

    it("leaves every other layer alone", () => {
        const look: Look = { Back: "None", Body: "Green", Clothes: "None", Eye: "Asleep", Head: "Hood" };
        expect(cycleTrait(look, "Body", 1, [])).toEqual({ ...look, Body: "Blue" });
    });

    it("steps over locked traits to the next available one", () => {
        // With only Pink unlocked the body walks Blue, Green, Pink and around.
        const feats = ["first-exit"];
        let look: Look = { ...DEFAULT_LOOK, Body: "Blue" };
        expect(cycleTrait(look, "Body", 1, feats).Body).toBe("Green");
        look = { ...look, Body: "Green" };
        expect(cycleTrait(look, "Body", 1, feats).Body).toBe("Pink");
        look = { ...look, Body: "Pink" };
        expect(cycleTrait(look, "Body", 1, feats).Body).toBe("Blue");
    });

    it("a step of 0 keeps the look", () => {
        const look = { ...DEFAULT_LOOK };
        expect(cycleTrait(look, "Body", 0, [])).toEqual(look);
    });
});

describe("fitLook", () => {
    it("replaces a locked trait with that layer's default", () => {
        expect(fitLook({ ...DEFAULT_LOOK, Body: "Gold" }, []).Body).toBe("Green");
    });

    it("keeps a locked trait once its feat is earned", () => {
        expect(fitLook({ ...DEFAULT_LOOK, Body: "Gold" }, ["sprinter"]).Body).toBe("Gold");
    });

    it("replaces an unknown trait and keeps every legal one", () => {
        const look = { ...DEFAULT_LOOK, Eye: "Rainbow" as string } as Look;
        expect(fitLook(look, []).Eye).toBe(DEFAULT_LOOK.Eye);
        const kept: Look = { Back: "None", Body: "Blue", Clothes: "None", Eye: "Asleep", Head: "Hood" };
        expect(fitLook(kept, [])).toEqual(kept);
    });

    it("the default of every layer is always available", () => {
        for (const layer of LAYER_ORDER) {
            expect(isUnlocked(layer, DEFAULT_LOOK[layer], [])).toBe(true);
        }
    });

    it("with every feat earned it changes nothing", () => {
        const look: Look = { Back: "Jetpack", Body: "Skeleton", Clothes: "Robe", Eye: "Scanner", Head: "Crown" };
        expect(fitLook(look, ALL_FEAT_IDS)).toEqual(look);
    });

    it("a held pickup keeps its trait, an unheld one falls back to the default", () => {
        const look: Look = { Back: "Oxygen", Body: "Green", Clothes: "None", Eye: "Regular", Head: "Halo" };
        expect(fitLook(look, [], [{ layer: "Back", trait: "Oxygen" }])).toEqual({
            ...look,
            Head: DEFAULT_LOOK.Head,
        });
    });
});

describe("cycleTrait with pickups", () => {
    it("a held pickup joins the cycle of its layer", () => {
        const held = [{ layer: "Clothes", trait: "Scarf" }];
        const look: Look = { ...DEFAULT_LOOK, Clothes: "None" };
        expect(cycleTrait(look, "Clothes", 1, [], held).Clothes).toBe("Scarf");
        expect(cycleTrait({ ...look, Clothes: "Scarf" }, "Clothes", 1, [], held).Clothes).toBe("None");
    });
});

describe("unlockedBy", () => {
    it("is null for the free traits, None and unknown traits", () => {
        expect(unlockedBy("Body", "Green")).toBeNull();
        expect(unlockedBy("Body", "Blue")).toBeNull();
        expect(unlockedBy("Eye", "Regular")).toBeNull();
        expect(unlockedBy("Eye", "Asleep")).toBeNull();
        expect(unlockedBy("Head", "Hood")).toBeNull();
        expect(unlockedBy("Back", "None")).toBeNull();
        expect(unlockedBy("Body", "Rainbow")).toBeNull();
    });

    it("names the feat id for every feat-locked trait", () => {
        for (const { layer, trait } of allTraits()) {
            if (FREE_TRAITS[layer]?.includes(trait)) continue;
            if (pickupRarity(layer, trait) !== null) {
                expect(unlockedBy(layer, trait), `${layer}/${trait}`).toBeNull();
                continue;
            }
            const id = unlockedBy(layer, trait);
            expect(id, `${layer}/${trait}`).not.toBeNull();
            expect(ALL_FEAT_IDS, `${layer}/${trait}`).toContain(id!);
            expect(UNLOCKS[id!]).toContainEqual({ layer, trait });
        }
    });
});
