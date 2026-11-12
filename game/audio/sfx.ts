// Every sound effect as pure data: an event plus the context of the moment
// (pickup streak, energy percentage, depth) becomes a list of Voices for the
// audio engine to synthesize. No DOM, no AudioContext, no clocks — the shell
// passes the numbers in and lib/audioEngine.ts plays what comes back.

import type { GameEvent } from "../events";
import type { Voice } from "./voice";

/** The minor pentatonic shape: root, minor third, fourth, fifth, minor seventh. */
const SEMITONE_STEPS = [0, 3, 5, 7, 10];

/** The scale's root: degree 0 is A3 at 220 Hz, degree 5 the octave above. */
const BASE_HZ = 220;

/**
 * Degrees above this are clamped so even the top note of a long pickup run
 * stays comfortably under 4000 Hz (degree 19 sits near 3.1 kHz).
 */
const MAX_DEGREE = 18;

/** What the moment of an event looks like to the sound design. */
export interface SfxContext {
    /** Pickups already taken on this level; the pickup sound climbs with it. */
    streak: number;
    /** Energy as a percentage of storage, 0 to 100. */
    energyPct: number;
    /** The level the run is on, 1 and up. */
    depth: number;
}

/**
 * The frequency of a whole scale degree: 0 is 220 Hz, 5 is 440 Hz, -5 is
 * 110 Hz. The five pentatonic steps repeat an octave up, so the pitch always
 * rises with the degree, negative degrees included.
 */
export function noteHz(degree: number): number {
    const d = Math.round(Number.isFinite(degree) ? degree : 0);
    const octave = Math.floor(d / 5);
    const step = ((d % 5) + 5) % 5;
    const semitones = octave * 12 + SEMITONE_STEPS[step];
    return BASE_HZ * Math.pow(2, semitones / 12);
}

/** The streak as a whole scale degree, pinned into [0, MAX_DEGREE]. */
function streakDegree(streak: number): number {
    if (!Number.isFinite(streak)) return 0;
    return Math.max(0, Math.min(MAX_DEGREE, Math.floor(streak)));
}

/** A quick note of the pickup arpeggio: the degree-th voice, `at` seconds in. */
function pickupNote(degree: number, at: number): Voice {
    return { wave: "triangle", freq: noteHz(degree), at, dur: 0.08, gain: 0.22 };
}

/**
 * The sound effect for one run event, as voices to synthesize. Every voice is
 * finite, audible (40 to 4000 Hz), quiet enough never to clip (gain at most
 * 0.5) and the whole sound ends within 1.5 seconds. Event types this module
 * does not know give an empty list, so a later card's event stays silent
 * until it is designed here.
 */
export function sfxFor(event: GameEvent, ctx: SfxContext): Voice[] {
    switch (event.type) {
        case "move":
            // A tick barely there: nine of these a second must stay bearable.
            return [{ wave: "triangle", freq: 620, at: 0, dur: 0.03, gain: 0.04 }];
        case "blocked":
            // A low thud falling away, like a shoulder on a wall.
            return [{ wave: "sine", freq: 150, freqEnd: 55, at: 0, dur: 0.14, gain: 0.3 }];
        case "pickup": {
            // Two quick rising notes from the streak's degree, so a string of
            // pickups walks up the scale.
            const d = streakDegree(ctx.streak);
            return [pickupNote(d, 0), pickupNote(d + 1, 0.07)];
        }
        case "fight":
            // A harsh falling saw over a low square, gone in about 0.15 s.
            return [
                { wave: "sawtooth", freq: 320, freqEnd: 70, at: 0, dur: 0.15, gain: 0.3 },
                { wave: "square", freq: 85, at: 0, dur: 0.15, gain: 0.22 },
            ];
        case "levelClear": {
            // A four-note rising arpeggio to mark the floor beaten.
            const degrees = [0, 2, 4, 5];
            return degrees.map((degree, i): Voice => ({
                wave: "triangle",
                freq: noteHz(degree),
                at: i * 0.11,
                dur: 0.12,
                gain: 0.22,
            }));
        }
        case "tool":
            if (event.id === "anchor") {
                // A low steady tone with a soft fifth over it: the maze holds still.
                return [
                    { wave: "sine", freq: 196, at: 0, dur: 0.28, gain: 0.22 },
                    { wave: "triangle", freq: 294, at: 0.06, dur: 0.22, gain: 0.14 },
                ];
            }
            // Twist: three quick rising notes, the forecast thrown and rolled again.
            return [noteHz(4), noteHz(6), noteHz(9)].map((freq, i): Voice => ({
                wave: "triangle",
                freq,
                at: i * 0.07,
                dur: 0.07,
                gain: 0.22,
            }));
        case "levelStart":
            // One soft low note under the new maze.
            return [{ wave: "sine", freq: 110, at: 0, dur: 0.3, gain: 0.12 }];
        case "dead": {
            // Three slow falling notes for the end of the run.
            const degrees = [5, 3, 0];
            return degrees.map((degree, i): Voice => ({
                wave: "triangle",
                freq: noteHz(degree),
                at: i * 0.35,
                dur: 0.4,
                gain: 0.25,
            }));
        }
        default:
            // "start" and any later, undesigned event: silence, not a buzz.
            return [];
    }
}

/**
 * The countdown beep for 3, 2 and 1, and the higher, longer one for 0 ("go").
 * Anything outside the countdown gives an empty list.
 */
export function beepVoices(n: number): Voice[] {
    if (n === 0) return [{ wave: "square", freq: 880, at: 0, dur: 0.25, gain: 0.22 }];
    if (n === 1 || n === 2 || n === 3) {
        return [{ wave: "square", freq: 440, at: 0, dur: 0.12, gain: 0.2 }];
    }
    return [];
}

/** The low-energy warning: a soft double pulse, quiet enough to sit under play. */
export function warnVoices(): Voice[] {
    return [
        { wave: "sine", freq: 520, at: 0, dur: 0.06, gain: 0.1 },
        { wave: "sine", freq: 520, at: 0.16, dur: 0.06, gain: 0.1 },
    ];
}
