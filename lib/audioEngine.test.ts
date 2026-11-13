import { describe, expect, it } from "vitest";
import { AudioEngine, type AudioBufferLike, type AudioBufferSourceLike, type AudioContextLike, type AudioParamLike, type BiquadFilterLike, type GainNodeLike, type OscillatorLike } from "./audioEngine";
import type { Voice } from "@/game/audio/voice";

/** A param that records every scheduled write. */
class FakeParam implements AudioParamLike {
    value = 0;
    events: string[] = [];

    setValueAtTime(value: number, time: number): void {
        this.events.push(`set ${value}@${time.toFixed(3)}`);
    }

    linearRampToValueAtTime(value: number, time: number): void {
        this.events.push(`lin ${value}@${time.toFixed(3)}`);
    }

    exponentialRampToValueAtTime(value: number, time: number): void {
        this.events.push(`exp ${value}@${time.toFixed(3)}`);
    }
}

class FakeOscillator implements OscillatorLike {
    type = "sine";
    frequency = new FakeParam();
    started: number | null = null;
    stopped: number | null = null;
    connectedTo: unknown = null;

    connect(destination: unknown): void {
        this.connectedTo = destination;
    }

    start(when: number): void {
        this.started = when;
    }

    stop(when: number): void {
        this.stopped = when;
    }
}

class FakeGain implements GainNodeLike {
    gain = new FakeParam();
    connectedTo: unknown = null;

    connect(destination: unknown): void {
        this.connectedTo = destination;
    }
}

class FakeBuffer implements AudioBufferLike {
    data: Float32Array;

    constructor(channels: number, length: number) {
        this.data = new Float32Array(channels * length);
    }

    getChannelData(_channel: number): Float32Array {
        return this.data;
    }
}

class FakeBufferSource implements AudioBufferSourceLike {
    buffer: AudioBufferLike | null = null;
    started: number | null = null;
    stopped: number | null = null;
    connectedTo: unknown = null;

    connect(destination: unknown): void {
        this.connectedTo = destination;
    }

    start(when: number): void {
        this.started = when;
    }

    stop(when: number): void {
        this.stopped = when;
    }
}

class FakeFilter implements BiquadFilterLike {
    type = "lowpass";
    frequency = new FakeParam();
    connectedTo: unknown = null;

    connect(destination: unknown): void {
        this.connectedTo = destination;
    }
}

/** An engine plus every node its fake context made. */
function harness(options: { throws?: boolean; currentTime?: number } = {}) {
    const oscillators: FakeOscillator[] = [];
    const gains: FakeGain[] = [];
    const sources: FakeBufferSource[] = [];
    const buffers: FakeBuffer[] = [];
    const filters: FakeFilter[] = [];
    const destination = { name: "destination" };
    let resumes = 0;
    const context: AudioContextLike = {
        currentTime: options.currentTime ?? 1.5,
        sampleRate: 44100,
        destination,
        resume(): void {
            resumes++;
        },
        createBufferSource(): AudioBufferSourceLike {
            if (options.throws) throw new Error("no WebAudio");
            const source = new FakeBufferSource();
            sources.push(source);
            return source;
        },
        createBuffer(channels: number, length: number): AudioBufferLike {
            if (options.throws) throw new Error("no WebAudio");
            const buffer = new FakeBuffer(channels, length);
            buffers.push(buffer);
            return buffer;
        },
        createBiquadFilter(): BiquadFilterLike {
            if (options.throws) throw new Error("no WebAudio");
            const filter = new FakeFilter();
            filters.push(filter);
            return filter;
        },
        createOscillator(): OscillatorLike {
            if (options.throws) throw new Error("no WebAudio");
            const osc = new FakeOscillator();
            oscillators.push(osc);
            return osc;
        },
        createGain(): GainNodeLike {
            if (options.throws) throw new Error("no WebAudio");
            const gain = new FakeGain();
            gains.push(gain);
            return gain;
        },
    };
    const engine = new AudioEngine(() => {
        if (options.throws) throw new Error("no AudioContext here");
        return context;
    });
    return { engine, oscillators, gains, sources, buffers, filters, destination, resumes: () => resumes };
}

const THREE_VOICES: Voice[] = [
    { wave: "sine", freq: 220, at: 0, dur: 0.1, gain: 0.2 },
    { wave: "square", freq: 440, freqEnd: 110, at: 0.05, dur: 0.2, gain: 0.3 },
    { wave: "sawtooth", freq: 300, at: 0.1, dur: 0.15, gain: 0.1 },
];

describe("AudioEngine before unlock", () => {
    it("play() before unlock() creates no nodes", () => {
        const { engine, oscillators, gains } = harness();
        engine.play(THREE_VOICES, "sfx");
        engine.play(THREE_VOICES, "music");
        expect(oscillators).toHaveLength(0);
        expect(gains).toHaveLength(0);
    });

    it("setVolume and setMuted before unlock are remembered, not applied to nothing", () => {
        const { engine, gains } = harness();
        engine.setVolume("sfx", 0.5);
        engine.setMuted(true);
        expect(gains).toHaveLength(0);
        engine.unlock();
        // The two bus gains exist now and carry the remembered choices.
        expect(gains).toHaveLength(2);
        expect(gains.every((gain) => gain.gain.value === 0)).toBe(true);
    });
});

describe("AudioEngine after unlock", () => {
    it("three voices create exactly three oscillators, each with its own gain", () => {
        const { engine, oscillators, gains } = harness();
        engine.unlock();
        const busGains = gains.length; // the buses already made some gains
        engine.play(THREE_VOICES, "sfx");
        expect(oscillators).toHaveLength(3);
        expect(gains).toHaveLength(busGains + 3);
        for (const osc of oscillators) {
            expect(osc.started).not.toBeNull();
            expect(osc.stopped).not.toBeNull();
            expect((osc.stopped as number) > (osc.started as number)).toBe(true);
            expect(osc.connectedTo).toBeInstanceOf(FakeGain);
        }
    });

    it("unlock() resumes the context", () => {
        const { engine, resumes } = harness();
        engine.unlock();
        expect(resumes()).toBe(1);
    });

    it("voices are scheduled from the context time, at offsets kept", () => {
        const { engine, oscillators } = harness({ currentTime: 10 });
        engine.unlock();
        engine.play(THREE_VOICES, "sfx");
        expect(oscillators[0].started).toBeCloseTo(10, 6);
        expect(oscillators[1].started).toBeCloseTo(10.05, 6);
        expect(oscillators[2].started).toBeCloseTo(10.1, 6);
    });

    it("an absolute time schedules the voices there, not at the context's current time", () => {
        const { engine, oscillators } = harness({ currentTime: 10 });
        engine.unlock();
        engine.play(THREE_VOICES, "music", 42);
        expect(oscillators[0].started).toBeCloseTo(42, 6);
        expect(oscillators[1].started).toBeCloseTo(42.05, 6);
        expect(oscillators[2].started).toBeCloseTo(42.1, 6);
    });

    it("an absolute time in the past is clamped to the clock's zero, and a broken one falls back to now", () => {
        const { engine, oscillators } = harness({ currentTime: 10 });
        engine.unlock();
        engine.play(THREE_VOICES, "music", -5);
        expect(oscillators[0].started).toBeCloseTo(0, 6);
        engine.play(THREE_VOICES, "music", Number.NaN);
        expect(oscillators[3].started).toBeCloseTo(10, 6);
    });

    it("now() is the context time once unlocked and 0 before or without WebAudio", () => {
        const { engine } = harness({ currentTime: 3.25 });
        expect(engine.now()).toBe(0);
        engine.unlock();
        expect(engine.now()).toBe(3.25);
        const { engine: broken } = harness({ throws: true });
        broken.unlock();
        expect(broken.now()).toBe(0);
    });

    it("a glide schedules an exponential ramp, a plain voice does not", () => {
        const { engine, oscillators } = harness();
        engine.unlock();
        engine.play(THREE_VOICES, "sfx");
        expect(oscillators[1].frequency.events.some((e) => e.startsWith("exp 110"))).toBe(true);
        expect(oscillators[0].frequency.events.every((e) => !e.startsWith("exp"))).toBe(true);
    });

    it("every voice fades from and to zero, so nothing clicks", () => {
        const { engine, gains } = harness();
        engine.unlock();
        engine.play(THREE_VOICES, "sfx");
        const envelope = gains[gains.length - 1].gain; // the last voice's gain node
        expect(envelope.events[0]).toMatch(/^set 0@/);
        expect(envelope.events[envelope.events.length - 1]).toMatch(/^lin 0@/);
    });

    it("the bus gain node carries the volume, and mute silences everything", () => {
        const { engine, gains } = harness();
        engine.unlock();
        const [sfxBus, musicBus] = gains;
        expect(sfxBus.gain.value).toBe(0.7);
        expect(musicBus.gain.value).toBe(1);

        engine.setVolume("sfx", 0.4);
        expect(sfxBus.gain.value).toBe(0.4);

        engine.setMuted(true);
        expect(sfxBus.gain.value).toBe(0);
        expect(musicBus.gain.value).toBe(0);

        engine.setMuted(false);
        expect(sfxBus.gain.value).toBe(0.4);
        expect(musicBus.gain.value).toBe(1);
    });

    it("volumes outside 0 to 1 are pinned", () => {
        const { engine, gains } = harness();
        engine.unlock();
        engine.setVolume("sfx", 5);
        expect(gains[0].gain.value).toBe(1);
        engine.setVolume("sfx", -2);
        expect(gains[0].gain.value).toBe(0);
        engine.setVolume("sfx", Number.NaN);
        expect(gains[0].gain.value).toBe(0);
    });

    it("muted play() creates no sound", () => {
        const { engine, oscillators } = harness();
        engine.unlock();
        engine.setMuted(true);
        engine.play(THREE_VOICES, "sfx");
        expect(oscillators).toHaveLength(0);
    });

    it("a voice the context refuses is skipped, the rest still play", () => {
        const made: FakeOscillator[] = [];
        let calls = 0;
        const context: AudioContextLike = {
            currentTime: 0,
            sampleRate: 44100,
            destination: {},
            resume(): void {},
            createOscillator(): OscillatorLike {
                calls++;
                if (calls === 2) throw new Error("refused");
                const osc = new FakeOscillator();
                made.push(osc);
                return osc;
            },
            createGain(): GainNodeLike {
                return new FakeGain();
            },
            createBufferSource(): AudioBufferSourceLike {
                return new FakeBufferSource();
            },
            createBuffer(channels: number, length: number): AudioBufferLike {
                return new FakeBuffer(channels, length);
            },
            createBiquadFilter(): BiquadFilterLike {
                return new FakeFilter();
            },
        };
        const engine = new AudioEngine(() => context);
        engine.unlock();
        expect(() => engine.play(THREE_VOICES, "sfx")).not.toThrow();
        expect(made).toHaveLength(2);
    });
});

const NOISE_VOICES: Voice[] = [
    { wave: "noise", freq: 1800, at: 0, dur: 0.12, gain: 0.2, decay: true, filter: { type: "bandpass", freq: 1800 } },
    { wave: "noise", freq: 8000, at: 0.05, dur: 0.03, gain: 0.05, filter: { type: "highpass", freq: 7200 } },
];

describe("AudioEngine noise voices", () => {
    it("a noise voice plays a buffer source, not an oscillator, and the buffer is made once", () => {
        const { engine, oscillators, sources, buffers } = harness();
        engine.unlock();
        engine.play(NOISE_VOICES, "music");
        expect(oscillators).toHaveLength(0);
        expect(sources).toHaveLength(2);
        expect(buffers).toHaveLength(1); // one shared noise buffer for the context
        expect(sources[0].buffer).toBe(buffers[0]);
        expect(sources[1].buffer).toBe(buffers[0]);
        expect(sources[0].started).not.toBeNull();
        expect((sources[0].stopped as number) > (sources[0].started as number)).toBe(true);
        expect(sources[1].started).toBeCloseTo((sources[0].started as number) + 0.05, 6);
    });

    it("the shared noise buffer is filled with finite samples between -1 and 1", () => {
        const { engine, buffers } = harness();
        engine.unlock();
        engine.play([NOISE_VOICES[0]], "music");
        const data = buffers[0].getChannelData(0);
        expect(data.length).toBeGreaterThan(0);
        for (const sample of data) {
            expect(Number.isFinite(sample)).toBe(true);
            expect(Math.abs(sample)).toBeLessThanOrEqual(1);
        }
    });

    it("a noise voice ignores its frequency, even a broken one", () => {
        const { engine, sources } = harness();
        engine.unlock();
        engine.play([{ wave: "noise", freq: Number.NaN, at: 0, dur: 0.1, gain: 0.2 }], "music");
        engine.play([{ wave: "noise", freq: 0, at: 0, dur: 0.1, gain: 0.2 }], "music");
        expect(sources).toHaveLength(2);
    });

    it("a filtered voice is put through a biquad between source and envelope", () => {
        const { engine, sources, filters, gains } = harness();
        engine.unlock();
        engine.play(NOISE_VOICES, "music");
        expect(filters).toHaveLength(2);
        expect(filters[0].type).toBe("bandpass");
        expect(filters[0].frequency.events.some((e) => e.startsWith("set 1800"))).toBe(true);
        expect(filters[1].type).toBe("highpass");
        expect(sources[0].connectedTo).toBe(filters[0]);
        expect(filters[0].connectedTo).toBeInstanceOf(FakeGain);
        // The envelope is the gain node the filter hands on.
        const envelope = filters[0].connectedTo as FakeGain;
        expect(gains).toContain(envelope);
        expect(envelope.connectedTo).toBe(gains[1]); // the music bus
    });

    it("an oscillator voice can be filtered too", () => {
        const { engine, oscillators, filters } = harness();
        engine.unlock();
        engine.play([{ wave: "sawtooth", freq: 110, at: 0, dur: 0.2, gain: 0.1, filter: { type: "lowpass", freq: 600 } }], "music");
        expect(oscillators).toHaveLength(1);
        expect(filters).toHaveLength(1);
        expect(oscillators[0].connectedTo).toBe(filters[0]);
    });

    it("a filter without a usable frequency is skipped and the source connects straight on", () => {
        const { engine, sources, filters } = harness();
        engine.unlock();
        engine.play([{ wave: "noise", freq: 1, at: 0, dur: 0.1, gain: 0.2, filter: { type: "bandpass", freq: Number.NaN } }], "music");
        expect(filters).toHaveLength(0);
        expect(sources[0].connectedTo).toBeInstanceOf(FakeGain);
    });

    it("a decay voice falls exponentially from the peak to near zero instead of holding flat", () => {
        const { engine, gains } = harness();
        engine.unlock();
        engine.play(
            [
                { wave: "noise", freq: 1800, at: 0, dur: 0.1, gain: 0.2, decay: true },
                { wave: "sine", freq: 440, at: 0, dur: 0.1, gain: 0.2 },
            ],
            "music",
            0,
        );
        const [decayed, flat] = [gains[gains.length - 2].gain, gains[gains.length - 1].gain];
        expect(decayed.events.some((e) => /^exp [0-9.]+@0\.100$/.test(e) && Number(e.slice(4, e.indexOf("@"))) < 0.001)).toBe(true);
        expect(decayed.events.every((e) => !e.startsWith("lin 0@"))).toBe(true); // no flat release
        expect(flat.events.some((e) => e.startsWith("set 0.2@"))).toBe(true);
        expect(flat.events[flat.events.length - 1]).toMatch(/^lin 0@/);
    });
});

describe("AudioEngine without WebAudio", () => {
    it("a factory that throws leaves every call silent, now and after unlock", () => {
        const { engine, oscillators, gains } = harness({ throws: true });
        engine.play(THREE_VOICES, "sfx");
        engine.setVolume("music", 0.5);
        engine.setMuted(true);
        engine.setMuted(false);
        expect(() => engine.unlock()).not.toThrow();
        engine.play(THREE_VOICES, "sfx");
        expect(oscillators).toHaveLength(0);
        expect(gains).toHaveLength(0);
    });
});
