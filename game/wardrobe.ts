// The pure wardrobe: which traits a player may wear and which feat unlocks
// which. Five traits are free; every other one of the twenty-two belongs to
// exactly one feat, the showiest ones to the hardest feats. Pure data and pure
// functions: no DOM, no images, no clocks — trait names still reach a URL only
// through spriteLayers in game/sprite.ts.

import { DEFAULT_LOOK, LAYER_ORDER, TRAITS, type Layer, type Look } from "./sprite";

/** The traits everyone may wear from the first visit, per layer. */
export const FREE_TRAITS: Partial<Record<Layer, readonly string[]>> = {
    Body: ["Green", "Blue"],
    Eye: ["Regular", "Asleep"],
    Head: ["Hood"],
};

/**
 * What each feat unlocks, keyed by the feat id (game/feats.ts). Every trait
 * that is neither free nor "None" appears exactly once across these entries;
 * the showiest (Body Skeleton, Body Solana, Body Gold, Head Crown, Back
 * Jetpack) sit on the hardest feats.
 */
export const UNLOCKS: Record<string, { layer: Layer; trait: string }[]> = {
    "first-exit": [{ layer: "Body", trait: "Pink" }],
    "depth-5": [{ layer: "Eye", trait: "One" }],
    "depth-10": [{ layer: "Clothes", trait: "Tank" }],
    "photo-finish": [{ layer: "Head", trait: "Cowboy" }],
    "no-toll": [{ layer: "Eye", trait: "Zero" }],
    "toll-road": [{ layer: "Back", trait: "Wings" }],
    "warden": [{ layer: "Clothes", trait: "Robe" }, { layer: "Clothes", trait: "Astronaut" }],
    "collector": [{ layer: "Back", trait: "Billhook" }, { layer: "Head", trait: "Crown" }],
    "toolbox": [{ layer: "Eye", trait: "Scanner" }],
    "in-the-dark": [{ layer: "Head", trait: "Cosmonaut" }, { layer: "Body", trait: "Purple" }],
    "sprinter": [{ layer: "Body", trait: "Gold" }, { layer: "Back", trait: "Jetpack" }],
    "still-water": [{ layer: "Body", trait: "Skeleton" }, { layer: "Body", trait: "Solana" }],
};

/** True when `feats` (a list of feat ids) holds one that unlocks this trait. */
function unlockedBySome(layer: Layer, trait: string, feats: readonly string[]): boolean {
    if (!Array.isArray(feats)) return false;
    return feats.some((id) => (UNLOCKS[id] ?? []).some((entry) => entry.layer === layer && entry.trait === trait));
}

/**
 * True when this trait may be worn with these feats: it must be a real trait
 * of the layer, and either "None" (always available where it exists), one of
 * the free traits, or unlocked by an earned feat.
 */
export function isUnlocked(layer: Layer, trait: string, feats: readonly string[]): boolean {
    if (!TRAITS[layer]?.includes(trait)) return false;
    if (trait === "None") return true;
    if (FREE_TRAITS[layer]?.includes(trait)) return true;
    return unlockedBySome(layer, trait, feats);
}

/** The traits of one layer the player may wear, in TRAITS order. */
export function availableTraits(layer: Layer, feats: readonly string[]): string[] {
    const list = TRAITS[layer] ?? [];
    return list.filter((trait) => isUnlocked(layer, trait, feats));
}

/**
 * The look with this layer moved to the next (step > 0) or previous (step < 0)
 * available trait, wrapping around. A layer with one available trait, or a step
 * of 0, gives the same look back. A trait that is not currently available (a
 * look from before a feat was lost) steps into the available list from its top.
 */
export function cycleTrait(look: Look, layer: Layer, step: number, feats: readonly string[]): Look {
    const available = availableTraits(layer, feats);
    if (available.length === 0) return { ...look };
    const count = available.length;
    const offset = Number.isFinite(step) ? Math.trunc(step) : 0;
    const index = available.indexOf(look[layer]);
    // An unavailable current trait steps in from the end it is heading for.
    const base = index >= 0 ? index : offset > 0 ? -1 : 0;
    const next = available[(((base + offset) % count) + count) % count];
    return { ...look, [layer]: next };
}

/**
 * The look with every trait the player may not wear replaced by that layer's
 * default (which is always available). Used on the saved look at load, so a
 * look kept before a progress reset cannot keep wearing a locked trait.
 */
export function fitLook(look: Look, feats: readonly string[]): Look {
    const fitted: Look = { ...look };
    for (const layer of LAYER_ORDER) {
        if (!isUnlocked(layer, fitted[layer], feats)) fitted[layer] = DEFAULT_LOOK[layer];
    }
    return fitted;
}

/** The feat id that unlocks this trait, or null for a free trait, "None" or an unknown one. */
export function unlockedBy(layer: Layer, trait: string): string | null {
    for (const [featId, entries] of Object.entries(UNLOCKS)) {
        if (entries.some((entry) => entry.layer === layer && entry.trait === trait)) return featId;
    }
    return null;
}
