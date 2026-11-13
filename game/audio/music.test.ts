import { describe, expect, it } from "vitest";
import { PATTERN_STEPS, Sequencer, musicStep, tempoFor, type MusicState, type ScheduledStep } from "./music";
import type { Voice } from "./voice";

/** The depths the layers are judged at, and the energies the pattern is judged at. */
const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ENERGIES = [1, 0.5, 0.24, 0.1, 0];

/** Every voice of every step, for one depth and energy. */
function allVoices(depth: number, energyPct: number): Voice[] {
    const out: Voice[] = [];
    for (let step = 0; step < PATTERN_STEPS; step++) {
        out.push(...musicStep(step, { depth, energyPct }));
    }
    return out;
}

function state(depth: number, energyPct: number): MusicState {
    return { depth, energyPct };
}

/** The step's kick, if it has one: a sine gliding down from 150 Hz with a decay. */
function kickAt(step: number, depth: number, energyPct: number): Voice | undefined {
    return musicStep(step, state(depth, energyPct)).find(
        (voice) => voice.wave === "sine" && voice.freq === 150 && voice.freqEnd === 45,
    );
}

/** The step's snare noise: bandpassed noise around 1800 Hz with a decay. */
function snareAt(step: number, depth: number, energyPct: number): Voice | undefined {
    return musicStep(step, state(depth, energyPct)).find(
        (voice) =>
            voice.wave === "noise"
            && voice.filter !== undefined
            && voice.filter.type === "bandpass"
            && Math.abs(voice.filter.freq - 1800) < 100,
    );
}

/** The step's tune notes: decayed square voices (the tune is the only square). */
function tuneAt(step: number, depth: number, energyPct: number): Voice[] {
    return musicStep(step, state(depth, energyPct)).filter((voice) => voice.wave === "square");
}

describe("tempoFor", () => {
    it("is 96 at depth 1, 112 at depth 5, and capped at 150", () => {
        expect(tempoFor(1)).toBe(96);
        expect(tempoFor(5)).toBe(112);
        expect(tempoFor(99)).toBe(150);
    });
});

describe("musicStep", () => {
    it("is deterministic: the same step and state always give the same voices", () => {
        for (const depth of DEPTHS) {
            for (const energyPct of ENERGIES) {
                for (let step = 0; step < PATTERN_STEPS; step++) {
                    const first = musicStep(step, state(depth, energyPct));
                    const second = musicStep(step, state(depth, energyPct));
                    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
                }
            }
        }
    });

    it("returns finite, audible, quiet voices at every depth and energy", () => {
        for (const depth of DEPTHS) {
            for (const energyPct of ENERGIES) {
                for (let step = 0; step < PATTERN_STEPS; step++) {
                    const voices = musicStep(step, state(depth, energyPct));
                    for (const voice of voices) {
                        expect(Number.isFinite(voice.at)).toBe(true);
                        expect(voice.at).toBeGreaterThanOrEqual(0);
                        expect(voice.dur).toBeGreaterThan(0);
                        expect(voice.gain).toBeGreaterThan(0);
                        expect(voice.gain).toBeLessThanOrEqual(0.5);
                        // Only oscillators carry a pitch; noise ignores its frequency.
                        if (voice.wave !== "noise") {
                            expect(Number.isFinite(voice.freq)).toBe(true);
                            expect(voice.freq).toBeGreaterThanOrEqual(40);
                            expect(voice.freq).toBeLessThanOrEqual(4000);
                            if (voice.freqEnd !== undefined) {
                                expect(Number.isFinite(voice.freqEnd)).toBe(true);
                                expect(voice.freqEnd).toBeGreaterThanOrEqual(40);
                                expect(voice.freqEnd).toBeLessThanOrEqual(4000);
                            }
                        }
                    }
                }
            }
        }
    });

    it("keeps the gains of any one step well under 0.6", () => {
        for (const depth of DEPTHS) {
            for (const energyPct of ENERGIES) {
                for (let step = 0; step < PATTERN_STEPS; step++) {
                    const sum = musicStep(step, state(depth, energyPct))
                        .reduce((total, voice) => total + voice.gain, 0);
                    expect(sum).toBeLessThan(0.6);
                }
            }
        }
    });

    it("wraps the 128-step loop, so step 128 is step 0 again", () => {
        expect(PATTERN_STEPS).toBe(128);
        for (const depth of DEPTHS) {
            for (const energyPct of ENERGIES) {
                expect(JSON.stringify(musicStep(PATTERN_STEPS, state(depth, energyPct))))
                    .toBe(JSON.stringify(musicStep(0, state(depth, energyPct))));
                expect(JSON.stringify(musicStep(PATTERN_STEPS + 7, state(depth, energyPct))))
                    .toBe(JSON.stringify(musicStep(7, state(depth, energyPct))));
            }
        }
    });

    it("thumps a kick on step 0 of every bar, at every depth and energy", () => {
        for (const depth of DEPTHS) {
            for (const energyPct of ENERGIES) {
                for (let bar = 0; bar < 8; bar++) {
                    const kick = kickAt(bar * 16, depth, energyPct);
                    expect(kick).toBeDefined();
                    expect(kick?.decay).toBe(true);
                    expect(kick?.dur).toBeCloseTo(0.12, 6);
                }
            }
        }
    });

    it("plays the snare from depth 2 only, on steps 4 and 12 of the bar", () => {
        for (const energyPct of ENERGIES) {
            for (let step = 0; step < PATTERN_STEPS; step++) {
                const bare = snareAt(step, 1, energyPct);
                expect(bare).toBeUndefined();
            }
            for (let bar = 0; bar < 8; bar++) {
                expect(snareAt(bar * 16 + 4, 2, energyPct)).toBeDefined();
                expect(snareAt(bar * 16 + 12, 2, energyPct)).toBeDefined();
            }
        }
    });

    it("plays the tune from depth 4 only", () => {
        for (const energyPct of [1, 0.5]) {
            let bare = 0;
            let tuned = 0;
            for (let step = 0; step < PATTERN_STEPS; step++) {
                bare += tuneAt(step, 3, energyPct).length;
                tuned += tuneAt(step, 4, energyPct).length;
            }
            expect(bare).toBe(0);
            expect(tuned).toBeGreaterThan(0);
        }
    });

    it("drops the tune and pad when energy is low, keeping drums and bass, and pulses high", () => {
        for (const depth of DEPTHS) {
            for (const energyPct of [0.24, 0.1, 0]) {
                let square = 0;
                let held = 0;
                let pulseSteps = 0;
                let bass = 0;
                let kick = 0;
                for (let step = 0; step < PATTERN_STEPS; step++) {
                    const voices = musicStep(step, state(depth, energyPct));
                    square += voices.filter((voice) => voice.wave === "square").length;
                    // The pad is the only voice held for a whole bar.
                    held += voices.filter((voice) => voice.wave === "triangle" && voice.dur > 1).length;
                    if (voices.some((voice) => voice.wave === "sine" && voice.freq > 800)) pulseSteps += 1;
                    bass += voices.filter((voice) => voice.wave === "sawtooth").length;
                    if (kickAt(step, depth, energyPct) !== undefined) kick += 1;
                }
                expect(square).toBe(0);
                expect(held).toBe(0);
                expect(bass).toBeGreaterThan(0);
                expect(kick).toBe(20); // steps 0 and 8 of every bar, plus step 10 in even bars
                // A short high pulse on every fourth step: 32 of the 128 steps.
                expect(pulseSteps).toBe(32);
            }
        }
    });

    it("has a full bass, pad and tune at high energy, so depth 4 really goes deeper than the bare mix", () => {
        const bass = allVoices(1, 1).filter((voice) => voice.wave === "sawtooth");
        expect(bass.length).toBe(64); // an eighth on every second step of the loop
        expect(allVoices(3, 1).some((voice) => voice.wave === "triangle" && voice.dur > 1)).toBe(true);
        expect(allVoices(4, 1).some((voice) => voice.wave === "square")).toBe(true);
    });

    it("layers on more voices by depth 7 than the bare depth-1 pattern", () => {
        let deeper = false;
        for (let step = 0; step < PATTERN_STEPS; step++) {
            const bare = musicStep(step, state(1, 1)).length;
            const rich = musicStep(step, state(7, 1)).length;
            if (rich > bare) deeper = true;
            expect(rich).toBeGreaterThanOrEqual(bare);
        }
        expect(deeper).toBe(true);
    });
});

describe("Sequencer", () => {
    it("hands out steps 0, 1, 2, ... exactly once, 156.25 ms apart, about 64 in 10 s", () => {
        const seq = new Sequencer();
        seq.start(0);
        const got: ScheduledStep[] = [];
        for (let t = 0; t <= 10; t += 0.05) {
            got.push(...seq.advance(t));
        }
        expect(got.length).toBeGreaterThanOrEqual(63);
        expect(got.length).toBeLessThanOrEqual(66);
        got.forEach((scheduled, index) => {
            expect(scheduled.step).toBe(index);
        });
        for (let i = 1; i < got.length; i++) {
            expect(Math.abs(got[i].time - got[i - 1].time - 0.15625)).toBeLessThan(0.001);
        }
    });

    it("a big jump does not flood: only the lookahead window, and it continues from the present", () => {
        const seq = new Sequencer();
        seq.start(0);
        seq.advance(0);
        const jumped = seq.advance(5);
        expect(jumped.length).toBeLessThanOrEqual(3);
        for (const scheduled of jumped) {
            expect(scheduled.time).toBeGreaterThanOrEqual(5);
        }
        // And it keeps rolling on from there, not from 5 seconds ago.
        const next = seq.advance(5.1);
        for (const scheduled of next) {
            expect(scheduled.time).toBeGreaterThanOrEqual(5);
        }
    });

    it("changes the spacing of later steps only when the depth changes mid-run", () => {
        const seq = new Sequencer();
        seq.start(0);
        const early = seq.advance(0); // depth 1: 156.25 ms steps
        expect(early.length).toBe(2);
        seq.setState(state(20, 1)); // tempo 150: 100 ms steps
        const later: ScheduledStep[] = [];
        for (let t = 0.2; t <= 1; t += 0.05) later.push(...seq.advance(t));
        expect(later.length).toBeGreaterThanOrEqual(6);
        // The first late step still sits one old-length step after the early ones.
        expect(Math.abs(later[0].time - early[early.length - 1].time - 0.15625)).toBeLessThan(0.001);
        for (let i = 1; i < later.length; i++) {
            expect(Math.abs(later[i].time - later[i - 1].time - 0.1)).toBeLessThan(0.001);
        }
    });

    it("stops handing out steps on stop(), and start() begins again at step 0", () => {
        const seq = new Sequencer();
        seq.start(0);
        seq.advance(0);
        seq.stop();
        expect(seq.advance(1)).toEqual([]);
        seq.start(7);
        const restarted = seq.advance(7);
        expect(restarted.length).toBeGreaterThan(0);
        expect(restarted[0].step).toBe(0);
        expect(restarted[0].time).toBe(7);
    });

    it("says nothing before the first start() and never on a broken clock", () => {
        const seq = new Sequencer();
        expect(seq.advance(0)).toEqual([]);
        seq.start(0);
        expect(seq.advance(Number.NaN)).toEqual([]);
    });
});
