// The NFT attribute codec (NFT-PLAN N3): the pure bridge between a player's
// progress and the Core asset's Attributes plugin. An Entangled Reptile stores
// the look and the verified progress as `[{ key, value }]` attributes; this
// module encodes that list, decodes it back without ever throwing, merges
// verified runs into the progress with a watermark, and folds verified
// progress into the local save. Pure: no DOM, no fetch, no clocks - the
// caller passes every timestamp in, so the code runs in the browser and in
// Node alike.

import { DEFAULT_LOOK, LAYER_ORDER, type Layer, type Look } from "./sprite";
import { FEATS, evaluateFeats, featById, updateTotals } from "./feats";
import { isUnlocked, PICKUP_TRAITS, type HeldTrait } from "./wardrobe";
import {
    GEAR_IDS,
    GEAR_NAMES,
    gearCap,
    noGear,
    sanitizeGear,
    statsFromGear,
    type GearLevels,
    type Stats,
} from "./gear";
import { MODES, MODE_IDS, betterScore, type ModeId } from "./modes";
import type { Tally } from "./run";
import type { SaveData } from "./save";

/** One Core attribute entry, the shape the Attributes plugin stores. */
export interface AttributeEntry {
    key: string;
    value: string;
}

/** The two backgrounds there are (Q25): Void is the standard, the Solana
 *  gradient is the feat reward, saved with the loadout like a trait. */
export type Background = "Void" | "Solana";

/** The feat that rewards the Solana background (it also rewards Body Solana). */
export const BACKGROUND_FEAT = "still-water";

/** The look as the NFT stores it: the five sprite layers plus the background. */
export type NftLook = Look & { Background: string };

/** Everything the reptile carries on-chain, decoded. */
export interface NftProgress {
    /** The five layers and Background. */
    look: NftLook;
    /** Best score per mode id; Sprint's number is a time, so lower wins. */
    best: Record<string, number>;
    /** Lifetime counters: runs, kills, cleared, banked and deepest. */
    totals: Record<string, number>;
    /** Earned feat ids, in FEATS order. */
    feats: string[];
    /** Held maze pickups, the same { layer, trait } shape as the save's pickedUp. */
    traits: HeldTrait[];
    /** Gear levels per kind, each within its cap. */
    gear: GearLevels;
    /** The newest run already applied, in ms; 0 before the first sync. */
    synced: number;
}

/** One verified run as the verify card's proof payload hands it over. */
export interface VerifiedRun {
    /** When the server signed the proof, in ms. The merge watermark uses it. */
    issuedAt: number;
    mode: ModeId;
    tally: Tally;
    /** The score to rank by: milliseconds for Sprint, points elsewhere. */
    score: number;
    /** Traits kept at exits this run. */
    pickedUp: HeldTrait[];
    /** Gear banked at exits this run, levels per kind. */
    gear: Record<string, number>;
}

/** A fresh progress: the default look on Void, nothing earned, never synced. */
export function defaultProgress(): NftProgress {
    return {
        look: { ...DEFAULT_LOOK, Background: "Void" },
        best: {},
        totals: {},
        feats: [],
        traits: [],
        gear: noGear(),
        synced: 0,
    };
}

// ---------------------------------------------------------------------------
// Shared defensive readers

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite, non-negative number, or null when the text is not one. */
function nonNegativeNumber(text: unknown): number | null {
    if (typeof text !== "string" || text.trim() === "") return null;
    const value = Number(text);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

/** A copy of a record keeping only finite, non-negative numbers. */
function keepNumbers(value: unknown): Record<string, number> {
    const kept: Record<string, number> = {};
    if (!isRecord(value)) return kept;
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "number" && Number.isFinite(entry) && entry >= 0) kept[key] = entry;
    }
    return kept;
}

/** A copy of a held-pickup list keeping only { layer, trait } string pairs. */
function keepPickups(value: unknown): HeldTrait[] {
    if (!Array.isArray(value)) return [];
    const kept: HeldTrait[] = [];
    for (const entry of value) {
        if (isRecord(entry) && typeof entry.layer === "string" && typeof entry.trait === "string") {
            if (!kept.some((keep) => keep.layer === entry.layer && keep.trait === entry.trait)) {
                kept.push({ layer: entry.layer, trait: entry.trait });
            }
        }
    }
    return kept;
}

/** The feats list put back in FEATS order: known ids by table position,
 *  unknown ids kept after them in the order they arrived. */
function sortFeats(ids: readonly string[]): string[] {
    const rank = new Map(FEATS.map((feat, index) => [feat.id, index] as const));
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const id of Array.isArray(ids) ? ids : []) {
        if (typeof id === "string" && !seen.has(id)) {
            seen.add(id);
            unique.push(id);
        }
    }
    const arrival = new Map(unique.map((id, index) => [id, index] as const));
    const at = (id: string): number => (rank.has(id) ? rank.get(id)! : FEATS.length);
    return [...unique].sort((a, b) => {
        const diff = at(a) - at(b);
        return diff !== 0 ? diff : arrival.get(a)! - arrival.get(b)!;
    });
}

// ---------------------------------------------------------------------------
// base64url bitmasks over the FEATS and PICKUP_TRAITS tables

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** The base64url text of these bytes, padding left off. Pure JS: no Buffer,
 *  no btoa, so the same code runs in the browser and in Node. */
function toBase64Url(bytes: readonly number[]): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const n = (b0 << 16) | (b1 << 8) | b2;
        out += B64URL[(n >>> 18) & 63] + B64URL[(n >>> 12) & 63];
        if (i + 1 < bytes.length) out += B64URL[(n >>> 6) & 63];
        if (i + 2 < bytes.length) out += B64URL[n & 63];
    }
    return out;
}

/** The bytes a base64url text carries, or null when it is not base64url. */
function fromBase64Url(text: string): number[] | null {
    if (text.length % 4 === 1) return null;
    const bytes: number[] = [];
    let accumulator = 0;
    let bits = 0;
    for (const char of text) {
        const six = B64URL.indexOf(char);
        if (six === -1) return null;
        accumulator = (accumulator << 6) | six;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((accumulator >>> bits) & 0xff);
        }
    }
    return bytes;
}

/** The base64url bitmask with exactly these bit positions set over a list
 *  this long; positions outside it are dropped. An empty set encodes "". */
function encodeBitmask(indices: ReadonlySet<number>, count: number): string {
    const byteCount = Math.ceil(count / 8);
    const bytes = new Array<number>(byteCount).fill(0);
    for (const index of indices) {
        if (Number.isInteger(index) && index >= 0 && index < count) {
            bytes[index >> 3] |= 1 << (index & 7);
        }
    }
    // Trim whole trailing zero bytes so an empty or small list stays small.
    while (bytes.length > 0 && bytes[bytes.length - 1] === 0) bytes.pop();
    return toBase64Url(bytes);
}

/** The set bit positions of a base64url bitmask, capped to the known list;
 *  a broken or missing text gives none, and bits past the list are ignored. */
function decodeBitmask(text: unknown, count: number): Set<number> {
    const set = new Set<number>();
    if (typeof text !== "string" || text === "") return set;
    const bytes = fromBase64Url(text);
    if (bytes === null) return set;
    for (let byte = 0; byte < bytes.length; byte += 1) {
        for (let bit = 0; bit < 8; bit += 1) {
            const index = byte * 8 + bit;
            if (index >= count) break;
            if ((bytes[byte] & (1 << bit)) !== 0) set.add(index);
        }
    }
    return set;
}

// ---------------------------------------------------------------------------
// The known keys

/** The five sprite layers, in sprite order, then the background. */
const LOOK_KEYS = [...LAYER_ORDER, "Background"] as const;

/** The totals keys with their attribute names, in encoded order. */
const TOTAL_KEYS: readonly { key: string; field: string }[] = [
    { key: "Best Depth", field: "deepest" },
    { key: "Runs", field: "runs" },
    { key: "Kills", field: "kills" },
    { key: "Cleared", field: "cleared" },
    { key: "Banked", field: "banked" },
];

/** The gear attribute key of a kind ("Gear Boots" and the like). The prefix
 *  keeps these clear of the stat keys old reptiles already carry ("Speed",
 *  "Attack", ...), which ride through as unknown keys. */
function gearKey(id: (typeof GEAR_IDS)[number]): string {
    return `Gear ${GEAR_NAMES[id]}`;
}

/** Every key this codec writes; anything else in a keep list is unknown. */
const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
    ...LOOK_KEYS,
    ...MODE_IDS.map((id) => `Best ${MODES[id].name}`),
    ...TOTAL_KEYS.map((entry) => entry.key),
    "Feats",
    "Traits",
    ...GEAR_IDS.map(gearKey),
    "Synced",
    "Version",
]);

// ---------------------------------------------------------------------------
// Encoding

/** The whole progress as Core attributes: known keys in a fixed order, then
 *  the unknown keys of `keep` (the asset's current list) passed through
 *  unchanged and sorted after them. No key ever appears twice: a keep entry
 *  whose key the codec writes itself is dropped, the fresh value has it. */
export function encodeAttributes(
    progress: NftProgress,
    keep?: readonly unknown[],
): AttributeEntry[] {
    const safe = sanitizeProgress(progress);
    const list: AttributeEntry[] = [];
    const push = (key: string, value: string): void => { list.push({ key, value }); };

    for (const key of LOOK_KEYS) push(key, safe.look[key]);

    for (const id of MODE_IDS) {
        const best = safe.best[id];
        if (typeof best === "number" && Number.isFinite(best)) push(`Best ${MODES[id].name}`, String(best));
    }
    for (const entry of TOTAL_KEYS) {
        const value = safe.totals[entry.field];
        if (typeof value === "number" && Number.isFinite(value)) push(entry.key, String(Math.floor(value)));
    }

    push("Feats", encodeBitmask(new Set(safe.feats.map((id) => FEATS.findIndex((f) => f.id === id))), FEATS.length));
    push(
        "Traits",
        encodeBitmask(
            new Set(safe.traits.map((held) =>
                PICKUP_TRAITS.findIndex((pick) => pick.layer === held.layer && pick.trait === held.trait),
            )),
            PICKUP_TRAITS.length,
        ),
    );

    for (const id of GEAR_IDS) push(gearKey(id), String(safe.gear[id]));

    push("Synced", String(Math.floor(safe.synced)));
    push("Version", "1");

    // Unknown keys from the asset's current list ride along, unchanged and
    // sorted after the known ones, so stat keys of older reptiles survive.
    const written = new Set(list.map((entry) => entry.key));
    const extras = new Map<string, string>();
    for (const entry of Array.isArray(keep) ? keep : []) {
        if (!isRecord(entry)) continue;
        const { key, value } = entry;
        if (typeof key !== "string" || typeof value !== "string") continue;
        if (KNOWN_KEYS.has(key) || written.has(key) || extras.has(key)) continue;
        extras.set(key, value);
    }
    for (const key of [...extras.keys()].sort()) push(key, extras.get(key)!);

    return list;
}

// ---------------------------------------------------------------------------
// Decoding

/** The look value an attribute carries: any non-empty text is kept exactly
 *  as it is - the current art may not know it (a real holder wears Clothes
 *  "White"), and a save must never rewrite it to "None". Only a missing or
 *  broken value falls back, the way sanitizeLook does. */
function decodeLookValue(value: unknown, fallback: string): string {
    return typeof value === "string" && value !== "" ? value : fallback;
}

/** The asset's attribute list read back into progress. Never throws: a
 *  missing, broken or wrongly typed value reads as its default, bits past
 *  the known tables are ignored, and unknown keys are simply not looked at. */
export function decodeAttributes(list: unknown): NftProgress {
    const map = new Map<string, string>();
    if (Array.isArray(list)) {
        for (const entry of list) {
            if (!isRecord(entry)) continue;
            const { key, value } = entry;
            if (typeof key === "string" && typeof value === "string" && !map.has(key)) {
                map.set(key, value);
            }
        }
    }
    const fresh = defaultProgress();

    const look: NftLook = { ...fresh.look };
    for (const layer of LAYER_ORDER) look[layer] = decodeLookValue(map.get(layer), fresh.look[layer]);
    const background = map.get("Background");
    look.Background = background === "Solana" || background === "Void" ? background : "Void";

    const best: Record<string, number> = {};
    for (const id of MODE_IDS) {
        const value = nonNegativeNumber(map.get(`Best ${MODES[id].name}`));
        if (value !== null) best[id] = value;
    }

    const totals: Record<string, number> = {};
    for (const entry of TOTAL_KEYS) {
        const value = nonNegativeNumber(map.get(entry.key));
        if (value !== null) totals[entry.field] = Math.floor(value);
    }

    const feats: string[] = [];
    for (const index of decodeBitmask(map.get("Feats"), FEATS.length)) feats.push(FEATS[index].id);

    const traits: HeldTrait[] = [];
    for (const index of decodeBitmask(map.get("Traits"), PICKUP_TRAITS.length)) {
        const pick = PICKUP_TRAITS[index];
        traits.push({ layer: pick.layer, trait: pick.trait });
    }

    const gearSource: Record<string, unknown> = {};
    for (const id of GEAR_IDS) gearSource[id] = nonNegativeNumber(map.get(gearKey(id))) ?? 0;

    return {
        look,
        best,
        totals,
        feats,
        traits,
        gear: sanitizeGear(gearSource),
        synced: Math.floor(nonNegativeNumber(map.get("Synced")) ?? 0),
    };
}

/** A defensive copy of a progress: every field rebuilt through the same
 *  readers the decoder uses, so callers may hand in anything. */
export function sanitizeProgress(progress: NftProgress): NftProgress {
    const fresh = defaultProgress();
    if (!isRecord(progress)) return fresh;
    const look: NftLook = { ...fresh.look };
    if (isRecord(progress.look)) {
        for (const layer of LAYER_ORDER) {
            look[layer] = decodeLookValue(progress.look[layer], fresh.look[layer]);
        }
        look.Background = progress.look.Background === "Solana" ? "Solana" : "Void";
    }
    return {
        look,
        best: keepNumbers(progress.best),
        totals: keepNumbers(progress.totals),
        feats: sortFeats(Array.isArray(progress.feats) ? progress.feats : []),
        traits: keepPickups(progress.traits),
        gear: sanitizeGear(progress.gear),
        synced: Math.floor(
            typeof progress.synced === "number" && Number.isFinite(progress.synced) && progress.synced >= 0
                ? progress.synced
                : 0,
        ),
    };
}

// ---------------------------------------------------------------------------
// Merging verified runs

/** True when a run is shaped well enough to apply. */
function isVerifiedRun(value: unknown): value is VerifiedRun {
    if (!isRecord(value)) return false;
    return (
        typeof value.issuedAt === "number" && Number.isFinite(value.issuedAt)
        && isRecord(value.tally)
    );
}

/** True when this progress may wear the Solana gradient: only the reward
 *  feat grants it, and if no feat grants it yet, only Void. */
function solanaEarned(feats: readonly string[]): boolean {
    return featById(BACKGROUND_FEAT) !== null && feats.includes(BACKGROUND_FEAT);
}

/**
 * Fold verified runs into the progress. Runs at or before the watermark are
 * skipped; the rest are applied in issuedAt order - updateTotals, then
 * evaluateFeats on the totals as they just became, the mode best by the
 * mode's own rule, Best Depth as a max, the held traits as a union and the
 * gear as a per-kind max within each cap - and the watermark moves to the
 * newest applied issuedAt. Applying the same runs again changes nothing.
 * `chosenLook` is accepted only where each trait is unlocked in the merged
 * progress; a locked layer keeps its current trait, and the Solana
 * background only rides with its reward feat. Pure: the inputs are not touched.
 */
export function mergeProgress(
    current: NftProgress,
    runs: readonly unknown[],
    chosenLook?: Partial<NftLook> | null,
): { progress: NftProgress; applied: number } {
    const progress = sanitizeProgress(current);
    const watermark = progress.synced;
    const eligible = (Array.isArray(runs) ? runs : [])
        .filter(isVerifiedRun)
        .filter((run) => run.issuedAt > watermark)
        .sort((a, b) => a.issuedAt - b.issuedAt);

    let applied = 0;
    for (const run of eligible) {
        progress.totals = updateTotals(progress.totals, run.tally);
        const fresh = evaluateFeats(progress.feats, run.tally, progress.totals);
        if (fresh.length > 0) progress.feats = sortFeats([...progress.feats, ...fresh]);

        // Best Depth is a max; updateTotals keeps deepest rising, and a broken
        // tally depth simply never raises it.
        const depth = run.tally.depth;
        if (typeof depth === "number" && Number.isFinite(depth)) {
            progress.totals.deepest = Math.max(progress.totals.deepest ?? 0, Math.max(1, Math.floor(depth)));
        }

        if (
            typeof run.mode === "string" && (MODE_IDS as readonly string[]).includes(run.mode)
            && typeof run.score === "number" && Number.isFinite(run.score)
        ) {
            const id = run.mode as ModeId;
            if (betterScore(id, run.score, progress.best[id])) progress.best[id] = run.score;
        }

        for (const held of keepPickups(run.pickedUp)) {
            if (!progress.traits.some((have) => have.layer === held.layer && have.trait === held.trait)) {
                progress.traits.push(held);
            }
        }

        const banked = sanitizeGear(run.gear);
        for (const id of GEAR_IDS) {
            progress.gear[id] = Math.min(gearCap(id), Math.max(progress.gear[id], banked[id]));
        }

        progress.synced = Math.max(progress.synced, Math.floor(run.issuedAt));
        applied += 1;
    }

    if (chosenLook !== null && chosenLook !== undefined && isRecord(chosenLook)) {
        for (const layer of LAYER_ORDER) {
            const trait = chosenLook[layer];
            if (typeof trait === "string" && isUnlocked(layer, trait, progress.feats, progress.traits)) {
                progress.look[layer] = trait;
            }
        }
        if (chosenLook.Background === "Void") {
            progress.look.Background = "Void";
        } else if (chosenLook.Background === "Solana" && solanaEarned(progress.feats)) {
            progress.look.Background = "Solana";
        }
    }

    return { progress, applied };
}

// ---------------------------------------------------------------------------
// Versioning for the image route

/** The bytes of a text, UTF-8, without leaning on TextEncoder being global. */
function utf8Bytes(text: string): number[] {
    const bytes: number[] = [];
    for (const char of text) {
        const code = char.codePointAt(0)!;
        if (code < 0x80) bytes.push(code);
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        else bytes.push(
            0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f),
        );
    }
    return bytes;
}

/**
 * Eight hex characters of a 32-bit FNV-1a hash over the encoded attribute
 * list ("key\u0000value\u0000" per entry, in encoded order). The image route
 * versions its URLs with it, so a progress change lands a new URL.
 */
export function progressVersion(progress: NftProgress): string {
    const list = encodeAttributes(progress);
    let text = "";
    for (const entry of list) text += `${entry.key}\u0000${entry.value}\u0000`;
    let hash = 0x811c9dc5;
    for (const byte of utf8Bytes(text)) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// The local save

/** The derived stats of a progress (Attack, Defense, Speed and the rest).
 *  They are NOT stored on-chain: the metadata route derives them with
 *  statsFromGear through this helper. */
export function displayStats(progress: NftProgress): Stats {
    return statsFromGear(sanitizeProgress(progress).gear);
}

/** The progress a local save stands on, for the verified merge on load
 *  (Q24). The look is kept as the save has it; the Solana background only
 *  reads as earned when its reward feat is there. */
export function progressFromSave(save: SaveData): NftProgress {
    const fresh = defaultProgress();
    if (!isRecord(save)) return fresh;
    const look: NftLook = { ...fresh.look };
    if (isRecord(save.look)) {
        for (const layer of LAYER_ORDER) {
            look[layer] = decodeLookValue(save.look[layer], fresh.look[layer]);
        }
        if (save.look.Background === "Solana") look.Background = "Solana";
    }
    const feats = sortFeats(Array.isArray(save.feats) ? save.feats.filter((id) => typeof id === "string") : []);
    look.Background = look.Background === "Solana" && solanaEarned(feats) ? "Solana" : "Void";
    return {
        look,
        best: keepNumbers(save.best),
        totals: keepNumbers(save.totals),
        feats,
        traits: keepPickups(save.pickedUp),
        gear: sanitizeGear(save.gear),
        synced: 0,
    };
}

/** The save with verified progress folded in (Q24): numbers take the better
 *  value (each mode best by its own rule, the rest as maxima), feats and
 *  held traits are unions, gear is a capped per-kind max, and the local look
 *  is kept exactly as the player wears it. The save is not mutated. */
export function saveWithProgress(save: SaveData, progress: NftProgress): SaveData {
    const safe = sanitizeProgress(progress);
    const best: Record<string, number> = { ...keepNumbers(save?.best) };
    for (const [id, value] of Object.entries(safe.best)) {
        const have = best[id];
        const better = (MODE_IDS as readonly string[]).includes(id)
            ? betterScore(id as ModeId, value, have)
            : have === undefined || value > have;
        if (better) best[id] = value;
    }
    const totals: Record<string, number> = { ...keepNumbers(save?.totals) };
    for (const [key, value] of Object.entries(safe.totals)) {
        totals[key] = Math.max(totals[key] ?? 0, value);
    }
    const pickedUp = keepPickups(save?.pickedUp);
    for (const held of safe.traits) {
        if (!pickedUp.some((have) => have.layer === held.layer && have.trait === held.trait)) {
            pickedUp.push(held);
        }
    }
    const gear = { ...sanitizeGear(save?.gear) };
    for (const id of GEAR_IDS) {
        gear[id] = Math.min(gearCap(id), Math.max(gear[id], safe.gear[id]));
    }
    return {
        ...save,
        best,
        totals,
        feats: sortFeats([...(Array.isArray(save?.feats) ? save.feats : []), ...safe.feats]),
        pickedUp,
        gear,
    };
}
