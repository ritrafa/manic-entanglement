// The one versioned save object: a single key, a version number, and a load that
// never throws. Pure data: the shell hands the storage in as an argument (tests
// pass a plain object; the browser passes its local storage; the server passes
// null), so nothing here reaches for a global.

import { UNLOCKS } from "./wardrobe";

/** The slice of Storage the save needs, or null where storage is missing or blocked. */
export type StorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
} | null;

/** Everything the game keeps between visits. Later cards add fields; the key never changes. */
export interface SaveData {
    /** The save format version; loadSave only understands 1. */
    v: 1;
    /** Best scores by name, e.g. { descent: 42 }. */
    best: Record<string, number>;
    /** Reserved for the settings screen. */
    settings: Record<string, unknown>;
    /** Reserved for owned gear. */
    gear: Record<string, number>;
    /** Lifetime counters. */
    totals: Record<string, number>;
    /** Reserved for taken feats. */
    feats: string[];
    /** The saved look, or null when none was kept. */
    look: Record<string, string> | null;
    /** One-time messages already shown ("howto" and the like), plus the
     *  wardrobe's trait markers, one key per card as trait:<Layer>:<Trait>.
     *  Only traits a feat unlocks can be new; free traits never carry a
     *  marker. A save kept before the markers existed holds no trait key at
     *  all, and loadSave then seeds one for every trait its feats already
     *  unlocked: an old save reads as everything seen, never waking up with
     *  "New" tags. From the first marker on, an unseen feat trait stays new
     *  until the wardrobe is next closed. */
    seen: Record<string, boolean>;
}

/** The one storage key every save lives under. */
export const SAVE_KEY = "manic-entanglement.save";

/** A fresh save: no best, nothing kept. A new object every call, so callers may mutate it. */
export function defaultSave(): SaveData {
    return {
        v: 1,
        best: {},
        settings: {},
        gear: {},
        totals: {},
        feats: [],
        look: null,
        seen: {},
    };
}

/** True for a JSON object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A copy of a stored record, or the fresh value when the stored one is not an object. */
function keepRecord<T>(value: unknown, fresh: T): T | Record<string, unknown> {
    return isRecord(value) ? { ...value } : fresh;
}

/** A copy of a stored record keeping only finite, non-negative numbers. */
function keepNumbers(value: unknown): Record<string, number> {
    const kept: Record<string, number> = {};
    if (!isRecord(value)) return kept;
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "number" && Number.isFinite(entry) && entry >= 0) kept[key] = entry;
    }
    return kept;
}

/** The seen keys of every trait these feats unlock, form trait:<Layer>:<Trait>
 *  (the unlock table lives in game/wardrobe.ts; free traits are not in it and
 *  never carry a marker). */
function featTraitKeys(feats: readonly string[]): string[] {
    const keys: string[] = [];
    for (const id of feats) {
        for (const entry of UNLOCKS[id] ?? []) keys.push(`trait:${entry.layer}:${entry.trait}`);
    }
    return keys;
}

/** A copy of a stored record keeping only true flags (the seen markers). */
function keepBooleans(value: unknown): Record<string, boolean> {
    const kept: Record<string, boolean> = {};
    if (!isRecord(value)) return kept;
    for (const [key, entry] of Object.entries(value)) {
        if (entry === true) kept[key] = true;
    }
    return kept;
}

/** A copy of a stored record keeping only strings. */
function keepStrings(value: unknown): Record<string, string> | null {
    if (!isRecord(value)) return null;
    const kept: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "string") kept[key] = entry;
    }
    return kept;
}

/**
 * Read the save from a storage, never throwing: null storage, a missing key,
 * broken JSON, a non-object or a save not at version 1 all give defaultSave().
 * Any other stored object comes back with every missing or wrongly typed
 * top-level field replaced from defaultSave(); unknown extra fields are kept,
 * since a newer version of the game may have written them.
 */
export function loadSave(storage: StorageLike): SaveData {
    if (storage === null) return defaultSave();
    let raw: string | null;
    try {
        raw = storage.getItem(SAVE_KEY);
    } catch {
        return defaultSave();
    }
    if (typeof raw !== "string") return defaultSave();
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return defaultSave();
    }
    if (!isRecord(parsed) || parsed.v !== 1) return defaultSave();
    const fresh = defaultSave();
    const feats = Array.isArray(parsed.feats)
        ? parsed.feats.filter((f): f is string => typeof f === "string")
        : fresh.feats;
    const seen = keepBooleans(parsed.seen);
    // A save written before the wardrobe kept trait markers holds no trait key
    // at all: seed one for every trait its feats already unlocked, so an old
    // save reads as everything seen and nothing wears a "New" tag. A save that
    // carries markers is left exactly as kept: a feat trait missing from it is
    // genuinely new, unlocked since the wardrobe was last closed.
    if (!Object.keys(seen).some((key) => key.startsWith("trait:"))) {
        for (const key of featTraitKeys(feats)) seen[key] = true;
    }
    return {
        ...fresh,
        ...parsed,
        v: 1,
        best: keepNumbers(parsed.best),
        settings: keepRecord(parsed.settings, fresh.settings),
        gear: keepNumbers(parsed.gear),
        totals: keepNumbers(parsed.totals),
        feats,
        look: keepStrings(parsed.look),
        seen,
    } as SaveData;
}

/**
 * A copy of the save with all progress wiped: `best`, `gear`, `totals` and
 * `feats` return to their fresh defaults, while `settings`, `look`, `seen` and
 * any other field (a `scoreRule`, a field a newer version added) stay as they
 * were. The stored object itself is not touched.
 */
export function resetProgress(save: SaveData): SaveData {
    const fresh = defaultSave();
    return {
        ...save,
        v: 1,
        best: fresh.best,
        gear: fresh.gear,
        totals: fresh.totals,
        feats: fresh.feats,
    };
}

/**
 * Write the save to a storage. Returns true on success, and false — never a
 * throw — when storage is null, setItem throws (private browsing, blocked site
 * data, a full quota) or the data cannot be serialised.
 */
export function writeSave(storage: StorageLike, data: SaveData): boolean {
    if (storage === null) return false;
    try {
        storage.setItem(SAVE_KEY, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}
