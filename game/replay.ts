// The verifier's half of the run log (game/runlog.ts): a decoded log goes in,
// the exact result of the recorded run comes out. replay builds the same Run
// the live game built (the log's header: seed, gear, mode, feats and held
// traits; modifiers on, no overrides), starts it and applies the recorded
// calls in order. An event the live shell could never have produced — a tool
// the run does not hold, a next level outside "clear", a non-cardinal move —
// answers null rather than a different result. Pure: no DOM, no clocks.

import { Run, type Tally } from "./run";
import { MODES, type ModeId } from "./modes";
import { TOOL_IDS, type ToolId } from "./tools";
import { DIR_DELTAS, type Dir } from "./maze";
import type { GearLevels } from "./gear";
import type { RunLog, RunLogEvent } from "./runlog";

/** A trait the run kept at an exit (the "traitKept" story of game/run.ts). */
export interface BankedTrait {
    layer: string;
    trait: string;
    rarity: string;
}

/** What a replayed run ended as: the numbers the shell reads from a live one. */
export interface ReplayResult {
    /** The tally the live run stood on when its calls ran out. */
    tally: Tally;
    /** What the shell scores this mode by: milliseconds for a time mode, else score. */
    score: number;
    /** Deepest level reached, from the tally. */
    depth: number;
    /** Which of the four ways to play this was. */
    mode: ModeId;
    /** The traits the run banked at its exits, in the order they were kept. */
    pickedUp: BankedTrait[];
    /** The gear levels the run kept for good at its exits. */
    gear: GearLevels;
    /** True when the calls ran out on a dead, finished or abandoned run. */
    ended: boolean;
}

/** True for the shell's own steps: one cell, cardinal. */
function isCardinal(dx: unknown, dy: unknown): boolean {
    return (dx === 0 && (dy === -1 || dy === 1)) || (dy === 0 && (dx === -1 || dx === 1));
}

/** True for a shape replay can trust: a versioned header and an event array. */
function looksLikeLog(log: RunLog | null | undefined): log is RunLog {
    if (log === null || log === undefined || typeof log !== "object") return false;
    if (log.v !== 1) return false;
    if (!Number.isInteger(log.seed) || (log.seed as number) < 0) return false;
    if (!Array.isArray(log.events)) return false;
    return true;
}

/**
 * Play a recorded log on a fresh Run and return the result, or null when the
 * log is not one a live run could have written: a broken header, an unknown
 * tool, a Cut without a direction, a tool use the run must refuse, a next
 * level outside "clear" or an abandon of a run that never left "ready".
 */
export function replay(log: RunLog | null | undefined): ReplayResult | null {
    if (!looksLikeLog(log)) return null;
    const mode = MODES[log.mode];
    if (mode === undefined) return null;

    const run = new Run({
        seed: log.seed,
        gear: log.gear,
        mode,
        feats: log.feats,
        pickedUp: log.pickedUp,
    });
    run.start();
    if (run.phase !== "playing") return null;

    for (const event of log.events) {
        if (event === null || typeof event !== "object") return null;
        const applied = applyEvent(run, event);
        if (!applied) return null;
    }

    // The traits the run kept: the exits' "traitKept" events, in order.
    const pickedUp: BankedTrait[] = [];
    for (const event of run.takeEvents()) {
        if (event.type === "traitKept") {
            pickedUp.push({ layer: event.layer, trait: event.trait, rarity: event.rarity });
        }
    }

    return {
        tally: { ...run.tally, toolsUsed: { ...run.tally.toolsUsed } },
        // What the shell reads for this mode's result: a time mode ranks by
        // milliseconds, every other mode by score (lib/GameState.ts).
        score: mode.scoring === "time" ? run.tally.ms : run.score,
        depth: run.tally.depth,
        mode: mode.id,
        pickedUp,
        gear: { ...run.banked },
        ended: run.phase !== "playing" && run.phase !== "clear",
    };
}

/** One recorded call on the live run; false when the run must refuse it. */
function applyEvent(run: Run, event: RunLogEvent): boolean {
    switch (event.kind) {
        case "tick":
            // The log only ever holds whole positive milliseconds; anything
            // else was not written by a live shell.
            if (!Number.isInteger(event.ms) || event.ms <= 0) return false;
            run.tick(event.ms);
            return true;
        case "move":
            // The shell only ever steps one cell, cardinally.
            if (!isCardinal(event.dx, event.dy)) return false;
            run.move(event.dx, event.dy);
            return true;
        case "tool": {
            if (!(TOOL_IDS as readonly string[]).includes(event.id as ToolId)) return false;
            if (event.id === "cut") {
                if (event.dir === undefined || !(event.dir in DIR_DELTAS)) return false;
                // A live shell records a Cut only when it took effect.
                return run.useTool("cut", event.dir);
            }
            if (event.dir !== undefined) return false;
            return run.useTool(event.id);
        }
        case "next":
            // A live shell advances only from "clear".
            if (run.phase !== "clear") return false;
            run.nextLevel();
            return true;
        case "abandon":
            // Abandoning a run that never started changes nothing: no live
            // shell ever logged it.
            if (run.phase === "ready") return false;
            run.abandon();
            return true;
        default:
            return false;
    }
}
