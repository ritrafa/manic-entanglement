"use client";

import React from "react";
import type { Dir } from "@/game/stepper";

interface DPadProps {
    /** A button went down: hold that direction until it comes up again. */
    onPress: (dir: Dir) => void;
    /** The button came up (or the finger slid off it): the run stops. */
    onRelease: (dir: Dir) => void;
}

/** The four buttons of the cross, in reading order with their screen-reader names. */
const PAD_BUTTONS: readonly { dir: Dir; label: string; className: string }[] = [
    { dir: "up", label: "Move up", className: "dpad-up" },
    { dir: "left", label: "Move left", className: "dpad-left" },
    { dir: "right", label: "Move right", className: "dpad-right" },
    { dir: "down", label: "Move down", className: "dpad-down" },
];

/**
 * The optional on-screen D-pad (settings.touch === "dpad"): four 56 px buttons
 * in a cross below the board. `pointerdown` presses a direction and `pointerup`,
 * `pointerleave` and `pointercancel` release it, so sliding off a button stops
 * the run just like lifting. Every button carries its direction as a label for
 * screen readers, and the long-press context menu stays out of the way.
 */
const DPad: React.FC<DPadProps> = ({ onPress, onRelease }) => {
    return (
        <div className="dpad" role="group" aria-label="Direction pad">
            {PAD_BUTTONS.map(({ dir, label, className }) => (
                <button
                    key={dir}
                    type="button"
                    className={`dpad-btn ${className}`}
                    aria-label={label}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        onPress(dir);
                    }}
                    onPointerUp={() => onRelease(dir)}
                    onPointerLeave={() => onRelease(dir)}
                    onPointerCancel={() => onRelease(dir)}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    {dir === "up" ? "\u25B2" : dir === "down" ? "\u25BC" : dir === "left" ? "\u25C0" : "\u25B6"}
                </button>
            ))}
        </div>
    );
};

export default DPad;
