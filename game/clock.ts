// The one rule that keeps a throttled tab from killing the player: a clock step is
// never trusted beyond `max` milliseconds. Pure maths: no DOM, no timers, no globals.

/** Default ceiling for one elapsed step, in milliseconds. */
export const MAX_DT_MS = 250;

/**
 * Clamp a measured elapsed time for one clock step.
 * Negative, NaN or non-finite input gives 0; anything above `max` gives `max`.
 */
export function clampDt(ms: number, max: number = MAX_DT_MS): number {
    if (!Number.isFinite(ms) || ms < 0) return 0;
    return Math.min(ms, max);
}
