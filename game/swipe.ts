// One touch, one meaning: tap, swipe or nothing. Pure geometry and timing — no DOM.

/** A touch that was too short and still to be a swipe: the browser's own click handles it. */
export interface TapResult {
    kind: "tap";
}

/** A deliberate drag: exactly one axis carries the direction (-1, 0 or 1). */
export interface SwipeResult {
    kind: "swipe";
    dx: -1 | 0 | 1;
    dy: -1 | 0 | 1;
}

/** A touch we deliberately ignore: a long press, a short drag, garbage input. */
export interface NoneResult {
    kind: "none";
}

export type TouchResult = TapResult | SwipeResult | NoneResult;

/** A tap moves less than this on each axis, in pixels. */
export const TAP_MAX_DISTANCE_PX = 12;

/** A tap lasts less than this, in milliseconds. */
export const TAP_MAX_DURATION_MS = 500;

/** A swipe must move at least this far on its dominant axis, in pixels. */
export const SWIPE_MIN_DISTANCE_PX = 24;

function sign(value: number): -1 | 0 | 1 {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
}

/**
 * Classify one touch from its total movement (dx, dy in pixels) and duration (ms).
 * - Tap: both distances under 12 px and under 500 ms.
 * - Swipe: the larger distance is at least 24 px; the direction is the dominant
 *   axis, and a tie counts as horizontal.
 * - Anything else (long press, short drag, NaN or infinite input) is none.
 */
export function classifyTouch(dx: number, dy: number, ms: number): TouchResult {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(ms)) {
        return { kind: "none" };
    }

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX < TAP_MAX_DISTANCE_PX && absY < TAP_MAX_DISTANCE_PX && ms < TAP_MAX_DURATION_MS) {
        return { kind: "tap" };
    }

    if (Math.max(absX, absY) < SWIPE_MIN_DISTANCE_PX) {
        return { kind: "none" };
    }

    // Dominant axis decides the direction; a tie is horizontal.
    if (absX >= absY) {
        return { kind: "swipe", dx: sign(dx), dy: 0 };
    }
    return { kind: "swipe", dx: 0, dy: sign(dy) };
}
