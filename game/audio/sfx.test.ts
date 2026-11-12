import { describe, expect, it } from "vitest";
import type { GameEvent } from "../events";
import { beepVoices, noteHz, sfxFor, warnVoices, type SfxContext } from "./sfx";
import type { Voice } from "./voice";

/** A context in the middle of a run; most cases listen with this. */
const MID: SfxContext = { streak: 4, energyPct: 60, depth: 3 };

/** One example of every event type in the union. */
const EVERY_EVENT: GameEvent[] = [
    { type: "start" },
    { type: "levelStart", level: 2, size: 9 },
    { type: "move", x: 3, y: 4, dx: 1, dy: 0 },
    { type: "blocked", dx: 0, dy: 1 },
    { type: "pickup", item: "energy", text: "+25 Energy", x: 2, y: 5 },
    { type: "fight", cost: 12, kind: "wisp", x: 6, y: 1 },
    { type: "fight", cost: 15, kind: "stalker", x: 6, y: 1, by: "stalker" },
    { type: "stalker", id: 4, x: 3, y: 3 },
    { type: "levelClear", level: 2, gained: 137 },
    { type: "dead", cause: "time", score: 42, level: 2 , lost: 0 },
];

/** The latest a voice goes quiet, seconds from the trigger. */
function endsAt(voice: Voice): number {
    return voice.at + voice.dur;
}

/** The loudest gain in a sound. */
function loudest(voices: Voice[]): number {
    return Math.max(...voices.map((voice) => voice.gain));
}

describe("noteHz", () => {
    it("roots the scale at 220 Hz and repeats it an octave up", () => {
        expect(noteHz(0)).toBeCloseTo(220, 6);
        expect(noteHz(5)).toBeCloseTo(440, 6);
        expect(noteHz(-5)).toBeCloseTo(110, 6);
    });

    it("rises with the degree across several octaves, negatives included", () => {
        for (let degree = -12; degree < 24; degree++) {
            expect(noteHz(degree + 1)).toBeGreaterThan(noteHz(degree));
        }
    });

    it("stays finite over the whole playable range and survives a broken degree", () => {
        for (const degree of [-200, -100, 100, 200]) {
            expect(Number.isFinite(noteHz(degree))).toBe(true);
        }
        expect(noteHz(Number.NaN)).toBeCloseTo(220, 6);
    });
});

describe("sfxFor voices are safe to play", () => {
    it("every event type gives finite, audible, quiet, short voices", () => {
        for (const event of EVERY_EVENT) {
            for (const ctx of [MID, { streak: 0, energyPct: 100, depth: 1 }, { streak: 40, energyPct: 1, depth: 20 }]) {
                const voices = sfxFor(event, ctx);
                for (const voice of voices) {
                    expect(Number.isFinite(voice.freq)).toBe(true);
                    expect(voice.freq).toBeGreaterThanOrEqual(40);
                    expect(voice.freq).toBeLessThanOrEqual(4000);
                    if (voice.freqEnd !== undefined) {
                        expect(Number.isFinite(voice.freqEnd)).toBe(true);
                        expect(voice.freqEnd).toBeGreaterThanOrEqual(40);
                        expect(voice.freqEnd).toBeLessThanOrEqual(4000);
                    }
                    expect(voice.gain).toBeGreaterThan(0);
                    expect(voice.gain).toBeLessThanOrEqual(0.5);
                    expect(voice.dur).toBeGreaterThan(0);
                    expect(voice.at).toBeGreaterThanOrEqual(0);
                    expect(endsAt(voice)).toBeLessThanOrEqual(1.5);
                }
            }
        }
    });

    it("an unknown event type gives an empty list", () => {
        const bogus = { type: "confetti" } as unknown as GameEvent;
        expect(sfxFor(bogus, MID)).toEqual([]);
    });
});

describe("sfxFor per event", () => {
    it("move is one very quiet short tick, bearable nine a second", () => {
        const voices = sfxFor({ type: "move", x: 0, y: 0, dx: 1, dy: 0 }, MID);
        expect(voices).toHaveLength(1);
        expect(voices[0].gain).toBeLessThanOrEqual(0.05);
        expect(voices[0].dur).toBeLessThanOrEqual(0.06);
    });

    it("blocked is a low thud falling in pitch", () => {
        const voices = sfxFor({ type: "blocked", dx: 1, dy: 0 }, MID);
        expect(voices.length).toBeGreaterThanOrEqual(1);
        expect(voices[0].freqEnd).toBeDefined();
        expect(voices[0].freqEnd as number).toBeLessThan(voices[0].freq);
        expect(voices[0].freq).toBeLessThan(250);
    });

    it("pickup is two quick rising notes", () => {
        const voices = sfxFor({ type: "pickup", item: "energy", text: "+25 Energy", x: 0, y: 0 }, MID);
        expect(voices).toHaveLength(2);
        expect(voices[1].at).toBeGreaterThan(voices[0].at);
        expect(voices[1].freq).toBeGreaterThan(voices[0].freq);
        expect(voices[1].at + voices[1].dur).toBeLessThan(0.5);
    });

    it("pickup with streak 3 starts higher than with streak 2", () => {
        const two = sfxFor({ type: "pickup", item: "energy", text: "t", x: 0, y: 0 }, { ...MID, streak: 2 });
        const three = sfxFor({ type: "pickup", item: "energy", text: "t", x: 0, y: 0 }, { ...MID, streak: 3 });
        expect(three[0].freq).toBeGreaterThan(two[0].freq);
    });

    it("a streak of 40 still stays under 4000 Hz", () => {
        const voices = sfxFor({ type: "pickup", item: "energy", text: "t", x: 0, y: 0 }, { ...MID, streak: 40 });
        for (const voice of voices) {
            expect(voice.freq).toBeLessThan(4000);
        }
    });

    it("fight is a harsh falling sawtooth plus a low square, about 0.15 s", () => {
        const voices = sfxFor({ type: "fight", cost: 10, kind: "wisp", x: 0, y: 0 }, MID);
        expect(voices).toHaveLength(2);
        const saw = voices.find((voice) => voice.wave === "sawtooth");
        const square = voices.find((voice) => voice.wave === "square");
        expect(saw).toBeDefined();
        expect(square).toBeDefined();
        expect(saw!.freqEnd as number).toBeLessThan(saw!.freq);
        expect(square!.freq).toBeLessThan(saw!.freq);
        for (const voice of voices) expect(voice.dur).toBeLessThanOrEqual(0.2);
    });

    it("levelClear is a four-note rising arpeggio", () => {
        const voices = sfxFor({ type: "levelClear", level: 1, gained: 100 }, MID);
        expect(voices).toHaveLength(4);
        for (let i = 1; i < voices.length; i++) {
            expect(voices[i].freq).toBeGreaterThan(voices[i - 1].freq);
            expect(voices[i].at).toBeGreaterThan(voices[i - 1].at);
        }
    });

    it("levelStart is one soft low note", () => {
        const voices = sfxFor({ type: "levelStart", level: 1, size: 7 }, MID);
        expect(voices).toHaveLength(1);
        expect(voices[0].freq).toBeLessThan(200);
        expect(loudest(voices)).toBeLessThanOrEqual(0.2);
    });

    it("dead is three slow falling notes", () => {
        const voices = sfxFor({ type: "dead", cause: "time", score: 0, level: 1 , lost: 0 }, MID);
        expect(voices).toHaveLength(3);
        for (let i = 1; i < voices.length; i++) {
            expect(voices[i].freq).toBeLessThan(voices[i - 1].freq);
            expect(voices[i].at).toBeGreaterThan(voices[i - 1].at);
        }
        for (const voice of voices) expect(voice.dur).toBeGreaterThanOrEqual(0.2);
    });
});

describe("beepVoices", () => {
    it("3, 2 and 1 each give an audible beep", () => {
        for (const n of [3, 2, 1]) {
            const voices = beepVoices(n);
            expect(voices.length).toBeGreaterThanOrEqual(1);
            expect(voices[0].gain).toBeGreaterThan(0);
            expect(voices[0].gain).toBeLessThanOrEqual(0.5);
        }
    });

    it("0 gives a higher beep than 1", () => {
        const go = beepVoices(0);
        const one = beepVoices(1);
        expect(go.length).toBeGreaterThanOrEqual(1);
        expect(go[0].freq).toBeGreaterThan(one[0].freq);
    });

    it("a number outside the countdown is silent", () => {
        expect(beepVoices(4)).toEqual([]);
        expect(beepVoices(-1)).toEqual([]);
    });
});

describe("warnVoices", () => {
    it("is a soft double pulse", () => {
        const voices = warnVoices();
        expect(voices).toHaveLength(2);
        expect(voices[1].at).toBeGreaterThan(voices[0].at);
        expect(loudest(voices)).toBeLessThanOrEqual(0.2);
        for (const voice of voices) {
            expect(voice.freq).toBeGreaterThanOrEqual(40);
            expect(voice.freq).toBeLessThanOrEqual(4000);
            expect(endsAt(voice)).toBeLessThanOrEqual(1.5);
        }
    });
});
