// The pure wardrobe: which traits a player may wear, which feat unlocks which
// and which the maze hands out. Five traits are free; every other one of the
// one hundred four belongs to exactly one feat (the showiest ones to the hardest
// feats) or to one pickup slot in the maze, with a Found or Rare rarity. Pure
// data and pure functions: no DOM, no images, no clocks — trait names still
// reach a URL only through spriteLayers in game/sprite.ts.

import { DEFAULT_LOOK, LAYER_ORDER, TRAITS, type Layer, type Look } from "./sprite";

/** The traits everyone may wear from the first visit, per layer. */
export const FREE_TRAITS: Partial<Record<Layer, readonly string[]>> = {
    Body: ["Green", "Blue"],
    Eye: ["Regular", "Asleep"],
    Head: ["Hood"],
};

/**
 * What each feat unlocks, keyed by the feat id (game/feats.ts). Every trait
 * that is neither free nor "None" appears exactly once across these entries
 * and PICKUP_TRAITS; the showiest (Body Skeleton, Body Solana, Body Gold,
 * Head Crown, Back Jetpack) sit on the hardest feats.
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

/** How seldom a maze pickup drops (design/README, Colour): Found is common,
 *  Rare comes from deep or seldom-spawning spots. */
export type PickupRarity = "found" | "rare";

/** One trait the maze hands out, as the save's `pickedUp` list stores it. */
export type HeldTrait = { layer: string; trait: string };

/**
 * The traits that drop as pickups in the maze (trait cards come with E58):
 * the ten shipped ones (five Found, five Rare) plus the 72 of the second
 * batch (49 Found, 28 Rare in all). A trait here is wearable once the save's
 * `pickedUp` list holds it; the feat table above never names these. Two
 * names repeat across layers (Circuit in Body and Clothes, Crystal in Back
 * and Clothes), so an entry is only ever read as its layer plus trait.
 */
export const PICKUP_TRAITS: readonly { layer: Layer; trait: string; rarity: PickupRarity }[] = [
    { layer: "Back", trait: "Oxygen", rarity: "found" },
    { layer: "Back", trait: "Panel", rarity: "rare" },
    { layer: "Body", trait: "Chrome", rarity: "found" },
    { layer: "Body", trait: "Ember", rarity: "rare" },
    { layer: "Clothes", trait: "Scarf", rarity: "found" },
    { layer: "Clothes", trait: "Plate", rarity: "rare" },
    { layer: "Eye", trait: "Visor", rarity: "found" },
    { layer: "Eye", trait: "Eclipse", rarity: "rare" },
    { layer: "Head", trait: "Miner", rarity: "found" },
    { layer: "Head", trait: "Halo", rarity: "rare" },
    { layer: "Back", trait: "Shell", rarity: "found" },
    { layer: "Back", trait: "Quiver", rarity: "found" },
    { layer: "Back", trait: "Sword", rarity: "found" },
    { layer: "Back", trait: "Antenna", rarity: "found" },
    { layer: "Back", trait: "Balloon", rarity: "found" },
    { layer: "Back", trait: "Cape", rarity: "found" },
    { layer: "Back", trait: "Dish", rarity: "found" },
    { layer: "Back", trait: "Lantern", rarity: "found" },
    { layer: "Back", trait: "Rucksack", rarity: "found" },
    { layer: "Back", trait: "Mushroom", rarity: "found" },
    { layer: "Back", trait: "Sail", rarity: "rare" },
    { layer: "Back", trait: "Tentacles", rarity: "rare" },
    { layer: "Back", trait: "Crystal", rarity: "rare" },
    { layer: "Back", trait: "Drone", rarity: "rare" },
    { layer: "Body", trait: "Frost", rarity: "found" },
    { layer: "Body", trait: "Coral", rarity: "found" },
    { layer: "Body", trait: "Camo", rarity: "found" },
    { layer: "Body", trait: "Copper", rarity: "found" },
    { layer: "Body", trait: "Lunar", rarity: "found" },
    { layer: "Body", trait: "Tide", rarity: "found" },
    { layer: "Body", trait: "Garnet", rarity: "found" },
    { layer: "Body", trait: "Mint", rarity: "found" },
    { layer: "Body", trait: "Dune", rarity: "found" },
    { layer: "Body", trait: "Nebula", rarity: "rare" },
    { layer: "Body", trait: "Toxic", rarity: "rare" },
    { layer: "Body", trait: "Circuit", rarity: "rare" },
    { layer: "Body", trait: "Glitch", rarity: "rare" },
    { layer: "Body", trait: "Opal", rarity: "rare" },
    { layer: "Clothes", trait: "Poncho", rarity: "found" },
    { layer: "Clothes", trait: "Vest", rarity: "found" },
    { layer: "Clothes", trait: "Trench", rarity: "found" },
    { layer: "Clothes", trait: "Mail", rarity: "found" },
    { layer: "Clothes", trait: "Bandolier", rarity: "found" },
    { layer: "Clothes", trait: "Aloha", rarity: "found" },
    { layer: "Clothes", trait: "Overalls", rarity: "found" },
    { layer: "Clothes", trait: "Toga", rarity: "found" },
    { layer: "Clothes", trait: "Parka", rarity: "found" },
    { layer: "Clothes", trait: "Tabard", rarity: "found" },
    { layer: "Clothes", trait: "Kimono", rarity: "rare" },
    { layer: "Clothes", trait: "Tuxedo", rarity: "rare" },
    { layer: "Clothes", trait: "Lamellar", rarity: "rare" },
    { layer: "Clothes", trait: "Circuit", rarity: "rare" },
    { layer: "Clothes", trait: "Crystal", rarity: "rare" },
    { layer: "Eye", trait: "Monocle", rarity: "found" },
    { layer: "Eye", trait: "Goggles", rarity: "found" },
    { layer: "Eye", trait: "Shades", rarity: "found" },
    { layer: "Eye", trait: "Wide", rarity: "found" },
    { layer: "Eye", trait: "Glare", rarity: "found" },
    { layer: "Eye", trait: "Slit", rarity: "found" },
    { layer: "Eye", trait: "Patch", rarity: "found" },
    { layer: "Eye", trait: "Dazed", rarity: "found" },
    { layer: "Eye", trait: "Bored", rarity: "found" },
    { layer: "Eye", trait: "Target", rarity: "found" },
    { layer: "Eye", trait: "Glint", rarity: "rare" },
    { layer: "Eye", trait: "Bionic", rarity: "rare" },
    { layer: "Eye", trait: "Alien", rarity: "rare" },
    { layer: "Eye", trait: "Blaze", rarity: "rare" },
    { layer: "Head", trait: "Beanie", rarity: "found" },
    { layer: "Head", trait: "Tophat", rarity: "found" },
    { layer: "Head", trait: "Bandana", rarity: "found" },
    { layer: "Head", trait: "Straw", rarity: "found" },
    { layer: "Head", trait: "Toque", rarity: "found" },
    { layer: "Head", trait: "Fez", rarity: "found" },
    { layer: "Head", trait: "Headset", rarity: "found" },
    { layer: "Head", trait: "Mohawk", rarity: "found" },
    { layer: "Head", trait: "Propeller", rarity: "found" },
    { layer: "Head", trait: "Knight", rarity: "found" },
    { layer: "Head", trait: "Wizard", rarity: "rare" },
    { layer: "Head", trait: "Viking", rarity: "rare" },
    { layer: "Head", trait: "Jester", rarity: "rare" },
    { layer: "Head", trait: "Pharaoh", rarity: "rare" },
    { layer: "Head", trait: "Saucer", rarity: "rare" },
];

/** The rarity of a maze-pickup trait, or null for a free or feat-only one. */
export function pickupRarity(layer: Layer, trait: string): PickupRarity | null {
    const entry = PICKUP_TRAITS.find((pick) => pick.layer === layer && pick.trait === trait);
    return entry ? entry.rarity : null;
}

/** True when `pickedUp` (the save's held pickups) names this exact trait. */
function heldSomewhere(layer: Layer, trait: string, pickedUp: readonly HeldTrait[]): boolean {
    if (!Array.isArray(pickedUp)) return false;
    return pickedUp.some((entry) => entry && entry.layer === layer && entry.trait === trait);
}

/**
 * True when this trait may be worn: it must be a real trait of the layer, and
 * either "None" (always available where it exists), one of the free traits,
 * unlocked by an earned feat, or held in `pickedUp` (the save's maze pickups,
 * empty for a player who has found none).
 */
export function isUnlocked(
    layer: Layer,
    trait: string,
    feats: readonly string[],
    pickedUp: readonly HeldTrait[] = [],
): boolean {
    if (!TRAITS[layer]?.includes(trait)) return false;
    if (trait === "None") return true;
    if (FREE_TRAITS[layer]?.includes(trait)) return true;
    if (heldSomewhere(layer, trait, pickedUp)) return true;
    return unlockedBySome(layer, trait, feats);
}

/** The traits of one layer the player may wear, in TRAITS order. */
export function availableTraits(
    layer: Layer,
    feats: readonly string[],
    pickedUp: readonly HeldTrait[] = [],
): string[] {
    const list = TRAITS[layer] ?? [];
    return list.filter((trait) => isUnlocked(layer, trait, feats, pickedUp));
}

/**
 * The look with this layer moved to the next (step > 0) or previous (step < 0)
 * available trait, wrapping around. A layer with one available trait, or a step
 * of 0, gives the same look back. A trait that is not currently available (a
 * look from before a feat was lost) steps into the available list from its top.
 */
export function cycleTrait(
    look: Look,
    layer: Layer,
    step: number,
    feats: readonly string[],
    pickedUp: readonly HeldTrait[] = [],
): Look {
    const available = availableTraits(layer, feats, pickedUp);
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
export function fitLook(
    look: Look,
    feats: readonly string[],
    pickedUp: readonly HeldTrait[] = [],
): Look {
    const fitted: Look = { ...look };
    for (const layer of LAYER_ORDER) {
        if (!isUnlocked(layer, fitted[layer], feats, pickedUp)) fitted[layer] = DEFAULT_LOOK[layer];
    }
    return fitted;
}

/** The feat id that unlocks this trait, or null for a free trait, a maze
 *  pickup, "None" or an unknown one (pickups carry a rarity instead). */
export function unlockedBy(layer: Layer, trait: string): string | null {
    for (const [featId, entries] of Object.entries(UNLOCKS)) {
        if (entries.some((entry) => entry.layer === layer && entry.trait === trait)) return featId;
    }
    return null;
}
