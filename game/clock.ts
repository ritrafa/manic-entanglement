// The clock's safety valve: turn a wall-clock delta into a step the run may consume.
// A hidden tab suspends timers, so the first delta after returning can carry minutes;
// it must never drain the run in one go. Pure: no DOM, no timers.

/** Default ceiling for one step, in milliseconds. */
export const MAX_DT_MS = 250;

/**
 * Clamp an elapsed time in milliseconds for a single tick.
 * Negative, NaN or non-finite input gives 0; anything above `max` gives `max`.
 */
export function clampDt(ms: number, max: number = MAX_DT_MS): number {
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.min(ms, max);
}
