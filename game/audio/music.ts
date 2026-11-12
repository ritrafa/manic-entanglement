// The generative music, as pure data: the shell owns the clocks and the audio
// engine, this file only answers "what sounds at this step of the pattern".
// No DOM, no timers, no Date, no Math.random — musicStep is a pure function of
// the step number and the state, and the Sequencer only does arithmetic on the
// times the shell hands it, so the notes are always scheduled ahead of time on
// the audio clock and a throttled hidden tab can never drop or bunch them.

import { noteHz } from "./sfx";
import type { Voice } from "./voice";

/** Steps in the whole pattern: two bars of four beats, counted in sixteenths. */
export const PATTERN_STEPS = 32;

/** The tempo at depth 1, the added beats per minute per depth, and the cap. */
const BASE_BPM = 96;
const BPM_PER_DEPTH = 4;
const MAX_BPM = 150;

/** Below this share of stored energy the bass drops out and the pulse comes in. */
const LOW_ENERGY = 0.25;

/** How far ahead of "now" advance() schedules, in seconds. */
const DEFAULT_LOOKAHEAD = 0.2;

/** One call never hands out more than this many steps, whatever the clock did. */
const MAX_STEPS_PER_CALL = 64;

/** The mix stays quiet on purpose: even the fullest step sums well under 0.6. */
const BASS_GAIN = 0.16;
const ARP_GAIN = 0.1;
const HARMONY_GAIN = 0.07;
const SPARKLE_GAIN = 0.05;
const PULSE_GAIN = 0.05;

/** The bass degrees, low under the scale's root; one per bar of eight steps. */
const BASS_DEGREES = [-10, -8, -10, -7];
/** The bass rhythm: which steps of a bar of eight it lands on. */
const BASS_HITS = [0, 3, 6];

/** The arpeggio degrees of the pattern's first half, and of its second. */
const ARP_FIRST = [0, 2, 4, 2];
const ARP_SECOND = [7, 5, 4, 7];

/** A perfect fourth and an octave, counted in degrees of the pentatonic shape. */
const FOURTH_DEGREES = 2;
const OCTAVE_DEGREES = 5;

/** The depths the extra layers join at: a fourth above, then the sparkle. */
const HARMONY_DEPTH = 4;
const SPARKLE_DEPTH = 7;

/** The tense high pulse that replaces the bass when energy runs low: degree 10. */
const PULSE_DEGREE = 10;

/** What the music follows: how deep the run is and how little energy is left. */
export interface MusicState {
    /** The depth the run is at, 1 and up; drives the tempo and the layers. */
    depth: number;
    /** Energy as a share of storage, 0 to 1; under 0.25 the bass drops out. */
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

/** The arpeggio table for a step: the pattern changes between its two halves. */
function arpTable(s: number): number[] {
    return s < PATTERN_STEPS / 2 ? ARP_FIRST : ARP_SECOND;
}

/** The arpeggio degree for a step, from the table of its half of the pattern. */
function arpDegree(s: number): number {
    const table = arpTable(s);
    return table[Math.floor(s / 2) % table.length];
}

/** True when the arpeggio sounds on this step: every other one up front, three of four in the second half. */
function playsArp(s: number): boolean {
    return s < PATTERN_STEPS / 2 ? s % 2 === 0 : s % 4 !== 3;
}

/**
 * The voices for one sixteenth-note step of the 32-step pattern, timed
 * relative to the step's own start. Deterministic — the same step and state
 * always give the same voices — and quiet: the gains of one step sum well
 * under 0.6. A low triangle bass keeps a fixed rhythm, an arpeggio over the
 * pentatonic scale changes its figure between the pattern's two halves, from
 * depth 4 a second arpeggio joins a fourth above, from depth 7 an octave
 * sparkle takes the off-beats, and when energy drops under a quarter the bass
 * leaves and a short high pulse answers on every second step.
 */
export function musicStep(step: number, state: MusicState): Voice[] {
    const s = Number.isFinite(step)
        ? ((Math.floor(step) % PATTERN_STEPS) + PATTERN_STEPS) % PATTERN_STEPS
        : 0;
    const { depth, energyPct } = saneState(state);
    const low = energyPct < LOW_ENERGY;
    const stepDur = stepSeconds(depth);
    const voices: Voice[] = [];

    // The bass: low, steady, and the first thing to go when energy runs dry.
    if (!low && BASS_HITS.includes(s % 8)) {
        const degree = BASS_DEGREES[Math.floor(s / 8) % BASS_DEGREES.length];
        voices.push({ wave: "triangle", freq: noteHz(degree), at: 0, dur: stepDur * 1.8, gain: BASS_GAIN });
    }

    // The arpeggio, with its deeper partner from depth 4.
    if (playsArp(s)) {
        const degree = arpDegree(s);
        voices.push({ wave: "square", freq: noteHz(degree), at: 0, dur: stepDur * 0.9, gain: ARP_GAIN });
        if (depth >= HARMONY_DEPTH) {
            voices.push({
                wave: "triangle",
                freq: noteHz(degree + FOURTH_DEGREES),
                at: stepDur * 0.25,
                dur: stepDur * 0.7,
                gain: HARMONY_GAIN,
            });
        }
    }

    // The octave sparkle, on the off-beats, from depth 7.
    if (depth >= SPARKLE_DEPTH && s % 2 === 1) {
        voices.push({
            wave: "triangle",
            freq: noteHz(arpDegree(s) + OCTAVE_DEGREES),
            at: 0,
            dur: stepDur * 0.4,
            gain: SPARKLE_GAIN,
        });
    }

    // The tense pulse: high, dry, every second step, while energy is low.
    if (low && s % 2 === 0) {
        voices.push({ wave: "square", freq: noteHz(PULSE_DEGREE), at: 0, dur: stepDur * 0.25, gain: PULSE_GAIN });
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
