// The run log round trip (game/runlog.ts) and the verifier's replay
// (game/replay.ts): a bot plays a RecordingRun, the log is encoded, decoded
// and replayed, and every number the shell reads must come out identical.
// Also the compactness budget, the tamper and malformed-text refusals, and
// the 200,000-event cap.

import { describe, expect, test } from "vitest";

import { RecordingRun, decodeLog, encodeLog, MAX_LOG_EVENTS, type RunLog, type RunLogEvent } from "./runlog";
import { replay } from "./replay";
import { nextStep, routeCells } from "./bot";
import { MODES, MODE_IDS, type ModeId } from "./modes";
import { TOOL_IDS } from "./tools";
import { noGear, type GearLevels } from "./gear";

/** Gear for the seeded runs: a little of everything, varying with the seed. */
function gearFor(seed: number): GearLevels {
    return {
        boots: seed % 6,
        gloves: (seed >> 1) % 6,
        shield: (seed >> 2) % 6,
        speed: (seed >> 3) % 6,
        backpack: (seed >> 4) % 6,
    };
}

/**
 * Play a recording run with the bot: route to the exit, spend any tool
 * charge that comes along, take the next level on "clear". Integer ticks,
 * as the shell's loop hands them.
 */
function botPlay(run: RecordingRun, maxSteps: number): void {
    run.start();
    for (let i = 0; i < maxSteps && run.phase !== "dead" && run.phase !== "done"; i++) {
        if (run.phase === "clear") {
            run.nextLevel();
            continue;
        }
        for (const id of TOOL_IDS) {
            if (run.tools[id] <= 0) continue;
            if (id === "cut") run.useTool("cut", "u");
            else run.useTool(id);
        }
        const step = nextStep(run);
        if (step === null) break;
        run.tick(16 + (i % 3));
        if (run.phase !== "playing") continue;
        run.move(step.dx, step.dy);
    }
}

/** The traits a finished live run kept at its exits, from its own events. */
function liveKeptTraits(run: RecordingRun): { layer: string; trait: string; rarity: string }[] {
    return run.takeEvents().flatMap((event) =>
        event.type === "traitKept"
            ? [{ layer: event.layer, trait: event.trait, rarity: event.rarity }]
            : [],
    );
}

/** The number the shell scores this mode by: milliseconds for a time mode. */
function liveScore(run: RecordingRun): number {
    return MODES[run.modeId].scoring === "time" ? run.tally.ms : run.score;
}

/** Encode, decode and replay a log; the replay must not refuse it. */
function roundTrip(log: RunLog) {
    const text = encodeLog(log);
    const decoded = decodeLog(text);
    expect(decoded).not.toBeNull();
    const result = replay(decoded);
    expect(result).not.toBeNull();
    return { text, decoded: decoded as RunLog, result: result as NonNullable<ReturnType<typeof replay>> };
}

describe("bot runs replay to the identical result", () => {
    test("200 seeds across all four modes", () => {
        for (const mode of MODE_IDS) {
            for (let seed = 0; seed < 200; seed++) {
                const run = new RecordingRun({
                    seed,
                    gear: gearFor(seed),
                    mode: MODES[mode as ModeId],
                    feats: [],
                    pickedUp: [],
                });
                botPlay(run, 400);
                const log = run.getLog();
                const kept = liveKeptTraits(run);
                const { result } = roundTrip(log);
                expect(result.tally, `seed ${seed} ${mode}`).toEqual(run.tally);
                expect(result.score, `seed ${seed} ${mode}`).toBe(liveScore(run));
                expect(result.depth, `seed ${seed} ${mode}`).toBe(run.tally.depth);
                expect(result.pickedUp, `seed ${seed} ${mode}`).toEqual(kept);
                expect(result.gear, `seed ${seed} ${mode}`).toEqual(run.banked);
                expect(result.mode).toBe(mode);
            }
        }
    }, 120_000);

    test("a run abandoned after playing replays ended and identical", () => {
        const run = new RecordingRun({ seed: 9, gear: gearFor(9), mode: MODES.descent, feats: [], pickedUp: [] });
        botPlay(run, 200);
        run.abandon();
        const { result } = roundTrip(run.getLog());
        expect(result.tally).toEqual(run.tally);
        expect(result.ended).toBe(true);
    });

    test("a restarted run logs only the run after the last start", () => {
        const run = new RecordingRun({ seed: 5, gear: noGear(), mode: MODES.descent, feats: [], pickedUp: [] });
        botPlay(run, 60);
        run.start();
        botPlay(run, 60);
        const log = run.getLog();
        const { result } = roundTrip(log);
        expect(result.tally).toEqual(run.tally);
        // The log holds no call from before the restart's start.
        expect(log.events[0]?.kind === "abandon").toBe(false);
    });
});

describe("the log is compact", () => {
    test("a 15-minute bot run at 60 ticks a second encodes to at most 64 kB", () => {
        // The shell's cadence: one tick of 1000/60 ms per frame, the bot
        // stepping about once a second, the maze turning under it.
        const run = new RecordingRun({
            seed: 0,
            gear: { boots: 15, gloves: 15, shield: 15, speed: 15, backpack: 15 },
            mode: MODES.zen,
            feats: [],
            pickedUp: [],
        });
        run.start();
        const frames = 15 * 60 * 60; // 15 minutes at 60 ticks a second
        for (let i = 0; i < frames; i++) {
            run.tick(1000 / 60);
            if (run.phase === "clear") {
                run.nextLevel();
                continue;
            }
            if (run.phase !== "playing" || i % 60 !== 0) continue;
            const target = run.energy < 40
                ? [...run.items]
                    .filter((item) => item.type === "energy")
                    .sort((a, b) =>
                        Math.abs(a.x - run.player.x) + Math.abs(a.y - run.player.y)
                        - (Math.abs(b.x - run.player.x) + Math.abs(b.y - run.player.y)))[0] ?? run.exit
                : run.exit;
            const blocked = (x: number, y: number) =>
                run.enemies.some((e) => e.x === x && e.y === y)
                || (x === run.maze.origin.x && y === run.maze.origin.y);
            const path = routeCells(run.maze, { x: run.player.x, y: run.player.y }, target);
            let next = path !== null && path.length >= 2 ? path[1] : null;
            if (next !== null && blocked(next.x, next.y)) next = null;
            if (next === null) {
                for (const d of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
                    if (!run.maze.canMove(run.player.x, run.player.y, d[0], d[1])) continue;
                    if (blocked(run.player.x + d[0], run.player.y + d[1])) continue;
                    next = { x: run.player.x + d[0], y: run.player.y + d[1] };
                    break;
                }
            }
            if (next !== null) run.move(next.x - run.player.x, next.y - run.player.y);
        }
        // It really played the quarter of an hour.
        expect(run.phase).toBe("playing");
        expect(run.tally.ms).toBeGreaterThanOrEqual(899_000);
        const text = encodeLog(run.getLog());
        expect(text.length).toBeLessThanOrEqual(64 * 1024);
    }, 60_000);

    test("consecutive ticks with the same value collapse into a run-length entry", () => {
        const events: RunLogEvent[] = [];
        for (let i = 0; i < 5; i++) events.push({ kind: "tick", ms: 16 });
        for (let i = 0; i < 3; i++) events.push({ kind: "tick", ms: 17 });
        const log: RunLog = {
            v: 1, seed: 1, mode: "descent", gear: noGear(), feats: [], pickedUp: [], events,
        };
        const text = encodeLog(log);
        expect(text).toContain("t16x5");
        expect(text).toContain("t17x3");
        const decoded = decodeLog(text);
        expect(decoded).not.toBeNull();
        expect(decoded?.events).toEqual(events);
    });

    test("ticks with nothing between them merge into one event", () => {
        const run = new RecordingRun({ seed: 3, gear: noGear(), mode: MODES.zen, feats: [], pickedUp: [] });
        run.start();
        for (let i = 0; i < 10; i++) run.tick(16.5);
        const log = run.getLog();
        expect(log.events).toEqual([{ kind: "tick", ms: 165 }]);
    });
});

describe("decodeLog refuses malformed text with null", () => {
    const broken: string[] = [
        "",
        "not json",
        "[]",
        "42",
        "null",
        "{}",
        '{"v":2,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":""}',
        '{"v":1,"s":-1,"m":"descent","g":{},"f":[],"p":[],"e":""}',
        '{"v":1,"s":1.5,"m":"descent","g":{},"f":[],"p":[],"e":""}',
        '{"v":1,"s":"1","m":"descent","g":{},"f":[],"p":[],"e":""}',
        '{"v":1,"s":1,"m":"nope","g":{},"f":[],"p":[],"e":""}',
        '{"v":1,"s":1,"m":"descent","f":[],"p":[],"e":""}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":7}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":{},"p":[],"e":""}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[{"layer":1}],"e":""}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"zz"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"t0"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"t-3"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"t16x0"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"t16x"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"m?"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"ux"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"uc"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"ua u"}',
        '{"v":1,"s":1,"m":"descent","g":{},"f":[],"p":[],"e":"n."}',
    ];
    for (const text of broken) {
        test(`null for ${JSON.stringify(text.slice(0, 40))}`, () => {
            expect(decodeLog(text)).toBeNull();
        });
    }

    test("null for non-string input", () => {
        expect(decodeLog(undefined as unknown as string)).toBeNull();
        expect(decodeLog(42 as unknown as string)).toBeNull();
    });

    test("a valid empty-event log decodes back whole", () => {
        const log: RunLog = { v: 1, seed: 7, mode: "zen", gear: gearFor(7), feats: ["f"], pickedUp: [{ layer: "Body", trait: "Blue" }], events: [] };
        expect(decodeLog(encodeLog(log))).toEqual(log);
    });

    test("every event kind round-trips", () => {
        const log: RunLog = {
            v: 1,
            seed: 11,
            mode: "descent",
            gear: gearFor(11),
            feats: [],
            pickedUp: [],
            events: [
                { kind: "tick", ms: 16 },
                { kind: "move", dx: 1, dy: 0 },
                { kind: "move", dx: 0, dy: -1 },
                { kind: "tool", id: "anchor" },
                { kind: "tool", id: "twist" },
                { kind: "tool", id: "cut", dir: "r" },
                { kind: "next" },
                { kind: "abandon" },
            ],
        };
        expect(decodeLog(encodeLog(log))).toEqual(log);
    });
});

describe("the log is capped at 200,000 events", () => {
    function ticked(count: number): string {
        const events: RunLogEvent[] = [];
        for (let i = 0; i < count; i++) events.push({ kind: "tick", ms: 16 });
        const log: RunLog = { v: 1, seed: 1, mode: "descent", gear: noGear(), feats: [], pickedUp: [], events };
        return encodeLog(log);
    }

    test("exactly the cap decodes", () => {
        const decoded = decodeLog(ticked(MAX_LOG_EVENTS));
        expect(decoded).not.toBeNull();
        expect(decoded?.events).toHaveLength(MAX_LOG_EVENTS);
    });

    test("one past the cap is refused", () => {
        expect(decodeLog(ticked(MAX_LOG_EVENTS + 1))).toBeNull();
    });
});

describe("tampered logs give a different result or null", () => {
    const base = (): RunLog => {
        const run = new RecordingRun({ seed: 21, gear: gearFor(21), mode: MODES.descent, feats: [], pickedUp: [] });
        botPlay(run, 200);
        return run.getLog();
    };

    test("an extra move", () => {
        const log = base();
        const { result: clean } = roundTrip(log);
        const tampered = structuredClone(log);
        tampered.events.splice(1, 0, { kind: "move", dx: 1, dy: 0 });
        const result = replay(decodeLog(encodeLog(tampered)));
        expect(result === null || JSON.stringify(result) !== JSON.stringify(clean)).toBe(true);
    });

    test("one tick changed", () => {
        const log = base();
        const { result: clean } = roundTrip(log);
        const tampered = structuredClone(log);
        const index = tampered.events.findIndex((event) => event.kind === "tick");
        expect(index).toBeGreaterThanOrEqual(0);
        (tampered.events[index] as { kind: "tick"; ms: number }).ms += 1;
        const result = replay(decodeLog(encodeLog(tampered)));
        expect(result === null || JSON.stringify(result) !== JSON.stringify(clean)).toBe(true);
    });

    test("a different seed", () => {
        const log = base();
        const { result: clean } = roundTrip(log);
        const tampered = structuredClone(log);
        tampered.seed = tampered.seed + 1;
        const result = replay(decodeLog(encodeLog(tampered)));
        expect(result === null || JSON.stringify(result) !== JSON.stringify(clean)).toBe(true);
    });
});

describe("replay refuses what a live shell never writes", () => {
    const logWith = (events: RunLogEvent[], mode: ModeId = "descent"): RunLog => ({
        v: 1, seed: 4, mode, gear: noGear(), feats: [], pickedUp: [], events,
    });

    test("a tool the run does not hold", () => {
        expect(replay(logWith([{ kind: "tick", ms: 100 }, { kind: "tool", id: "anchor" }]))).toBeNull();
    });

    test("a Cut without a direction, or with a direction on another tool", () => {
        expect(replay(logWith([{ kind: "tool", id: "cut" }]))).toBeNull();
        expect(replay(logWith([{ kind: "tool", id: "anchor", dir: "u" }]))).toBeNull();
    });

    test("an unknown tool id", () => {
        const log = logWith([{ kind: "tool", id: "laser" as never }]);
        expect(replay(log)).toBeNull();
    });

    test("a next level outside clear", () => {
        expect(replay(logWith([{ kind: "next" }]))).toBeNull();
    });

    test("an abandon of a run that already left ready", () => {
        expect(replay(logWith([{ kind: "abandon" }, { kind: "abandon" }]))).toBeNull();
    });

    test("a non-cardinal move", () => {
        expect(replay(logWith([{ kind: "move", dx: 2, dy: 0 }]))).toBeNull();
        expect(replay(logWith([{ kind: "move", dx: 1, dy: 1 }]))).toBeNull();
    });

    test("a broken header", () => {
        const log = logWith([]);
        expect(replay({ ...log, mode: "nope" as ModeId })).toBeNull();
        expect(replay({ ...log, seed: -1 })).toBeNull();
        expect(replay({ ...log, v: 2 as never })).toBeNull();
        expect(replay(null)).toBeNull();
        expect(replay(undefined)).toBeNull();
    });

    test("a plain tick-less replay still reports the started run", () => {
        const result = replay(logWith([], "sprint"));
        expect(result).not.toBeNull();
        expect(result?.tally.mode).toBe("sprint");
        expect(result?.ended).toBe(false);
        expect(result?.depth).toBe(1);
    });
});
