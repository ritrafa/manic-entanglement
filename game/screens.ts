// The shell's whole front-of-house state as pure data: which screen is showing,
// what each action turns it into, and the lines of the end-of-run summary.
// Pure: no DOM, no timers, no audio — lib/GameState.ts drives these and reacts.

import type { DeathCause } from "./events";
import type { Tally } from "./run";

/** Everything the shell can show. */
export type Screen = "title" | "howto" | "countdown" | "playing" | "paused" | "settings" | "clear" | "over";

/** Everything that can move the shell between screens. */
export type ScreenAction =
    /** Enter, Space, the title image or a panel button. */
    | "confirm"
    /** The title menu's How to play, or Play itself when the how-to is unseen. */
    | "howto"
    /** The how-to's Back button. */
    | "back"
    /** Esc or P: pauses while playing, resumes while paused, closes settings. */
    | "pause"
    /** The title menu's or the pause panel's Settings entry. */
    | "settings"
    /** The tab became hidden. */
    | "hide"
    /** Start a fresh run through the countdown. */
    | "restart"
    /** Abandon the run and go back to the title. */
    | "quit"
    /** The countdown finished and the run started. */
    | "started"
    /** The level was cleared. */
    | "cleared"
    /** A level started: the way out of the clear screen. */
    | "levelStarted"
    /** The run died. */
    | "died";

/** One label/value row of the end-of-run summary. */
export interface SummaryLine {
    label: string;
    value: string;
}

/** What nextScreen may need beyond the current screen. */
export interface ScreenContext {
    /**
     * The screen "paused" was entered from, so resuming a pause taken during the
     * clear screen returns to "clear" — and only reaches "playing" again once the
     * next level has actually started. Defaults to "playing".
     */
    pausedFrom?: Screen;
    /**
     * True while the how-to was opened by the first Play: leaving it then runs
     * the countdown instead of going back to the title. Defaults to false.
     */
    howtoFromPlay?: boolean;
    /**
     * The screen "settings" was entered from, so Back (or Esc) returns there:
     * a settings visit opened from the pause goes back to the pause, the clock
     * staying stopped. Defaults to "title".
     */
    settingsFrom?: Screen;
}

/**
 * The screen that follows an action, or the same screen for every pair the game
 * does not own. The clock must never run while "paused", and a hidden tab always
 * comes back to a paused game: "hide" never resumes anything by itself.
 */
export function nextScreen(screen: Screen, action: ScreenAction, context: ScreenContext = {}): Screen {
    // Resuming a pause goes back where the pause came from; only a pause taken
    // during the clear screen waits for the next level before playing again.
    const resumeTo: Screen = context.pausedFrom === "clear" ? "clear" : "playing";
    switch (screen) {
        case "title":
            if (action === "confirm") return "countdown";
            if (action === "howto") return "howto";
            if (action === "settings") return "settings";
            return screen;
        case "howto":
            // Back, confirm or Esc closes it: to the countdown when the first
            // Play opened it, otherwise back to the title.
            if (action === "confirm" || action === "pause" || action === "back") {
                return context.howtoFromPlay ? "countdown" : "title";
            }
            return screen;
        case "countdown":
            return action === "started" ? "playing" : screen;
        case "playing":
            switch (action) {
                case "pause":
                case "hide":
                    return "paused";
                case "cleared":
                    return "clear";
                case "died":
                    return "over";
                case "restart":
                    return "countdown";
                case "quit":
                    return "title";
                default:
                    return screen;
            }
        case "paused":
            switch (action) {
                case "pause":
                case "confirm":
                    return resumeTo;
                case "settings":
                    return "settings";
                case "restart":
                    return "countdown";
                case "quit":
                    return "title";
                default:
                    // "hide" (and anything else) stays paused: returning to the
                    // tab must never resume the game by itself.
                    return screen;
            }
        case "settings":
            switch (action) {
                // Back, Esc or the panel's Back button returns where the visit
                // started; a pause taken from the game comes back to the pause,
                // so the clock never runs behind the settings panel.
                case "back":
                case "pause":
                    return context.settingsFrom === "paused" ? "paused" : "title";
                default:
                    // "hide" (and anything else) keeps the settings open.
                    return screen;
            }
        case "clear":
            switch (action) {
                case "pause":
                case "hide":
                    return "paused";
                case "levelStarted":
                    return "playing";
                case "died":
                    return "over";
                case "restart":
                    return "countdown";
                case "quit":
                    return "title";
                default:
                    return screen;
            }
        case "over":
            switch (action) {
                case "confirm":
                case "restart":
                    return "countdown";
                case "quit":
                    return "title";
                default:
                    return screen;
            }
        default:
            return screen;
    }
}

/** The cause of death in words for the summary. */
const CAUSE_TEXT: Record<DeathCause, string> = {
    time: "Out of time",
    move: "Out of energy",
    fight: "Lost a fight",
};

/** Milliseconds as m:ss: 75,400 becomes "1:15", 65,000 becomes "1:05". */
function formatClock(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Everything the summary shows, already measured by the shell. */
export interface SummaryInput {
    tally: Tally;
    score: number;
    /** The best score the run started against. */
    best: number;
    /** Whether this run beat that best (game/hud.ts isNewBest). */
    newBest: boolean;
    cause: DeathCause;
}

/**
 * The end-of-run summary as label/value rows: how the run ended, how deep it
 * got, what it scored against the best, and what it did on the way down.
 */
export function summaryLines({ tally, score, best, newBest, cause }: SummaryInput): SummaryLine[] {
    return [
        { label: "Cause", value: CAUSE_TEXT[cause] ?? CAUSE_TEXT.time },
        { label: "Depth reached", value: String(Math.max(1, Math.round(tally.depth))) },
        { label: "Score", value: String(Math.max(0, Math.round(score))) },
        { label: "Best", value: newBest ? "New best!" : String(Math.max(0, Math.round(best))) },
        { label: "Time", value: formatClock(tally.ms) },
        { label: "Enemies beaten", value: String(Math.max(0, Math.round(tally.kills))) },
        { label: "Pickups", value: String(Math.max(0, Math.round(tally.pickups))) },
    ];
}

/** True when two summaries show exactly the same rows, so the shell can skip a notify. */
export function sameSummary(a: SummaryLine[] | null, b: SummaryLine[] | null): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    return (
        a.length === b.length &&
        a.every((line, index) => line.label === b[index].label && line.value === b[index].value)
    );
}
