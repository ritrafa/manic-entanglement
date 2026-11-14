// The effects side of the run: which juice each event earns, as pure data.
// No DOM, no clocks, no randomness: lib/board.ts draws what fxFor hands out,
// and the shell (lib/GameState.ts) rate-limits the flashes and shakes through
// FxLimiter. Effects never touch the rules, the score or the events.

import { FX } from './config';
import type { GameEvent } from './events';

/** The three colours an effect can wear. */
export type FxTone = 'gold' | 'red' | 'teal';

/** How much motion the player asked for. */
export type Motion = 'full' | 'reduced';

export type Fx =
    /** Nudge the reptile after walking into a wall (dx/dy: -1, 0 or 1). */
    | { kind: 'bump'; dx: number; dy: number }
    /** A ring opening over the cell a pickup was taken on. */
    | { kind: 'pop'; x: number; y: number }
    /** count small particles thrown from the cell. */
    | { kind: 'burst'; x: number; y: number; count: number; tone: FxTone }
    /** A full-board colour wash, ms long (rate-limited: photosensitivity). */
    | { kind: 'flash'; tone: FxTone; ms: number }
    /** The board container jolts px pixels around for ms milliseconds. */
    | { kind: 'shake'; px: number; ms: number }
    /** The board container pulls toward the cell for ms milliseconds. */
    | { kind: 'zoom'; x: number; y: number; ms: number }
    /** A soft dark wash in and out, ms long: the calm stand-in for a flash. */
    | { kind: 'fade'; ms: number };

export interface FxContext {
    motion: Motion;
    /** The exit cell, used by levelClear; the board's top centre when omitted. */
    exit?: { x: number; y: number };
}

/** A burst count clamped to a whole number the board is willing to draw. */
function clampCount(count: number): number {
    if (!Number.isFinite(count)) return 0;
    return Math.min(FX.maxBurstCount, Math.max(0, Math.floor(count)));
}

/** A duration clamped to a whole number of milliseconds, never over half a second. */
function clampMs(ms: number): number {
    if (!Number.isFinite(ms)) return 0;
    return Math.min(FX.maxDurationMs, Math.max(0, Math.round(ms)));
}

/**
 * The effects one run event earns. With "reduced" the motion-heavy kinds are
 * gone — no bump, burst, shake or zoom — flashes soften into fades, and the
 * pop stays: it is a ring, not a jolt. An unknown event earns nothing.
 */
export function fxFor(event: GameEvent, context: FxContext): Fx[] {
    const reduced = context.motion === 'reduced';
    switch (event.type) {
        case 'blocked':
            return reduced ? [] : [{ kind: 'bump', dx: event.dx, dy: event.dy }];
        case 'pickup': {
            const pop: Fx = { kind: 'pop', x: event.x, y: event.y };
            if (reduced) return [pop];
            return [
                pop,
                { kind: 'burst', x: event.x, y: event.y, count: clampCount(FX.pickupBurstCount), tone: 'gold' },
            ];
        }
        case 'fight': {
            if (reduced) return [{ kind: 'fade', ms: clampMs(FX.fightFlashMs) }];
            return [
                { kind: 'burst', x: event.x, y: event.y, count: clampCount(FX.fightBurstCount), tone: 'red' },
                { kind: 'flash', tone: 'red', ms: clampMs(FX.fightFlashMs) },
                { kind: 'shake', px: FX.fightShakePx, ms: clampMs(FX.fightShakeMs) },
            ];
        }
        case 'hurt': {
            // The Knot's bite: the fight's answer, smaller and without a shake.
            if (reduced) return [{ kind: 'fade', ms: clampMs(FX.hurtFlashMs) }];
            return [
                { kind: 'burst', x: event.x, y: event.y, count: clampCount(FX.hurtBurstCount), tone: 'red' },
                { kind: 'flash', tone: 'red', ms: clampMs(FX.hurtFlashMs) },
            ];
        }
        case 'levelClear': {
            if (reduced) return [];
            const exit = context.exit ?? { x: 0, y: 0 };
            return [
                // The zoom into the exit is the level dive now (lib/board.ts
                // captureDive / playDive), played when the next level is built.
                { kind: 'burst', x: exit.x, y: exit.y, count: clampCount(FX.clearBurstCount), tone: 'teal' },
            ];
        }
        case 'levelStart':
            return [{ kind: 'fade', ms: clampMs(FX.levelStartFadeMs) }];
        case 'dead':
            if (reduced) return [{ kind: 'fade', ms: clampMs(FX.deadFlashMs) }];
            return [
                { kind: 'flash', tone: 'red', ms: clampMs(FX.deadFlashMs) },
                { kind: 'shake', px: FX.deadShakePx, ms: clampMs(FX.deadShakeMs) },
            ];
        default:
            return [];
    }
}

/** The two rate-limited kinds: more than three a second is a photosensitivity risk. */
export type FxLimitKind = 'shake' | 'flash';

/**
 * A sliding-window gate: at most FX.maxShakesPerWindow shakes and
 * FX.maxFlashesPerWindow flashes in any FX.limitWindowMs milliseconds, each
 * kind counted on its own. allow() answers whether this effect may still go
 * out at time `now` (milliseconds) and remembers it when it may.
 */
export class FxLimiter {
    private recent: Record<FxLimitKind, number[]> = { shake: [], flash: [] };

    allow(kind: FxLimitKind, now: number): boolean {
        const limit = kind === 'shake' ? FX.maxShakesPerWindow : FX.maxFlashesPerWindow;
        const kept = this.recent[kind].filter((at) => Number.isFinite(at) && at > now - FX.limitWindowMs);
        if (kept.length >= limit) {
            this.recent[kind] = kept;
            return false;
        }
        kept.push(now);
        this.recent[kind] = kept;
        return true;
    }
}

/** True when the energy, as a fraction of storage, has fallen under the warning line. */
export function lowEnergy(energyPct: number): boolean {
    return Number.isFinite(energyPct) && energyPct < FX.lowEnergyPct;
}

/**
 * How long the device should rumble for one run event, in milliseconds:
 * a pickup 10, a fight 30, death 80, anything else 0 (no vibration at all).
 * Pure data — the shell is the one that asks the hardware.
 */
export function hapticFor(event: GameEvent): number {
    switch (event.type) {
        case 'pickup':
            return 10;
        case 'fight':
            return 30;
        case 'dead':
            return 80;
        default:
            return 0;
    }
}

// --- Floating texts (drawn by float() in lib/board.ts) -----------------------
// Two run events in one tick (an enemy kill and the boost it drops) each get
// a floating line over their cell. Left alone they start on the very same
// pixel and rise as one unreadable smear. floatLineOffset is the whole
// decision: a pure count of the lines already stacked near the new text, so
// the board only has to apply what it returns.

/** The line box of a .message (styles/globals.css: font 16px/24px): one line. */
export const FLOAT_LINE_PX = 24;
/** Milliseconds a floating text rises (the CSS moveUp animation's length). */
export const FLOAT_RISE_MS = 2500;

/** One floating text on the board: the cell it started on and the moment
    (milliseconds) its rise began. */
export interface FloatText {
    x: number;
    y: number;
    startedAt: number;
}

/** True when two cells are the same or touch, each axis at most one apart. */
function cellsNear(ax: number, ay: number, bx: number, by: number): boolean {
    return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
}

/** A usable cell/time entry, or false for nonsense the board should ignore. */
function usable(text: FloatText): boolean {
    return Number.isFinite(text.x) && Number.isFinite(text.y) && Number.isFinite(text.startedAt);
}

/**
 * The pixel offset below its cell where a new floating text must start so it
 * never overlaps one already on screen: `active` holds the texts still on the
 * board (their cells and start times, in any order), the new one starts at
 * (cellX, cellY) at `now` (all times milliseconds). Texts are stacked in
 * start order; each sits one line below the lowest earlier text whose cell is
 * the same or a neighbour. The answer is the new text's offset in pixels: a
 * whole number of FLOAT_LINE_PX lines, 0 when nothing nearby is still rising.
 */
export function floatLineOffset(
    active: readonly FloatText[],
    cellX: number,
    cellY: number,
    now: number,
): number {
    if (!Number.isFinite(cellX) || !Number.isFinite(cellY) || !Number.isFinite(now)) return 0;
    // Only texts whose rise is running can share the board with the new one.
    const rising = active
        .filter((text) => usable(text) && text.startedAt <= now && now - text.startedAt < FLOAT_RISE_MS)
        .sort((a, b) => a.startedAt - b.startedAt);
    // Replay the stack in start order: each text's line is one under the
    // lowest earlier text near its cell. Then answer for the new text.
    const stacked: FloatText[] = [];
    const lines: number[] = [];
    let best = -1;
    for (let i = 0; i < rising.length; i += 1) {
        const text = rising[i];
        let line = 0;
        for (let j = 0; j < stacked.length; j += 1) {
            if (cellsNear(text.x, text.y, stacked[j].x, stacked[j].y)) {
                line = Math.max(line, lines[j] + 1);
            }
        }
        stacked.push(text);
        lines.push(line);
        if (cellsNear(cellX, cellY, text.x, text.y)) best = Math.max(best, line);
    }
    return (best + 1) * FLOAT_LINE_PX;
}
