// The generative music, as pure data: the shell owns the clocks and the audio
// engine, this file only answers "what sounds at this step of the pattern".
// No DOM, no timers, no Date, no Math.random — musicStep is a pure function of
// the step number and the state, and the Sequencer only does arithmetic on the
// times the shell hands it, so the notes are always scheduled ahead of time on
// the audio clock and a throttled hidden tab can never drop or bunch them.
//
// The shape: eight bars of sixteen sixteenths in A minor, one chord to a bar
// (Am F C G Am F Dm E). Drums carry it — kick, snare and hats from the noise
// voice — a sawtooth bass drives eighths under the chords, a quiet triangle
// pad holds each chord, and a composed square-wave tune (the note table
// below) states a rising phrase over the first four bars and answers it with
// a falling one over the last four. Depth layers it all in: depth 1 is kick,
// hats and bass, 2 adds the snare, 3 the pad, 4 the tune, 7 doubles the tune
// an octave up and brings the snare fill every four bars. When the stored
// energy runs low the tune and pad leave and a tense high pulse answers on
// every fourth step; the drums and bass never do.

import type { Voice } from "./voice";

/** Steps in the whole pattern: eight bars of sixteen sixteenths. */
export const PATTERN_STEPS = 128;

/** Sixteenth-note steps in one bar, and bars in the pattern. */
const STEPS_PER_BAR = 16;
const BARS = 8;

/** The tempo at depth 1, the added beats per minute per depth, and the cap. */
const BASE_BPM = 96;
const BPM_PER_DEPTH = 4;
const MAX_BPM = 150;

/** Below this share of stored energy the tune and pad drop out and the pulse comes in. */
const LOW_ENERGY = 0.25;

/** How far ahead of "now" advance() schedules, in seconds. */
const DEFAULT_LOOKAHEAD = 0.2;

/** One call never hands out more than this many steps, whatever the clock did. */
const MAX_STEPS_PER_CALL = 64;

/** The mix stays quiet on purpose: even the fullest single step sums well under 0.6. */
const KICK_GAIN = 0.22;
const SNARE_GAIN = 0.14;
const SNARE_BODY_GAIN = 0.09;
const HAT_GAIN = 0.03;
const OPEN_HAT_GAIN = 0.04;
const BASS_GAIN = 0.11;
const PAD_GAIN = 0.018;
const TUNE_GAIN = 0.075;
const TUNE_OCTAVE_GAIN = 0.035;
const PULSE_GAIN = 0.05;

/** The depths the layers join at, lowest first. */
const SNARE_DEPTH = 2;
const PAD_DEPTH = 3;
const TUNE_DEPTH = 4;
const DOUBLING_DEPTH = 7;

/** The drums, in hertz and seconds: a falling sine kick, a bandpassed snare, hissing hats. */
const KICK_FREQ = 150;
const KICK_GLIDE = 45;
const KICK_DUR = 0.12;
const SNARE_NOISE_FREQ = 1800;
const SNARE_BODY_FREQ = 190;
const SNARE_DUR = 0.12;
const HAT_HZ = 8000;
const HAT_FILTER_HZ = 7200;
const CLOSED_HAT_DUR = 0.03;
const OPEN_HAT_DUR = 0.12;

/** The bass saw is kept dark behind a lowpass. */
const BASS_FILTER_HZ = 600;

/** The tense high pulse that stands in for the tune while energy runs low. */
const PULSE_FREQ = 1174.66; // D6

/** The fill: sixteenth snares over the last beat of a bar, its four steps. */
const FILL_STEPS = [12, 13, 14, 15];

/** A4, the tuning fork the note table counts semitones from. */
const A4_HZ = 440;
const A4_MIDI = 69;

/** The frequency of a MIDI note number: 69 is A4 at 440 Hz, 57 is A3. */
function midiHz(midi: number): number {
    return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** One bar's chord: the bass root as a MIDI number, and the pad's three tones. */
interface Chord {
    /** The bass root, in the second octave (MIDI 40 to 50). */
    bass: number;
    /** The chord's three tones, voiced for the pad around middle C. */
    tones: readonly [number, number, number];
}

/** The eight bars' chords: Am, F, C, G, Am, F, Dm, E — a minor, one to a bar. */
const CHORDS: readonly Chord[] = [
    { bass: 45, tones: [57, 60, 64] }, // Am: A C E
    { bass: 41, tones: [53, 57, 60] }, // F:  F A C
    { bass: 48, tones: [60, 64, 67] }, // C:  C E G
    { bass: 43, tones: [55, 59, 62] }, // G:  G B D
    { bass: 45, tones: [57, 60, 64] }, // Am
    { bass: 41, tones: [53, 57, 60] }, // F
    { bass: 50, tones: [62, 65, 69] }, // Dm: D F A
    { bass: 40, tones: [64, 68, 71] }, // E:  E G# B
];

/**
 * The composed tune: one entry per sixteenth of the eight bars, MIDI numbers
 * and null rests. Strong beats (0, 4, 8 and 12 of each bar) carry chord
 * tones; bars 1 to 4 rise from A4 up to G5 and bars 5 to 8 fall back down,
 * landing on the A that starts the loop again.
 */
const TUNE: readonly (readonly (number | null)[])[] = [
    // Am: a rising statement, A C E ...
    [69, null, null, null, 72, null, null, null, 76, null, null, null, 64, null, null, null],
    // F:  an answer, leaning down C A F
    [72, null, null, null, 69, null, null, null, 65, null, null, null, null, null, null, null],
    // C:  the climb goes on, G C E G
    [67, null, null, null, 72, null, null, null, 76, null, null, 76, 79, null, null, null],
    // G:  the top, D B G, and a step back down
    [74, null, null, null, 71, null, null, null, 67, null, null, null, null, null, 67, null],
    // Am: the fall begins, E C A
    [76, null, null, null, 72, null, null, null, 69, null, null, null, null, null, null, null],
    // F:  down again, C A F F
    [72, null, null, null, 69, null, null, null, 65, null, null, null, 65, null, null, null],
    // Dm: near the ground, A F D ... D
    [69, null, null, null, 65, null, null, null, 62, null, null, null, null, null, 62, null],
    // E:  home through the dominant, B G# E, and the A that turns the loop
    [71, null, null, null, 68, null, null, null, 64, null, null, null, null, 69, null, null],
];

/** What the music follows: how deep the run is and how little energy is left. */
export interface MusicState {
    /** The depth the run is at, 1 and up; drives the tempo and the layers. */
    depth: number;
    /** Energy as a share of storage, 0 to 1; under 0.25 the tune and pad leave. */
    energyPct: number;
}

/** One step the Sequencer hands out: its number, absolute start and voices. */
export interface ScheduledStep {
    /** The step's number since start(): 0, 1, 2, ... */
    step: number;
    /** The step's start time on the audio clock, in absolute seconds. */
    time: number;
    /** The voices to play, timed relative to `time`. */
    voices: Voice[];
}

/** Beats per minute at a depth: 96 at depth 1, +4 per depth, never past 150. */
export function tempoFor(depth: number): number {
    const d = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
    return Math.min(MAX_BPM, BASE_BPM + BPM_PER_DEPTH * (d - 1));
}

/** Seconds from one sixteenth-note step to the next at a depth. */
function stepSeconds(depth: number): number {
    return 60 / tempoFor(depth) / 4;
}

/** A state seen by the pattern: a finite depth of at least 1, energy in [0, 1]. */
function saneState(state: MusicState): MusicState {
    const given = state ?? { depth: 1, energyPct: 1 };
    const depth = Number.isFinite(given.depth) ? Math.max(1, Math.floor(given.depth)) : 1;
    const raw = Number.isFinite(given.energyPct) ? given.energyPct : 1;
    return { depth, energyPct: Math.min(1, Math.max(0, raw)) };
}

/** The kick: a sine dropping from 150 Hz to a thump, gone in 0.12 s. */
function kick(): Voice {
    return { wave: "sine", freq: KICK_FREQ, freqEnd: KICK_GLIDE, at: 0, dur: KICK_DUR, gain: KICK_GAIN, decay: true };
}

/** The snare: bandpassed noise with a short triangle body under it. */
function snare(): Voice[] {
    return [
        {
            wave: "noise",
            freq: SNARE_NOISE_FREQ,
            at: 0,
            dur: SNARE_DUR,
            gain: SNARE_GAIN,
            decay: true,
            filter: { type: "bandpass", freq: SNARE_NOISE_FREQ },
        },
        { wave: "triangle", freq: SNARE_BODY_FREQ, at: 0, dur: SNARE_DUR, gain: SNARE_BODY_GAIN, decay: true },
    ];
}

/** A hat: highpassed noise, closed and dry or open and ringing. */
function hat(open: boolean): Voice {
    return {
        wave: "noise",
        freq: HAT_HZ,
        at: 0,
        dur: open ? OPEN_HAT_DUR : CLOSED_HAT_DUR,
        gain: open ? OPEN_HAT_GAIN : HAT_GAIN,
        decay: true,
        filter: { type: "highpass", freq: HAT_FILTER_HZ },
    };
}

/** The bass: a dark saw eighth on the chord's root, an octave up on the off eighths. */
function bass(root: number, up: boolean, stepDur: number): Voice {
    return {
        wave: "sawtooth",
        freq: midiHz(root + (up ? 12 : 0)),
        at: 0,
        dur: stepDur * 1.8,
        gain: BASS_GAIN,
        decay: true,
        filter: { type: "lowpass", freq: BASS_FILTER_HZ },
    };
}

/** The tune: a decayed square on the table's note, doubled an octave up when asked. */
function tune(midi: number, stepDur: number, doubled: boolean): Voice[] {
    const voices: Voice[] = [
        { wave: "square", freq: midiHz(midi), at: 0, dur: stepDur * 1.9, gain: TUNE_GAIN, decay: true },
    ];
    if (doubled) {
        voices.push({
            wave: "square",
            freq: midiHz(midi) * 2,
            at: 0,
            dur: stepDur * 1.9,
            gain: TUNE_OCTAVE_GAIN,
            decay: true,
        });
    }
    return voices;
}

/**
 * The voices sounding at one step of the pattern: `step` counts sixteenths
 * from the top of the 128-step loop (it wraps), and the state decides which
 * layers are in. Drums keep the groove at every depth, the bass drives
 * eighths under the bar's chord, the pad holds the chord from depth 3, and
 * the composed tune states itself from depth 4 (doubled from depth 7, with
 * the snare fill every four bars); at low energy the tune and pad leave and
 * a short high pulse marks every fourth step.
 */
export function musicStep(step: number, state: MusicState): Voice[] {
    const s = Number.isFinite(step)
        ? ((Math.floor(step) % PATTERN_STEPS) + PATTERN_STEPS) % PATTERN_STEPS
        : 0;
    const { depth, energyPct } = saneState(state);
    const low = energyPct < LOW_ENERGY;
    const stepDur = stepSeconds(depth);
    const bar = Math.floor(s / STEPS_PER_BAR);
    const inBar = s % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    const voices: Voice[] = [];

    // The drums: the backbone, in from depth 1 except the snare.
    const onFillBeat =
        depth >= SNARE_DEPTH
        && FILL_STEPS.includes(inBar)
        && (bar === BARS - 1 || (depth >= DOUBLING_DEPTH && bar === BARS / 2 - 1));
    if (inBar === 0 || inBar === 8 || (inBar === 10 && bar % 2 === 0)) {
        voices.push(kick());
    }
    if (depth >= SNARE_DEPTH && !onFillBeat && (inBar === 4 || inBar === 12)) {
        voices.push(...snare());
    }
    if (onFillBeat) {
        voices.push(...snare());
    }
    if (inBar % 2 === 0) {
        voices.push(hat(inBar === 14 && bar % 2 === 1));
    }

    // The bass: driving eighths, every second one jumping an octave up.
    if (inBar % 2 === 0) {
        voices.push(bass(chord.bass, (inBar / 2) % 2 === 1, stepDur));
    }

    // The pad: the chord's three tones, held for the bar, from depth 3.
    if (!low && depth >= PAD_DEPTH && inBar === 0) {
        for (const tone of chord.tones) {
            voices.push({
                wave: "triangle",
                freq: midiHz(tone),
                at: 0,
                dur: stepDur * STEPS_PER_BAR,
                gain: PAD_GAIN,
            });
        }
    }

    // The tune: the composed eight-bar line, from depth 4, gone at low energy.
    if (!low && depth >= TUNE_DEPTH) {
        const note = TUNE[bar][inBar];
        if (note !== null) {
            voices.push(...tune(note, stepDur, depth >= DOUBLING_DEPTH));
        }
    }

    // The tense pulse: high, dry, every fourth step, while energy is low.
    if (low && inBar % 4 === 0) {
        voices.push({
            wave: "sine",
            freq: PULSE_FREQ,
            at: 0,
            dur: stepDur * 0.4,
            gain: PULSE_GAIN,
            decay: true,
        });
    }

    return voices;
}

/**
 * The music clock the shell drives: start() rolls from step 0 at a given
 * audio-clock time, advance(now) hands out every step starting before
 * now + lookahead that has not been handed out yet, and stop() falls silent
 * until the next start(). The step length is 60 / tempo / 4 seconds at the
 * tempo of the moment the step is scheduled, so a depth change only bends the
 * spacing of later steps. A sequencer left far behind (a throttled tab, a
 * long pause) drops the missed steps instead of flooding: it catches up to
 * the present and schedules from there.
 */
export class Sequencer {
    private running = false;
    /** The number of the next step since start(): 0, 1, 2, ... */
    private nextStep = 0;
    /** The next step's absolute start time, on the audio clock's own seconds. */
    private nextTime = 0;
    private state: MusicState = { depth: 1, energyPct: 1 };

    /** Roll from step 0 starting at `now`; a start after stop() begins at 0 again. */
    start(now: number): void {
        this.running = true;
        this.nextStep = 0;
        this.nextTime = Number.isFinite(now) ? now : 0;
    }

    /** Silence: advance() hands out nothing until the next start(). */
    stop(): void {
        this.running = false;
    }

    /** Follow the run: the depth bends the tempo, low energy thins the pattern. */
    setState(state: MusicState): void {
        this.state = saneState(state);
    }

    /**
     * Every step whose start falls before now + lookahead and has not been
     * returned yet, with absolute start times. Never a flood: at most
     * MAX_STEPS_PER_CALL per call, and steps whose moment already passed are
     * skipped, not played late.
     */
    advance(now: number, lookahead = DEFAULT_LOOKAHEAD): ScheduledStep[] {
        if (!this.running || !Number.isFinite(now)) return [];
        const ahead = Number.isFinite(lookahead) ? Math.max(0, lookahead) : DEFAULT_LOOKAHEAD;

        // Catch up: a sequencer left behind drops the missed steps in silence.
        if (this.nextTime < now) {
            const dur = stepSeconds(this.state.depth);
            const skipped = Math.max(0, Math.ceil((now - this.nextTime) / dur));
            this.nextTime += skipped * dur;
            this.nextStep += skipped;
            // Rounding may leave a hair of a step still in the past; take it too.
            while (this.nextTime < now) {
                this.nextTime += dur;
                this.nextStep += 1;
            }
        }

        const out: ScheduledStep[] = [];
        const horizon = now + ahead;
        while (this.running && this.nextTime < horizon && out.length < MAX_STEPS_PER_CALL) {
            out.push({ step: this.nextStep, time: this.nextTime, voices: musicStep(this.nextStep, this.state) });
            this.nextTime += stepSeconds(this.state.depth);
            this.nextStep += 1;
        }
        return out;
    }
}
