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
const PAD_BUTTONS: readonly { dir: Dir; label: string; place: string; arrow: string }[] = [
    { dir: "up", label: "Move up", place: "is-u", arrow: "is-up" },
    { dir: "left", label: "Move left", place: "is-l", arrow: "is-left" },
    { dir: "right", label: "Move right", place: "is-r", arrow: "" },
    { dir: "down", label: "Move down", place: "is-d", arrow: "is-down" },
];

/**
 * The optional on-screen D-pad (design/components/DPad, settings.touch ===
 * "dpad"): four 64 px me-btn keys in a cross below the board, each carrying
 * the CSS pixel arrow and its own grid place. `pointerdown` presses a
 * direction and `pointerup`, `pointerleave` and `pointercancel` release it, so
 * sliding off a button stops the run just like lifting. Every button carries
 * its direction as a label for screen readers, and the long-press context
 * menu stays out of the way.
 */
const DPad: React.FC<DPadProps> = ({ onPress, onRelease }) => {
    return (
        <div className="me-dpad" role="group" aria-label="Direction pad">
            {PAD_BUTTONS.map(({ dir, label, place, arrow }) => (
                <button
                    key={dir}
                    type="button"
                    className={`me-btn ${place}`}
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
                    <i className={`me-arrow ${arrow}`} aria-hidden="true" />
                </button>
            ))}
        </div>
    );
};

export default DPad;
