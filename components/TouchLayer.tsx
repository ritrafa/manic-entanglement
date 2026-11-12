"use client";

import React, { useEffect, useRef } from "react";
import { classifyTouch } from "@/game/swipe";

/** Selectors whose touches the layer must leave completely alone. */
const IGNORED_TOUCH_TARGET = 'button, a, [role="dialog"], .wallet-adapter-modal, .wallet-adapter-modal *, .wallet-adapter-dropdown-list, .wallet-adapter-dropdown-list *';

interface TouchLayerProps {
    children: React.ReactNode;
    /** Called once per recognised swipe, with the direction from the classifier. */
    onSwipe: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
}

/**
 * Wraps the game and turns deliberate drags into `onSwipe` calls.
 *
 * - The start position and time live in refs: a touch never re-renders the page.
 * - Listeners sit on the wrapper itself with `{ passive: false }`, so `touchmove`
 *   can `preventDefault()` and the browser never scrolls or pull-to-refreshes
 *   mid-swipe (the board also sets `touch-action: none`).
 * - Taps are left entirely to the browser's normal click; nothing here ever
 *   dispatches a synthetic event, so a tap's click handler runs exactly once.
 * - Touches that start on a button, a link or the wallet dialog pass through
 *   untouched.
 */
const TouchLayer: React.FC<TouchLayerProps> = ({ children, onSwipe }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    // Where and when the current touch began; null means "no touch being tracked".
    const startRef = useRef<{ x: number; y: number; ms: number } | null>(null);
    // Keep the latest callback in a ref so the listeners bind exactly once.
    const onSwipeRef = useRef(onSwipe);
    onSwipeRef.current = onSwipe;

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const handleTouchStart = (event: TouchEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(IGNORED_TOUCH_TARGET)) {
                // Buttons, links and the wallet dialog keep their own gestures.
                startRef.current = null;
                return;
            }
            const touch = event.touches[0];
            if (!touch) return;
            startRef.current = { x: touch.clientX, y: touch.clientY, ms: Date.now() };
        };

        const handleTouchMove = (event: TouchEvent) => {
            // While a touch that began on the board is in progress, the page
            // must not scroll, bounce or pull-to-refresh.
            if (startRef.current !== null) {
                event.preventDefault();
            }
        };

        const handleTouchEnd = (event: TouchEvent) => {
            const start = startRef.current;
            startRef.current = null;
            if (!start) return;

            const touch = event.changedTouches[0];
            if (!touch) return;

            const result = classifyTouch(
                touch.clientX - start.x,
                touch.clientY - start.y,
                Date.now() - start.ms,
            );
            if (result.kind === "swipe") {
                onSwipeRef.current(result.dx, result.dy);
            }
            // "tap" and "none" do nothing: the browser's own click handles taps.
        };

        const handleTouchCancel = () => {
            startRef.current = null;
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
