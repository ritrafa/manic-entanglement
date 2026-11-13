// One synthesized note the audio engine schedules: a single oscillator (or a
// slice of shared white noise) with a single gain envelope. Pure data —
// nothing under game/ touches the DOM or an AudioContext; lib/audioEngine.ts
// turns these into WebAudio nodes.

/** The shapes the engine knows: the four classic WebAudio waves, plus white
 * noise from a shared buffer (for drums), where `freq` is ignored. */
export type Wave = "sine" | "square" | "sawtooth" | "triangle" | "noise";

/** The one-pole shape a noise or oscillator voice is put through. */
export interface VoiceFilter {
    type: "highpass" | "bandpass" | "lowpass";
    /** Corner frequency in Hz; finite and above zero, or it is skipped. */
    freq: number;
}

/**
 * One voice of a sound: a voice of the given wave starting at `freq` (Hz),
 * optionally sliding to `freqEnd` over its life, started `at` seconds after
 * the sound is triggered and lasting `dur` seconds, with a peak gain between
 * 0 and 1. A `noise` voice ignores `freq` and may ask for a band `filter`
 * and a `decay`ing envelope (drums and plucks) instead of a flat hold.
 */
export interface Voice {
    wave: Wave;
    /** Start frequency in Hz; finite and audible (roughly 40 to 4000). Ignored for noise. */
    freq: number;
    /** End frequency of a glide; the voice holds `freq` when absent. */
    freqEnd?: number;
    /** Seconds from the moment the sound is triggered. */
    at: number;
    /** Seconds the voice sounds. */
    dur: number;
    /** Peak gain of the envelope, above 0 and at most 1. */
    gain: number;
    /** Shape the voice through one biquad filter; skipped without a usable freq. */
    filter?: VoiceFilter;
    /** Fall exponentially from the peak to near zero over `dur` (plucks, drums)
     * instead of holding flat until the release. */
    decay?: boolean;
}
