// The one place that turns Voices into sound: an injected factory hands over an
// AudioContext-like object, and every voice becomes exactly one oscillator and
// one gain node on a named bus, with a short attack and release so nothing
// clicks. This file never names a browser global itself — no AudioContext
// constructor, no window — so its tests run in plain node with a fake, and a
// browser without WebAudio (or a context refused before the first gesture)
// simply never hears anything: every method is a silent no-op then.

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

/** The part of a GainNode this engine uses. */
export interface GainNodeLike {
    gain: AudioParamLike;
    connect(destination: unknown): void;
}

/** The part of an AudioContext this engine uses; a real one satisfies it. */
export interface AudioContextLike {
    readonly currentTime: number;
    readonly destination: unknown;
    resume(): Promise<void> | void;
    createOscillator(): OscillatorLike;
    createGain(): GainNodeLike;
}

/** Builds the context on unlock; the shell passes its own AudioContext maker. */
export type ContextFactory = () => AudioContextLike;

/** Seconds of fade in and out on every voice, so starts and stops never click. */
const ENVELOPE_EDGE = 0.008;

/** Seconds the oscillator keeps sounding past the envelope, so the release lands. */
const STOP_TAIL = 0.005;

/** Pin a volume into [0, 1]; a broken number lands on 0. */
function clampVolume(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

/**
 * The game's synthesizer. Constructing it creates nothing: the factory is only
 * called on unlock(), and from then on play() schedules one oscillator and one
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
     * Schedule one sound: one oscillator and one gain node per voice, on the
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
            if (!Number.isFinite(voice.freq) || voice.freq <= 0) continue;
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

    /** One oscillator and one gain node, with a short attack and release. */
    private voice(ctx: AudioContextLike, bus: GainNodeLike, voice: Voice, start: number): void {
        const end = start + voice.dur;
        const attack = Math.min(ENVELOPE_EDGE, voice.dur / 3);
        const release = Math.min(ENVELOPE_EDGE, voice.dur / 3);

        const oscillator = ctx.createOscillator();
        const { wave } = voice;
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(voice.freq, start);
        const glideTo = voice.freqEnd;
        if (glideTo !== undefined && Number.isFinite(glideTo) && glideTo > 0 && glideTo !== voice.freq) {
            oscillator.frequency.exponentialRampToValueAtTime(glideTo, end);
        }

        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(voice.gain, start + attack);
        envelope.gain.setValueAtTime(voice.gain, Math.max(start + attack, end - release));
        envelope.gain.linearRampToValueAtTime(0, end);

        oscillator.connect(envelope);
        envelope.connect(bus);
        oscillator.start(start);
        oscillator.stop(end + STOP_TAIL);
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
