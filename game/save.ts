// The shape of the stored save and its one-time migration. Pure data: no DOM and no
// localStorage — the browser shell reads and writes the JSON string around these.

/** The current scoring rule: 2 = depth, energy, kills and pickups (game/score.ts). */
export const SCORE_RULE = 2;

export interface BestRecord {
    /** Deepest level reached, counted in the current scoring rule. */
    descent: number;
}

export interface SaveData {
    /** The best run kept for the HUD bar, or null when none applies under this rule. */
    best: BestRecord | null;
    totals: {
        /** Which scoring rule the stored numbers were counted under. */
        scoreRule?: number;
        [key: string]: unknown;
    };
}

/** What a fresh save looks like: no best yet, already on the current rule. */
export function defaultSave(): SaveData {
    return { best: null, totals: { scoreRule: SCORE_RULE } };
}

/**
 * Bring a save up to the current scoring rule. Bests recorded under any other rule
 * were step counts and would be unbeatable or meaningless, so they are emptied once
 * and the rule is stamped. A save already on the rule is returned untouched.
 */
export function upgradeSave(data: SaveData): SaveData {
    if (data.totals.scoreRule === SCORE_RULE) return data;
    return { ...data, best: null, totals: { ...data.totals, scoreRule: SCORE_RULE } };
}

/** Parse the stored JSON into a save, migrating it; anything unusable becomes the default. */
export function loadSave(raw: string | null | undefined): SaveData {
    if (typeof raw !== "string" || raw.length === 0) return defaultSave();
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return defaultSave();
    }
    if (typeof parsed !== "object" || parsed === null) return defaultSave();
    const data = parsed as Partial<SaveData>;
    const descent = (data.best as BestRecord | null | undefined)?.descent;
    const best = typeof descent === "number" && Number.isFinite(descent) && descent >= 1
        ? { descent: Math.floor(descent) }
        : null;
    const totals = typeof data.totals === "object" && data.totals !== null
        ? { ...(data.totals as Record<string, unknown>) }
        : {};
    return upgradeSave({ best, totals });
}

/** The JSON string to store for a save. */
export function saveSave(data: SaveData): string {
    return JSON.stringify(data);
}
