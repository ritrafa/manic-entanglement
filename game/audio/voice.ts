// One synthesized note the audio engine schedules: a single oscillator with a
// single gain envelope. Pure data — nothing under game/ touches the DOM or an
// AudioContext; lib/audioEngine.ts turns these into WebAudio nodes.

/** The oscillator shapes the engine knows; the four classic WebAudio waves. */
export type Wave = "sine" | "square" | "sawtooth" | "triangle";

/**
 * One voice of a sound effect: an oscillator of the given wave starting at
 * `freq` (Hz), optionally sliding to `freqEnd` over its life, started `at`
 * seconds after the sound is triggered and lasting `dur` seconds, with a peak
 * gain between 0 and 1.
 */
export interface Voice {
    wave: Wave;
    /** Start frequency in Hz; finite and audible (roughly 40 to 4000). */
    freq: number;
    /** End frequency of a glide; the voice holds `freq` when absent. */
    freqEnd?: number;
    /** Seconds from the moment the sound is triggered. */
    at: number;
    /** Seconds the voice sounds. */
    dur: number;
    /** Peak gain of the envelope, above 0 and at most 1. */
    gain: number;
}
