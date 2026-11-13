// The run log and its replay, tested against the live rules: a bot plays a
// seeded RecordingRun, the log is encoded, decoded and replayed, and every
// number must match the run that made it. A tampered log must give a
// different result or null, malformed text must decode to null, and a
// 15-minute bot run at 60 ticks a second must encode within 64 kB.

import { describe, expect, it } from "vitest";
import {
    RecordingRun,
    RUN_LOG_MAX_EVENTS,
    decodeLog,
    encodeLog,
    type RunLog,
    type RunLogEvent,
} from "@/game/runlog";
import { replay } from "@/game/replay";
import { nextStep, playBot } from "@/game/bot";
import { MODES, MODE_IDS, type ModeId } from "@/game/modes";

const GEAR = { boots: 2, gloves: 1, shield: 0, speed: 3, backpack: 1 };
const FEATS = ["depth-5", "first-exit"];
const PICKED_UP = [{ layer: "Body", trait: "Green" }];

/** A fresh recording run under the test bank, feats and held traits. */
function makeRun(seed: number, mode: ModeId): RecordingRun {
    return new RecordingRun({ seed, gear: GEAR, mode: MODES[mode], feats: FEATS, pickedUp: PICKED_UP });
}

/**
 * Play a run with the bot the way the shell drives it: whole-millisecond
 * ticks, a step on the shortest route every few frames, the next level on
 * "clear" and a tool now and then when a charge is carried. Returns the
 * finished run with its log.
 */
function playLogged(seed: number, mode: ModeId): RecordingRun {
    const run = makeRun(seed, mode);
    run.start();
    for (let i = 0; i < 2000 && run.phase !== "dead"; i++) {
        if (run.phase === "clear") {
            run.nextLevel();
            continue;
        }
        if (i % 97 === 0 && run.tools.anchor > 0) run.useTool("anchor");
        if (i % 89 === 0 && run.tools.twist > 0) run.useTool("twist");
        if (i % 83 === 0 && run.tools.cut > 0) run.useTool("cut", "u");
        run.tick(125);
        if (run.phase !== "playing") continue;
        const step = nextStep(run);
        if (step === null) break;
        run.move(step.dx, step.dy);
    }
    return run;
}

/** The traits the run banked at exits, the way the shell reads them. */
function bankedByRun(run: RecordingRun): { layer: string; trait: string }[] {
    return run
        .takeEvents()
        .filter((event) => event.type === "traitKept")
        .map((event) => ({ layer: event.layer, trait: event.trait }));
}

/** True when two replay results (or the absence of one) say different things. */
function resultsDiffer(a: ReturnType<typeof replay>, b: ReturnType<typeof replay>): boolean {
    if (a === null || b === null) return a !== b;
    return JSON.stringify(a) !== JSON.stringify(b);
}

describe("RecordingRun and the log round trip", () => {
    it("records only whole-millisecond ticks, carrying the fraction", () => {
        const run = makeRun(11, "descent");
        run.start();
        for (let i = 0; i < 30; i++) run.tick(1000 / 60);
        const ticks = run.getLog().events.filter((event) => event.t === "t");
        expect(ticks.length).toBeGreaterThan(0);
        expect(ticks.every((event) => event.t === "t" && Number.isInteger(event.ms))).toBe(true);
        // Nothing is lost or invented: the run saw exactly the logged total.
        expect(ticks.reduce((sum, event) => sum + (event.t === "t" ? event.ms : 0), 0)).toBe(
            run.tally.ms,
        );
    });

    it("encodes a log and decodes it back unchanged", () => {
        for (const mode of MODE_IDS) {
            const log = playLogged(4242, mode).getLog();
            expect(log.events.length).toBeGreaterThan(0);
            expect(decodeLog(encodeLog(log))).toEqual(log);
        }
    });

    it("keeps ticks whole when the driver passes fractions", () => {
        // playBot hands the run 1000 / movesPerSecond, a float: the log must
        // still store integers and replay to the same result.
        for (const movesPerSecond of [60, 7, 8.5]) {
            const run = makeRun(31337, "descent");
            playBot(run, movesPerSecond, 1500);
            const log = run.getLog();
            expect(log.events.every((event) => event.t !== "t" || Number.isInteger(event.ms))).toBe(true);
            const result = replay(decodeLog(encodeLog(log))!);
            expect(result).not.toBeNull();
            expect(result!.tally).toEqual(run.tally);
            expect(result!.score).toBe(run.score);
        }
    });

    it("collapses runs of equal ticks into one entry", () => {
        const run = makeRun(9, "descent");
        run.start();
        for (let i = 0; i < 5000; i++) run.tick(16);
        const text = encodeLog(run.getLog());
        expect(text).toContain("t16*5000");
        expect(text.length).toBeLessThan(200);
    });
});

describe("replay reaches the identical result", () => {
    for (const mode of MODE_IDS) {
        it(`replays 200 bot runs of ${mode} exactly`, () => {
            for (let s = 0; s < 200; s++) {
                const run = playLogged(1 + s * 7919, mode);
                const log = run.getLog();
                const decoded = decodeLog(encodeLog(log));
                expect(decoded).not.toBeNull();
                const result = replay(decoded!);
                expect(result).not.toBeNull();
                expect(result!.tally).toEqual(run.tally);
                expect(result!.score).toBe(run.score);
                expect(result!.depth).toBe(run.tally.depth);
                expect(result!.mode).toBe(mode);
                expect(result!.gear).toEqual(run.banked);
                expect(result!.pickedUp).toEqual(bankedByRun(run));
                expect(result!.ended).toBe(run.phase === "dead" || run.phase === "done");
            }
        }, 120_000);
    }

    it("replays an abandoned run as ended", () => {
        const run = playLogged(77, "descent");
        // The bot may already be dead; replay only proves the abandon path.
        if (run.phase === "playing" || run.phase === "clear") {
            run.abandon();
            const result = replay(decodeLog(encodeLog(run.getLog()))!);
            expect(result).not.toBeNull();
            expect(result!.ended).toBe(true);
            expect(result!.tally).toEqual(run.tally);
        } else {
            expect(true).toBe(true);
        }
        const fresh = makeRun(78, "descent");
        fresh.start();
        fresh.tick(100);
        fresh.abandon();
        const result = replay(fresh.getLog());
        expect(result).not.toBeNull();
        expect(result!.ended).toBe(true);
        expect(result!.tally.ms).toBe(100);
    });

    it("returns null for a tool the run does not hold", () => {
        const log = playLogged(5, "descent").getLog();
        const tampered: RunLog = { ...log, events: [...log.events] };
        // Right after the start no charge of anything is carried.
        tampered.events.splice(1, 0, { t: "o", id: "anchor" });
        expect(replay(tampered)).toBeNull();
        tampered.events[1] = { t: "o", id: "twist" };
        expect(replay(tampered)).toBeNull();
        tampered.events[1] = { t: "o", id: "cut", dir: "u" };
        expect(replay(tampered)).toBeNull();
    });
});

describe("a tampered log gives a different result or null", () => {
    for (const seed of [3, 17, 99, 40_404]) {
        it(`catches tampering with seed ${seed}`, () => {
            const run = playLogged(seed, "descent");
            const log = run.getLog();
            const honest = replay(log);
            expect(honest).not.toBeNull();

            // One extra move inserted mid-log.
            const extraMove: RunLog = { ...log, events: [...log.events] };
            extraMove.events.splice(Math.floor(extraMove.events.length / 2), 0, { t: "m", dx: 1, dy: 0 });
            expect(resultsDiffer(replay(extraMove), honest)).toBe(true);

            // One tick of the run gains a millisecond.
            const changedTick: RunLog = { ...log, events: [...log.events] };
            const at = changedTick.events.findIndex((event) => event.t === "t");
            expect(at).toBeGreaterThan(-1);
            const tick = changedTick.events[at];
            expect(tick.t).toBe("t");
            if (tick.t === "t") changedTick.events[at] = { t: "t", ms: tick.ms + 1 };
            expect(resultsDiffer(replay(changedTick), honest)).toBe(true);

            // A different seed under the same calls.
            expect(resultsDiffer(replay({ ...log, seed: log.seed + 1 }), honest)).toBe(true);
        });
    }
});

describe("decodeLog never throws and answers null to malformed text", () => {
    const BASE = "1|7|descent|0.0.0.0.0|||s";

    it("reads a minimal log back", () => {
        const log = decodeLog(BASE);
        expect(log).not.toBeNull();
        expect(log!.v).toBe(1);
        expect(log!.seed).toBe(7);
        expect(log!.events).toEqual([{ t: "s" }]);
    });

    it("rejects anything malformed", () => {
        const malformed = [
            "",
            "not a log",
            "1",
            "1|7|descent|0.0.0.0.0||", // one field short
            "1|7|descent|0.0.0.0.0|||s|", // one field too many
            "2|7|descent|0.0.0.0.0|||s", // unknown version
            "0|7|descent|0.0.0.0.0|||s",
            "1|seven|descent|0.0.0.0.0|||s", // seed not a number
            "1|7.5|descent|0.0.0.0.0|||s",
            "1|7|nope|0.0.0.0.0|||s", // unknown mode
            "1|7|descent|0.0.0.0|||s", // four gear levels
            "1|7|descent|0.0.0.0.x|||s", // gear not a number
            "1|7|descent|0.0.0.0.-1|||s", // gear negative
            "1|7|descent|0.0.0.0.0|Bad Feat||s", // feat id with a space
            "1|7|descent|0.0.0.0.0|;DROP||s",
            "1|7|descent|0.0.0.0.0||Bogus:Thing|s", // unknown layer
            "1|7|descent|0.0.0.0.0||Body|s", // trait missing
            "1|7|descent|0.0.0.0.0||Body:Th:ing|s",
            "1|7|descent|0.0.0.0.0|||q", // stray letter in the stream
            "1|7|descent|0.0.0.0.0|||,",
            "1|7|descent|0.0.0.0.0|||t", // tick without a value
            "1|7|descent|0.0.0.0.0|||t0", // tick of nothing
            "1|7|descent|0.0.0.0.0|||t-4",
            "1|7|descent|0.0.0.0.0|||t5*1", // run-length of one
            "1|7|descent|0.0.0.0.0|||t5*", // run-length missing
            "1|7|descent|0.0.0.0.0|||t5*x",
            "1|7|descent|0.0.0.0.0|||c", // cut without a direction
            "1|7|descent|0.0.0.0.0|||cz",
            "1|7|descent|0.0.0.0.0|||m1", // move missing its dy
            "1|7|descent|0.0.0.0.0|||m1,x",
            "1|7|descent|0.0.0.0.0|||uudl!", // good stream with a stray end
        ];
        for (const text of malformed) expect(decodeLog(text)).toBeNull();
    });

    it("caps a log at 200000 events", () => {
        const head: Omit<RunLog, "events"> = {
            v: 1,
            seed: 3,
            mode: "descent",
            gear: { boots: 0, gloves: 0, shield: 0, speed: 0, backpack: 0 },
            feats: [],
            pickedUp: [],
        };
        const tick = (): RunLogEvent => ({ t: "t", ms: 16 });
        const atCap: RunLog = { ...head, events: Array.from({ length: RUN_LOG_MAX_EVENTS }, tick) };
        expect(decodeLog(encodeLog(atCap))).not.toBeNull();
        const overCap: RunLog = { ...head, events: Array.from({ length: RUN_LOG_MAX_EVENTS + 1 }, tick) };
        expect(decodeLog(encodeLog(overCap))).toBeNull();
        // A run-length entry counts every event it expands to.
        const oneEntry: RunLog = { ...head, events: [{ t: "t", ms: 16 }, { t: "t", ms: 17 }] };
        const headText = encodeLog(oneEntry).split("|").slice(0, 6).join("|");
        // One run-length entry that alone expands past the cap.
        expect(decodeLog(`${headText}|t16*200000t17`)).toBeNull();
    });
});

describe("the log fits its budget", () => {
    it("a 15-minute bot run at 60 ticks a second encodes under 64 kB", () => {
        const run = makeRun(4242, "descent");
        run.start();
        // The shell's cadence: one whole-millisecond tick per frame at 60 fps
        // and a step every CONFIG.stepMs (110 ms ~= every 7th frame). A dead
        // run starts again at once, so the whole quarter hour is real play.
        const frames = 15 * 60 * 60;
        let sinceStep = 0;
        for (let frame = 0; frame < frames; frame++) {
            run.tick(16);
            sinceStep += 1;
            if (sinceStep < 7) continue;
            sinceStep = 0;
            if (run.phase === "clear") {
                run.nextLevel();
                continue;
            }
            if (run.phase === "dead") {
                run.start();
                continue;
            }
            const step = nextStep(run);
            if (step !== null) run.move(step.dx, step.dy);
        }
        const log = run.getLog();
        // Sixty ticks a second for a quarter of an hour, give or take the frames
        // a restart costs: the raw list is huge, the text must not be.
        const tickEvents = log.events.filter((event) => event.t === "t").length;
        expect(tickEvents).toBeGreaterThan(15 * 60 * 50);
        const text = encodeLog(log);
        expect(text.length).toBeLessThanOrEqual(64 * 1024);
        // And the compact text still decodes to a replayable log.
        expect(decodeLog(text)).not.toBeNull();
    });
});
