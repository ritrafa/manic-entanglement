"use client";

import React, { useEffect, useRef } from "react";
import { TouchTracker, type TouchOp } from "@/game/swipe";
import type { Dir } from "@/game/stepper";

/** Selectors whose touches the layer must leave completely alone. */
const IGNORED_TOUCH_TARGET = 'button, a, [role="dialog"], .wallet-adapter-modal, .wallet-adapter-modal *, .wallet-adapter-dropdown-list, .wallet-adapter-dropdown-list *';

interface TouchLayerProps {
    children: React.ReactNode;
    /** A direction went down (or turned into this one): hold it until onRelease. */
    onPress: (dir: Dir) => void;
    /** The held direction came up: the run in it stops. */
    onRelease: (dir: Dir) => void;
}

/**
 * Wraps the game and turns one finger into held-direction operations.
 *
 * - The pure TouchTracker (game/swipe.ts) owns the geometry: swipe and keep the
 *   finger down to keep moving, slide another way to turn without lifting, and
 *   a quick flick still gives exactly one step (press then release).
 * - Only the first finger of a gesture is tracked; extra fingers are ignored.
 * - The start position and time live inside the tracker: a touch never
 *   re-renders the page.
 * - Listeners sit on the wrapper itself with `{ passive: false }`, so `touchmove`
 *   can `preventDefault()` and the browser never scrolls or pull-to-refreshes
 *   mid-swipe (the board also sets `touch-action: none`).
 * - Taps come back as `{ op: "tap" }` and are left to the browser's normal
 *   click; nothing here ever dispatches a synthetic event.
 * - Touches that start on a button, a link or the wallet dialog pass through
 *   untouched.
 */
const TouchLayer: React.FC<TouchLayerProps> = ({ children, onPress, onRelease }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    // The one finger we follow: its identifier while down, null when not tracked.
    const fingerRef = useRef<number | null>(null);
    // The pure geometry: positions and times go in, operations come out.
    const trackerRef = useRef<TouchTracker | null>(null);
    if (trackerRef.current === null) trackerRef.current = new TouchTracker();
    // Keep the latest callbacks in refs so the listeners bind exactly once.
    const onPressRef = useRef(onPress);
    onPressRef.current = onPress;
    const onReleaseRef = useRef(onRelease);
    onReleaseRef.current = onRelease;

    useEffect(() => {
        const wrapper = wrapperRef.current;
        const tracker = trackerRef.current;
        if (!wrapper || !tracker) return;

        const dispatchOps = (ops: TouchOp[]): void => {
            for (const op of ops) {
                if (op.op === "press") onPressRef.current(op.dir);
                else if (op.op === "release") onReleaseRef.current(op.dir);
                // "tap" does nothing here: the browser's own click handles taps.
            }
        };

        const findFinger = (list: TouchList): Touch | null => {
            for (let i = 0; i < list.length; i += 1) {
                const touch = list[i];
                if (touch.identifier === fingerRef.current) return touch;
            }
            return null;
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (fingerRef.current !== null) return; // A second finger changes nothing.
            const target = event.target;
            if (target instanceof Element && target.closest(IGNORED_TOUCH_TARGET)) {
                // Buttons, links and the wallet dialog keep their own gestures.
                return;
            }
            const touch = event.touches[0];
            if (!touch) return;
            fingerRef.current = touch.identifier;
            tracker.start(touch.clientX, touch.clientY, Date.now());
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (fingerRef.current === null) return;
            // While a touch that began on the board is in progress, the page
            // must not scroll, bounce or pull-to-refresh.
            event.preventDefault();
            const touch = findFinger(event.changedTouches);
            if (touch) dispatchOps(tracker.move(touch.clientX, touch.clientY, Date.now()));
        };

        const handleTouchEnd = (event: TouchEvent) => {
            if (fingerRef.current === null) return;
            const touch = findFinger(event.changedTouches);
            fingerRef.current = null;
            if (touch) dispatchOps(tracker.end(touch.clientX, touch.clientY, Date.now()));
            else dispatchOps(tracker.cancel());
        };

        const handleTouchCancel = () => {
            if (fingerRef.current === null) return;
            fingerRef.current = null;
            dispatchOps(tracker.cancel());
        };

        const passiveFalse = { passive: false } as const;
        wrapper.addEventListener("touchstart", handleTouchStart, passiveFalse);
        wrapper.addEventListener("touchmove", handleTouchMove, passiveFalse);
        wrapper.addEventListener("touchend", handleTouchEnd, passiveFalse);
        wrapper.addEventListener("touchcancel", handleTouchCancel, passiveFalse);

        return () => {
            wrapper.removeEventListener("touchstart", handleTouchStart);
            wrapper.removeEventListener("touchmove", handleTouchMove);
            wrapper.removeEventListener("touchend", handleTouchEnd);
            wrapper.removeEventListener("touchcancel", handleTouchCancel);
        };
    }, []);

    return <div ref={wrapperRef} className="touch-layer">{children}</div>;
};

export default TouchLayer;
