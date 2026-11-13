// The replay: one RunLog in, the finished run out. It builds a fresh Run from
// the log's own options (modifiers on, no shift overrides) and applies the
// recorded calls in order, so the numbers it returns are the numbers the live
// run reached. An event the live game could never have produced — a tool the
// run does not hold, a step outside the playing phase — ends the replay with
// null. Pure: no DOM, no clocks, no global randomness.

import { Run, type Tally, type RunPhase } from "./run";
import { MODES, type ModeId } from "./modes";
import type { GearLevels } from "./gear";
import type { HeldTrait } from "./wardrobe";
import type { RunLog } from "./runlog";

/** Read the phase without the compiler narrowing it across method calls. */
function phaseOf(run: Run): RunPhase {
    return run.phase;
}

/** What a finished replay says about its run, the way the shell reads them. */
export interface ReplayResult {
    /** The tally the run reached, exactly as the live Run kept it. */
    tally: Tally;
    /** The score on the board when the run ended. */
    score: number;
    /** The deepest level reached, from the tally. */
    depth: number;
    /** Which of the four ways to play this was. */
    mode: ModeId;
    /** The traits the run banked at exits, in the order they were kept. */
    pickedUp: HeldTrait[];
    /** The gear levels the run ended on: the bank, kept through death. */
    gear: GearLevels;
    /** True when the run ended: dead, finished, or abandoned after starting. */
    ended: boolean;
}

/**
 * Play a log against a fresh Run and report what it reached, or null when an
 * event does not fit the run — a tool with no charge, a step or a tick
 * outside the playing phase, a next level that was not cleared or a start
 * into a live run. None of those come from the live shell, so a log carrying
 * one is not a record of a real run.
 */
export function replay(log: RunLog): ReplayResult | null {
    if (typeof log !== "object" || log === null) return null;
    const rules = MODES[log.mode];
    if (rules === undefined) return null;
    const run = new Run({
        seed: log.seed,
        gear: log.gear,
        mode: rules,
        feats: log.feats,
        pickedUp: log.pickedUp,
    });
    const banked: HeldTrait[] = [];
    let started = false;

    for (const event of log.events) {
        switch (event.t) {
            case "s":
                if (run.phase !== "ready" && run.phase !== "dead" && run.phase !== "done") return null;
                run.start();
                // Read the phase through a function so the compiler does not
                // narrow it across the call, the way game/bot.ts does.
                if (phaseOf(run) === "playing") started = true;
                break;
            case "t":
                run.tick(event.ms);
                break;
            case "m":
                if (run.phase !== "playing") return null;
                run.move(event.dx, event.dy);
                break;
            case "o":
                if (run.phase !== "playing") return null;
                if (!run.useTool(event.id, event.dir)) return null;
                break;
            case "n":
                if (run.phase !== "clear") return null;
                run.nextLevel();
                break;
            case "x":
                run.abandon();
                break;
            default:
                return null;
        }
        // The shell reads the banked traits from "traitKept" events; so does this.
        for (const emitted of run.takeEvents()) {
            if (emitted.type === "traitKept") {
                banked.push({ layer: emitted.layer, trait: emitted.trait });
            }
        }
    }

    const phase = run.phase;
    return {
        tally: { ...run.tally, toolsUsed: { ...run.tally.toolsUsed } },
        score: run.score,
        depth: run.tally.depth,
        mode: log.mode,
        pickedUp: banked,
        gear: { ...run.banked },
        ended: phase === "dead" || phase === "done" || (started && phase === "ready"),
    };
}
