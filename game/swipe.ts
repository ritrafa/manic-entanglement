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

// --- Swipe-and-hold tracking (owner decision Q15) --------------------------------------
// The same pure geometry, but continuous: the caller feeds raw touch positions and
// times in and gets press/release/tap operations out, so a held finger keeps the
// Stepper running and sliding turns without lifting. No DOM, no clocks here either.

import type { Dir } from "./stepper";

/** One instruction for the shell: hold a direction, let it go, or a tap. */
export type TouchOp =
    | { op: "press" | "release"; dir: Dir }
    | { op: "tap" };

/** The direction a movement from the anchor implies, or null when it is too small. */
function dominantDir(dx: number, dy: number): Dir | null {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // The dominant axis decides; a tie is horizontal, exactly as in classifyTouch.
    if (absX >= absY) {
        if (!(absX >= SWIPE_MIN_DISTANCE_PX)) return null;
        return dx > 0 ? "right" : "left";
    }
    if (!(absY >= SWIPE_MIN_DISTANCE_PX)) return null;
    return dy > 0 ? "down" : "up";
}

/**
 * Follows one finger and turns its path into held-direction operations.
 *
 * - `start` anchors the finger. From then on `move` watches the distance from
 *   the anchor: once it reaches 24 px along the dominant axis, that direction
 *   is pressed and the anchor moves to the current point.
 * - While a direction is held, reaching 24 px along a *different* direction
 *   (the opposite one included) releases the old one and presses the new.
 *   Continuing along the held direction never re-presses it, but the anchor
 *   follows the finger, so a turn after a long slide is measured from where
 *   the finger is now, not from where the slide began.
 * - `end` releases whatever is still held. If nothing was ever pressed and the
 *   whole touch fits `classifyTouch`'s tap rule (short and small), `end` hands
 *   back a single tap instead — the browser's own click still does the tapping.
 * - `cancel` releases and forgets; a later `start` begins fresh.
 *
 * A quick flick therefore gives press then release: exactly one step, as before.
 */
export class TouchTracker {
    /** True between start() and the end()/cancel() that closes the touch. */
    private tracking = false;
    /** Where the current segment is measured from; moves to each press point. */
    private anchorX = 0;
    private anchorY = 0;
    /** Where and when the whole touch began; the tap rule measures against this. */
    private startX = 0;
    private startY = 0;
    private startMs = 0;
    /** The direction currently held down; null between runs. */
    private held: Dir | null = null;
    /** True once any direction was pressed during this touch: no tap after that. */
    private pressed = false;

    /** The finger went down at (x, y) at time t. Any unfinished touch is forgotten. */
    start(x: number, y: number, t: number): void {
        this.tracking = true;
        this.anchorX = this.startX = x;
        this.anchorY = this.startY = y;
        this.startMs = t;
        this.held = null;
        this.pressed = false;
    }

    /** The finger slid to (x, y) at time t; hands back the operations it earned. */
    move(x: number, y: number, t: number): TouchOp[] {
        if (!this.tracking) return [];
        const dir = dominantDir(x - this.anchorX, y - this.anchorY);
        if (dir !== null && dir === this.held) {
            // More of the same: the held direction keeps running and the anchor
            // follows the finger, so the next turn is measured from here.
            this.anchorX = x;
            this.anchorY = y;
            return [];
        }
        // Too small a move from the anchor: nothing changes.
        if (dir === null) return [];
        const ops: TouchOp[] = [];
        if (this.held !== null) ops.push({ op: "release", dir: this.held });
        ops.push({ op: "press", dir });
        this.held = dir;
        this.pressed = true;
        // The new segment starts here, so the next turn is 24 px from this point.
        this.anchorX = x;
        this.anchorY = y;
        return ops;
    }

    /** The finger lifted at (x, y) at time t: release what is held, or report a tap. */
    end(x: number, y: number, t: number): TouchOp[] {
        if (!this.tracking) return [];
        this.tracking = false;
        const ops: TouchOp[] = [];
        if (this.held !== null) {
            ops.push({ op: "release", dir: this.held });
        } else if (!this.pressed && classifyTouch(x - this.startX, y - this.startY, t - this.startMs).kind === "tap") {
            ops.push({ op: "tap" });
        }
        this.held = null;
        return ops;
    }

    /** The touch was taken away (a system gesture, a lost window): release and reset. */
    cancel(): TouchOp[] {
        if (!this.tracking) return [];
        this.tracking = false;
        const ops: TouchOp[] = [];
        if (this.held !== null) ops.push({ op: "release", dir: this.held });
        this.held = null;
        return ops;
    }
}
