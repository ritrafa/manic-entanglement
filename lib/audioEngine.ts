// The one place that turns Voices into sound: an injected factory hands over an
// AudioContext-like object, and every voice becomes exactly one source (an
// oscillator, or an AudioBufferSourceNode reading the shared white-noise
// buffer for a `noise` voice) plus one gain node on a named bus, optionally
// shaped by one biquad filter. Plain voices get a short attack and release so
// nothing clicks; a `decay` voice instead falls exponentially from its peak
// to near zero, which is how plucks and drums sound. This file never names a
// browser global itself — no AudioContext constructor, no window — so its
// tests run in plain node with a fake, and a browser without WebAudio (or a
// context refused before the first gesture) simply never hears anything:
// every method is a silent no-op then.

import type { Voice } from "@/game/audio/voice";

/** The two sound buses: effects and the generated music. */
export type Bus = "sfx" | "music";

/** The part of an AudioParam this engine uses. */
export interface AudioParamLike {
    value: number;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
    exponentialRampToValueAtTime(value: number, time: number): void;
}

/** The part of an OscillatorNode this engine uses. */
export interface OscillatorLike {
    type: string;
    frequency: AudioParamLike;
    connect(destination: unknown): void;
    start(when: number): void;
    stop(when: number): void;
}

/** The part of an AudioBufferSourceNode this engine uses. */
export interface AudioBufferSourceLike {
    buffer: AudioBufferLike | null;
    connect(destination: unknown): void;
    start(when: number): void;
    stop(when: number): void;
}

/** The part of an AudioBuffer this engine uses, to fill the noise once. */
export interface AudioBufferLike {
    getChannelData(channel: number): Float32Array;
}

/** The part of a BiquadFilterNode this engine uses. */
export interface BiquadFilterLike {
    type: string;
    frequency: AudioParamLike;
    connect(destination: unknown): void;
}

/** The part of a GainNode this engine uses. */
export interface GainNodeLike {
    gain: AudioParamLike;
    connect(destination: unknown): void;
}

/** The part of an AudioContext this engine uses; a real one satisfies it. */
export interface AudioContextLike {
    readonly currentTime: number;
    readonly sampleRate: number;
    readonly destination: unknown;
    resume(): Promise<void> | void;
    createOscillator(): OscillatorLike;
    createGain(): GainNodeLike;
    createBufferSource(): AudioBufferSourceLike;
    createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
    createBiquadFilter(): BiquadFilterLike;
}

/** Builds the context on unlock; the shell passes its own AudioContext maker. */
export type ContextFactory = () => AudioContextLike;

/** Seconds of fade in and out on every voice, so starts and stops never click. */
const ENVELOPE_EDGE = 0.008;

/** Seconds the source keeps sounding past the envelope, so the release lands. */
const STOP_TAIL = 0.005;

/** "Near zero" for an exponential fall, which may never reach true zero. */
const NEAR_ZERO = 0.0001;

/** The sample rate assumed for a context that reports a broken one. */
const FALLBACK_SAMPLE_RATE = 44100;

/** The filter kinds the engine accepts; anything else is skipped. */
const FILTER_TYPES = ["highpass", "bandpass", "lowpass"] as const;

/** Pin a volume into [0, 1]; a broken number lands on 0. */
function clampVolume(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

/**
 * The game's synthesizer. Constructing it creates nothing: the factory is only
 * called on unlock(), and from then on play() schedules one source and one
 * gain node per voice through the bus the caller names. Before unlock(), and
 * forever after a factory that throws, every method does nothing at all.
 */
export class AudioEngine {
    private readonly factory: ContextFactory;
    /** The context once unlocked; null until then (and after a failed factory). */
    private ctx: AudioContextLike | null = null;
    /** True once the factory threw: there is no WebAudio here, stay silent. */
    private broken = false;
    private isMuted = false;
    /** The wanted volume per bus, remembered so a late unlock still applies it. */
    private readonly volumes: Record<Bus, number> = { sfx: 0.7, music: 1 };
    /** The bus gain nodes, made once with the context. */
    private readonly buses: Partial<Record<Bus, GainNodeLike>> = {};
    /** One second of white noise, made once per context and shared by every noise voice. */
    private noiseBuffer: AudioBufferLike | null = null;

    constructor(factory: ContextFactory) {
        this.factory = factory;
    }

    /** The player's first gesture: make (or resume) the context and build the buses. */
    unlock(): void {
        if (this.broken) return;
        if (this.ctx === null) {
            let ctx: AudioContextLike;
            try {
                ctx = this.factory();
            } catch {
                this.broken = true;
                return;
            }
            this.ctx = ctx;
            try {
                for (const bus of ["sfx", "music"] as const) {
                    const node = ctx.createGain();
                    node.gain.value = this.isMuted ? 0 : this.volumes[bus];
                    node.connect(ctx.destination);
                    this.buses[bus] = node;
                }
            } catch {
                // A context that refuses its nodes is as good as no WebAudio.
                this.broken = true;
                this.ctx = null;
                this.noiseBuffer = null;
                this.buses.sfx = undefined;
                this.buses.music = undefined;
                return;
            }
        }
        this.resume();
    }

    /**
     * The audio clock, in the context's own seconds; 0 before unlock() or
     * without WebAudio, so a caller can hand it to the Sequencer either way.
     */
    now(): number {
        if (this.ctx === null) return 0;
        try {
            return this.ctx.currentTime;
        } catch {
            return 0;
        }
    }

    /**
     * Schedule one sound: one source and one gain node per voice, on the
     * named bus. Silent before unlock(), while muted, and without WebAudio.
     * A voice that the context refuses is skipped, never raised. With an
     * absolute `time` (audio-clock seconds) the voices start there, which is
     * how the music stays ahead of the browser's throttled timers; without
     * one, they start now.
     */
    play(voices: Voice[], bus: Bus = "sfx", time?: number): void {
        const ctx = this.ctx;
        const busNode = this.buses[bus];
        if (ctx === null || this.isMuted || busNode === undefined || voices.length === 0) return;
        let when: number;
        if (typeof time === "number" && Number.isFinite(time)) {
            when = Math.max(0, time);
        } else {
            try {
                when = ctx.currentTime;
            } catch {
                return;
            }
        }
        for (const voice of voices) {
            // A noise voice never reads its frequency, so it is not judged on it.
            if (voice.wave !== "noise" && (!Number.isFinite(voice.freq) || voice.freq <= 0)) continue;
            if (!Number.isFinite(voice.at) || voice.at < 0) continue;
            if (!Number.isFinite(voice.dur) || voice.dur <= 0) continue;
            if (!Number.isFinite(voice.gain) || voice.gain <= 0) continue;
            try {
                this.voice(ctx, busNode, voice, when + voice.at);
            } catch {
                // One voice the browser refuses must not break the sound or the game.
            }
        }
    }

    /** The wanted volume of a bus (0 to 1); applied at once when the bus exists. */
    setVolume(bus: Bus, volume: number): void {
        this.volumes[bus] = clampVolume(volume);
        const node = this.buses[bus];
        if (node !== undefined && !this.isMuted) {
            try {
                node.gain.value = this.volumes[bus];
            } catch {
                // A refused write leaves the remembered volume in place.
            }
        }
    }

    /** M: every bus goes quiet at once; unmuting restores the wanted volumes. */
    setMuted(muted: boolean): void {
        this.isMuted = muted;
        for (const bus of ["sfx", "music"] as const) {
            const node = this.buses[bus];
            if (node === undefined) continue;
            try {
                node.gain.value = muted ? 0 : this.volumes[bus];
            } catch {
                // A refused write is silence the browser already wanted.
            }
        }
    }

    /** Whether M currently silences every bus. */
    get muted(): boolean {
        return this.isMuted;
    }

    /** One source and one gain node: an oscillator, or the noise buffer. */
    private voice(ctx: AudioContextLike, bus: GainNodeLike, voice: Voice, start: number): void {
        const end = start + voice.dur;
        const envelope = this.envelope(ctx, bus, voice, start);
        if (voice.wave === "noise") {
            const source = ctx.createBufferSource();
            source.buffer = this.noise(ctx);
            this.shape(ctx, source, voice, start, envelope);
            source.start(start);
            source.stop(end + STOP_TAIL);
            return;
        }

        const oscillator = ctx.createOscillator();
        oscillator.type = voice.wave;
        oscillator.frequency.setValueAtTime(voice.freq, start);
        const glideTo = voice.freqEnd;
        if (glideTo !== undefined && Number.isFinite(glideTo) && glideTo > 0 && glideTo !== voice.freq) {
            oscillator.frequency.exponentialRampToValueAtTime(glideTo, end);
        }
        this.shape(ctx, oscillator, voice, start, envelope);
        oscillator.start(start);
        oscillator.stop(end + STOP_TAIL);
    }

    /**
     * The gain envelope: a short attack and release around a flat hold, or —
     * for a decay voice — an exponential fall from the peak to near zero.
     */
    private envelope(ctx: AudioContextLike, bus: GainNodeLike, voice: Voice, start: number): GainNodeLike {
        const end = start + voice.dur;
        const attack = Math.min(ENVELOPE_EDGE, voice.dur / 3);
        const release = Math.min(ENVELOPE_EDGE, voice.dur / 3);

        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(voice.gain, start + attack);
        if (voice.decay) {
            envelope.gain.exponentialRampToValueAtTime(NEAR_ZERO, end);
        } else {
            envelope.gain.setValueAtTime(voice.gain, Math.max(start + attack, end - release));
            envelope.gain.linearRampToValueAtTime(0, end);
        }
        envelope.connect(bus);
        return envelope;
    }

    /** Source to envelope, through the voice's biquad filter when it has one. */
    private shape(
        ctx: AudioContextLike,
        source: OscillatorLike | AudioBufferSourceLike,
        voice: Voice,
        start: number,
        envelope: GainNodeLike,
    ): void {
        const wanted = voice.filter;
        if (wanted === undefined || !Number.isFinite(wanted.freq) || wanted.freq <= 0
            || !FILTER_TYPES.includes(wanted.type)) {
            source.connect(envelope);
            return;
        }
        const filter = ctx.createBiquadFilter();
        filter.type = wanted.type;
        filter.frequency.setValueAtTime(wanted.freq, start);
        source.connect(filter);
        filter.connect(envelope);
    }

    /** The shared second of white noise, filled once and kept for this context. */
    private noise(ctx: AudioContextLike): AudioBufferLike {
        if (this.noiseBuffer === null) {
            const rate = Number.isFinite(ctx.sampleRate) && ctx.sampleRate > 0
                ? ctx.sampleRate
                : FALLBACK_SAMPLE_RATE;
            const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(rate)), rate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            this.noiseBuffer = buffer;
        }
        return this.noiseBuffer;
    }

    /** Resume a suspended context, swallowing a rejection or a throw. */
    private resume(): void {
        const ctx = this.ctx;
        if (ctx === null) return;
        try {
            const resumed = ctx.resume();
            if (resumed !== undefined && typeof resumed.then === "function") {
                resumed.then(undefined, () => undefined);
            }
        } catch {
            // A browser that refuses the resume stays silent, as it was told to.
        }
    }
}
