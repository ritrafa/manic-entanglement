// The feats: a dozen one-time goals that point at the interesting things a run
// can do. Each is earned once, judged purely from the finished run's tally and
// the lifetime totals — no daily obligations, no countdowns, nothing lost by not playing,
// and nothing here can change the rules of a run. Pure data and pure tests:
// no DOM, no clocks, no global randomness.

import type { Tally } from "./run";
import { TOOL_IDS } from "./tools";
import { MODES } from "./modes";

/** One feat: an id to remember it by, a name, one line of text and its test. */
export interface Feat {
    id: string;
    /** The name the summary and the feats screen print. */
    name: string;
    /** One short sentence saying what it asks; never over 80 characters. */
    text: string;
    /** True when this feat stands earned for the finished run and the totals. */
    test(tally: Tally, totals: Record<string, number>): boolean;
}

/** A lifetime counter that reads as 0 when missing or broken. */
function count(totals: Record<string, number>, key: string): number {
    const value = totals?.[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** A tally number that reads as 0 when missing or broken. */
function num(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The levels a Sprint run has to clear to have finished (game/modes.ts). */
const SPRINT_LEVELS = MODES.sprint.levels ?? 5;

/** Every feat, in the order the feats screen lists them and evaluation walks. */
export const FEATS: readonly Feat[] = [
    {
        id: "first-exit", name: "First Exit",
        text: "Clear a level and walk out through the exit for the first time.",
        test: (t) => num(t.cleared) >= 1,
    },
    {
        id: "depth-5", name: "Down the Hole",
        text: "Reach depth 5 in a single run.",
        test: (t) => num(t.depth) >= 5,
    },
    {
        id: "depth-10", name: "Deep Diver",
        text: "Reach depth 10 in a single run.",
        test: (t) => num(t.depth) >= 10,
    },
    {
        id: "photo-finish", name: "Photo Finish",
        text: "Arrive at an exit with 5 energy or less left on the clock.",
        test: (t) => t.minExitEnergy !== null && t.minExitEnergy !== undefined && t.minExitEnergy <= 5,
    },
    {
        id: "no-toll", name: "No Toll",
        text: "Clear three levels in one run without defeating a single enemy.",
        test: (t) => num(t.cleared) >= 3 && num(t.kills) === 0,
    },
    {
        id: "toll-road", name: "Toll Road",
        text: "Defeat 50 enemies in total, across all your runs.",
        test: (_t, totals) => count(totals, "kills") >= 50,
    },
    {
        id: "warden", name: "Warden Breaker",
        text: "Beat a Warden, the heaviest thing the maze sends.",
        test: (t) => num(t.wardens) >= 1,
    },
    {
        id: "collector", name: "Collector",
        text: "Bank 25 pieces of gear in total, kept for good at exits.",
        test: (_t, totals) => count(totals, "banked") >= 25,
    },
    {
        id: "toolbox", name: "Toolbox",
        text: "Use every kind of tool — Anchor, Twist and Cut — in one run.",
        test: (t) => TOOL_IDS.every((id) => num(t.toolsUsed?.[id]) >= 1),
    },
    {
        id: "in-the-dark", name: "In the Dark",
        text: "Clear a level while a Blackout dims the maze around you.",
        test: (t) => num(t.darkCleared) >= 1,
    },
    {
        id: "sprinter", name: "Sprinter",
        text: "Finish a Sprint run — all five levels — in under a minute.",
        test: (t) => t.mode === "sprint" && num(t.cleared) >= SPRINT_LEVELS && num(t.ms) < 60_000,
    },
    {
        id: "still-water", name: "Still Water",
        text: "Reach depth 8 in Zen, where the clock never runs.",
        test: (t) => t.mode === "zen" && num(t.depth) >= 8,
    },
];

/** Look a feat up by id; null when nothing carries that id. */
export function featById(id: string): Feat | null {
    return FEATS.find((feat) => feat.id === id) ?? null;
}

/**
 * Fold one finished run into the lifetime counters: `runs`, `kills`, `cleared`
 * and `banked` grow by what the run did, `deepest` only ever rises, and every
 * other key (a `scoreRule`, a `dailyDay`, anything a later card added) is kept
 * as it was. The input object is never mutated.
 */
export function updateTotals(totals: Record<string, number>, tally: Tally): Record<string, number> {
    const next: Record<string, number> = { ...(totals ?? {}) };
    next.runs = count(next, "runs") + 1;
    next.kills = count(next, "kills") + Math.max(0, num(tally.kills));
    next.cleared = count(next, "cleared") + Math.max(0, num(tally.cleared));
    next.banked = count(next, "banked") + Math.max(0, num(tally.banked));
    next.deepest = Math.max(count(next, "deepest"), Math.max(1, num(tally.depth)));
    return next;
}

/**
 * The ids the run earns that are not earned yet, in FEATS order: the tally and
 * the totals (as they stand after updateTotals) decide, and an id already in
 * `earned` never comes back — unknown ids in `earned` are simply ignored.
 */
export function evaluateFeats(
    earned: readonly string[],
    tally: Tally,
    totals: Record<string, number>,
): string[] {
    const have = new Set(Array.isArray(earned) ? earned : []);
    const fresh: string[] = [];
    for (const feat of FEATS) {
        if (have.has(feat.id)) continue;
        if (feat.test(tally, totals)) fresh.push(feat.id);
    }
    return fresh;
}

/**
 * How the collection stands: `have` counts the distinct known ids among the
 * earned ones (unknown ids do not count), `of` is the number of feats there is.
 */
export function featProgress(earned: readonly string[]): { have: number; of: number } {
    const known = new Set(FEATS.map((feat) => feat.id));
    const unique = new Set(Array.isArray(earned) ? earned : []);
    let have = 0;
    for (const id of unique) {
        if (known.has(id)) have += 1;
    }
    return { have, of: FEATS.length };
}
