// The one HUD model: every number and percentage the head-up display shows,
// computed in one place from the run and the best score before the run.
// Pure data only — nothing under game/ may reach for the DOM.

import { lowEnergy } from "./fx";
import type { RunStats } from "./run";

/** Everything the HUD renders, already formatted, so React only has to print it. */
export interface HudModel {
    /** The energy as plain number text, e.g. "87" — a whole number that never
     *  goes below 0; the HUD pairs it with its own "Energy" label. */
    energyText: string;
    /** The energy bar's width, always between 0 and 100. */
    energyPct: number;
    /** True when the energy sits under the warning line (game/fx.ts lowEnergy):
     *  the HUD shows the bar's low state and the words "Energy low". */
    energyLow: boolean;
    /** The score as plain number text, e.g. "12"; the HUD pairs it with its
     *  own "Score" label. */
    scoreText: string;
    /** The progress bar's width toward the best, 0 to 100; 0 while the best is 0. */
    bestPct: number;
    /** The level as text with one decimal, e.g. "3.0". */
    level: string;
    /** The attack stat as text with one decimal, e.g. "1.2". */
    attack: string;
    /** The defense stat as text with one decimal, e.g. "1.0". */
    defense: string;
    /** The drain rate as a percentage: round(100 / speed), 100 at the start, lower is better. */
    clockPct: number;
    /** The energy cost of a step as a percentage: round(consumption * 100). */
    stepPct: number;
}

/** The plain read of a run that hudModel needs; a real Run satisfies it. */
export interface HudRun {
    energy: number;
    score: number;
    level: number;
    stats: RunStats;
}

/** The value, or the fallback when it is NaN or infinite. */
function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

/** Pin a number into [low, high]; NaN lands on low. */
function clamp(value: number, low: number, high: number): number {
    if (!Number.isFinite(value)) return low;
    return Math.min(Math.max(value, low), high);
}

/** One decimal place as text: 3 becomes "3.0", 1.24 becomes "1.2", NaN becomes "0.0". */
function oneDecimal(value: number): string {
    return (Math.round(finiteOr(value, 0) * 10) / 10).toFixed(1);
}

/**
 * The whole HUD from one run and the best score it is measured against.
 * A best of 0 gives a 0% progress bar, never NaN%; energy below 0 or above the
 * storage is clamped, and a missing or broken storage reads as an empty bar.
 */
export function hudModel(run: HudRun, best: number): HudModel {
    const energy = finiteOr(run.energy, 0);
    const storage = finiteOr(run.stats.storage, 0);
    const score = Math.max(0, Math.round(finiteOr(run.score, 0)));
    const safeBest = Math.max(0, finiteOr(best, 0));
    const energyPct = storage > 0 ? clamp((energy / storage) * 100, 0, 100) : 0;
    return {
        energyText: `${Math.max(0, Math.round(energy))}`,
        energyPct,
        energyLow: lowEnergy(energyPct / 100),
        scoreText: `${score}`,
        bestPct: safeBest > 0 ? clamp((score / safeBest) * 100, 0, 100) : 0,
        level: oneDecimal(run.level),
        attack: oneDecimal(run.stats.attack),
        defense: oneDecimal(run.stats.defense),
        clockPct: clamp(Math.round(100 / finiteOr(run.stats.speed, 0)), 0, 100),
        stepPct: clamp(Math.round(finiteOr(run.stats.consumption, 0) * 100), 0, 100),
    };
}

/** True only for a real record: strictly above the best before the run, and above 0. */
export function isNewBest(score: number, bestBefore: number): boolean {
    return score > 0 && score > bestBefore;
}

/** True when two models show exactly the same thing, so the shell can skip a notify. */
export function sameHudModel(a: HudModel, b: HudModel): boolean {
    return a.energyText === b.energyText
        && a.energyPct === b.energyPct
        && a.energyLow === b.energyLow
        && a.scoreText === b.scoreText
        && a.bestPct === b.bestPct
        && a.level === b.level
        && a.attack === b.attack
        && a.defense === b.defense
        && a.clockPct === b.clockPct
        && a.stepPct === b.stepPct;
}
