import { describe, expect, it } from "vitest";
import { PATTERN_STEPS, Sequencer, musicStep, tempoFor, type MusicState, type ScheduledStep } from "./music";
import type { Voice } from "./voice";

/** The two energies the pattern is judged at: full and nearly empty. */
const DEPTHS = [1, 4, 7, 20];
const ENERGIES = [1, 0.1];

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
                        expect(Number.isFinite(voice.freq)).toBe(true);
                        expect(voice.freq).toBeGreaterThanOrEqual(40);
                        expect(voice.freq).toBeLessThanOrEqual(4000);
                        expect(voice.gain).toBeGreaterThan(0);
                        expect(Number.isFinite(voice.at)).toBe(true);
                        expect(voice.at).toBeGreaterThanOrEqual(0);
                        expect(voice.dur).toBeGreaterThan(0);
                    }
                }
            }
        }
    });

    it("keeps the gains of any one step at most 0.6", () => {
        for (const depth of DEPTHS) {
            for (const energyPct of ENERGIES) {
                for (let step = 0; step < PATTERN_STEPS; step++) {
                    const sum = musicStep(step, state(depth, energyPct))
                        .reduce((total, voice) => total + voice.gain, 0);
                    expect(sum).toBeLessThanOrEqual(0.6);
                }
            }
        }
    });

    it("wraps the 32-step pattern, so step 32 is step 0 again", () => {
        for (const depth of DEPTHS) {
            for (const energyPct of ENERGIES) {
                expect(JSON.stringify(musicStep(PATTERN_STEPS, state(depth, energyPct))))
                    .toBe(JSON.stringify(musicStep(0, state(depth, energyPct))));
                expect(JSON.stringify(musicStep(PATTERN_STEPS + 7, state(depth, energyPct))))
                    .toBe(JSON.stringify(musicStep(7, state(depth, energyPct))));
            }
        }
    });

    it("drops the bass and brings the high pulse when energy is low", () => {
        for (const depth of DEPTHS) {
            for (const voice of allVoices(depth, 0.1)) {
                expect(voice.freq).toBeGreaterThanOrEqual(110);
            }
            let highSteps = 0;
            for (let step = 0; step < PATTERN_STEPS; step++) {
                if (musicStep(step, state(depth, 0.1)).some((voice) => voice.freq > 800)) highSteps += 1;
            }
            expect(highSteps).toBeGreaterThanOrEqual(12);
        }
    });

    it("has a full bass at high energy, so depth 1 really goes deeper than the low-energy mix", () => {
        const bass = allVoices(1, 1).filter((voice) => voice.freq < 110);
        expect(bass.length).toBeGreaterThan(0);
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
