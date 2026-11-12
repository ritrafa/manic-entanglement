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
        case 'levelClear': {
            if (reduced) return [];
            const exit = context.exit ?? { x: 0, y: 0 };
            return [
                { kind: 'burst', x: exit.x, y: exit.y, count: clampCount(FX.clearBurstCount), tone: 'teal' },
                { kind: 'zoom', x: exit.x, y: exit.y, ms: clampMs(FX.clearZoomMs) },
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
