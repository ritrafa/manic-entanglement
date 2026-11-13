// The verify route (E70), through its handler function with fake times: a
// real recorded bot run earns a signed proof; a sped-up log, a changed seed,
// a wrong start state and a too-fast move rate each come back with their own
// reason code. The clock is the only thing faked - the logs are real.

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { POST } from "./route";
import { issueToken, readProof, type TokenPayload } from "@/lib/server/runToken";
import { RecordingRun, encodeLog, type RunLog, type RunLogEvent } from "@/game/runlog";
import { replay } from "@/game/replay";
import { nextStep } from "@/game/bot";
import { MODES, type ModeId } from "@/game/modes";
import { noGear, type GearLevels } from "@/game/gear";

const SECRET = "verify-route-test-secret";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

/** Milliseconds the test bot ticks before each move: above the Stepper's
 *  minimum step interval, as a real hold is - a 16 ms bot would be a cheat. */
const STEP_TICK_MS = 120;

let savedSecret: string | undefined;

beforeEach(() => {
    savedSecret = process.env.RUN_TOKEN_SECRET;
    process.env.RUN_TOKEN_SECRET = SECRET;
});

afterEach(() => {
    if (savedSecret === undefined) delete process.env.RUN_TOKEN_SECRET;
    else process.env.RUN_TOKEN_SECRET = savedSecret;
});

/** Play a recording run with the bot at stepper pace; the run always ends
 *  (a still-playing one is abandoned, as the shell's Quit does). */
function botRun(seed: number, mode: ModeId, gear: GearLevels, maxSteps: number): RecordingRun {
    const run = new RecordingRun({ seed, gear, mode: MODES[mode], feats: [], pickedUp: [] });
    run.start();
    for (let i = 0; i < maxSteps && run.phase !== "dead" && run.phase !== "done"; i++) {
        if (run.phase === "clear") {
            run.nextLevel();
            continue;
        }
        const step = nextStep(run);
        if (step === null) break;
        run.tick(STEP_TICK_MS);
        if (run.phase !== "playing") continue;
        run.move(step.dx, step.dy);
    }
    if (run.phase === "playing" || run.phase === "clear") run.abandon();
    return run;
}

function post(body: unknown): Promise<Response> {
    return POST(new Request("http://localhost/api/run/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    }));
}

/** A token for a log the shell would have written `ageMs` ago. */
function tokenFor(log: RunLog, ageMs = 60_000): string {
    const payload: TokenPayload = {
        seed: log.seed,
        mode: log.mode,
        wallet: WALLET,
        start: { gear: { ...log.gear }, feats: [...log.feats], pickedUp: log.pickedUp.map((e) => ({ ...e })) },
        issuedAt: Date.now() - ageMs,
    };
    return issueToken(payload);
}

describe("a real bot run verifies", () => {
    test("a finished Descent comes back with a signed proof", async () => {
        const run = botRun(7, "descent", { boots: 2, gloves: 1, shield: 0, speed: 0, backpack: 1 }, 400);
        const log = run.getLog();
        const response = await post({ token: tokenFor(log), log: encodeLog(log) });
        expect(response.status).toBe(200);
        const body = await response.json() as { proof: string };
        expect(typeof body.proof).toBe("string");
        const proof = readProof(body.proof);
        expect(proof).not.toBeNull();
        const expected = replay(log);
        expect(expected).not.toBeNull();
        expect(proof!.wallet).toBe(WALLET);
        expect(proof!.mode).toBe(expected!.mode);
        expect(proof!.score).toBe(expected!.score);
        expect(proof!.tally.moves).toBe(expected!.tally.moves);
        expect(proof!.pickedUp).toEqual(expected!.pickedUp.map((e) => ({ layer: e.layer, trait: e.trait })));
        expect(proof!.gear).toEqual(expected!.gear);
    });

    test("a Sprint that finished all five levels verifies too", async () => {
        const run = botRun(3, "sprint", noGear(), 2000);
        const log = run.getLog();
        const response = await post({ token: tokenFor(log), log: encodeLog(log) });
        expect(response.status).toBe(200);
    });
});

describe("refusals carry their reason code", () => {
    const baseLog = (): RunLog => botRun(11, "descent", noGear(), 300).getLog();

    async function refuse(body: unknown): Promise<string> {
        const response = await post(body);
        expect(response.status).toBe(400);
        return ((await response.json()) as { error: string }).error;
    }

    test("a token that is not one: bad_token", async () => {
        const log = baseLog();
        expect(await refuse({ token: "not.a.token", log: encodeLog(log) })).toBe("bad_token");
        expect(await refuse({ token: 42, log: encodeLog(log) })).toBe("bad_token");
        expect(await refuse({ log: encodeLog(log) })).toBe("bad_token");
    });

    test("a token older than a day: expired", async () => {
        const log = baseLog();
        expect(await refuse({ token: tokenFor(log, 25 * 60 * 60 * 1000), log: encodeLog(log) })).toBe("expired");
    });

    test("a log that does not decode, or does not replay: bad_log", async () => {
        const log = baseLog();
        expect(await refuse({ token: tokenFor(log), log: "nonsense" })).toBe("bad_log");
        expect(await refuse({ token: tokenFor(log) })).toBe("bad_log");
        // A log whose events no live shell could have written: a move the
        // replay refuses (a diagonal step), paced so the rate checks pass
        // and the replay is the one that says no.
        const forged: RunLog = {
            ...log,
            events: [{ kind: "tick", ms: 6000 }, { kind: "move", dx: 1, dy: 1 }],
        };
        expect(await refuse({ token: tokenFor(forged), log: encodeLog(forged) })).toBe("bad_log");
    });

    test("a run that never ended: bad_log", async () => {
        const run = new RecordingRun({ seed: 5, gear: noGear(), mode: MODES.descent, feats: [], pickedUp: [] });
        run.start();
        for (let i = 0; i < 20; i++) {
            const step = nextStep(run);
            if (step === null) break;
            run.tick(STEP_TICK_MS);
            if (run.phase !== "playing") break;
            run.move(step.dx, step.dy);
        }
        // Still live (playing or waiting on the clear panel): its log must
        // be refused - neither is a run that ended.
        expect(["playing", "clear"]).toContain(run.phase);
        const log = run.getLog();
        expect(await refuse({ token: tokenFor(log), log: encodeLog(log) })).toBe("bad_log");
    });

    test("a changed seed or mode, or a wrong start state: mismatch", async () => {
        const log = baseLog();
        // The seed the token issued is not the seed the log carries.
        const otherToken = issueToken({
            seed: log.seed + 1, mode: log.mode, wallet: WALLET,
            start: { gear: { ...log.gear }, feats: [], pickedUp: [] },
            issuedAt: Date.now() - 60_000,
        });
        expect(await refuse({ token: otherToken, log: encodeLog(log) })).toBe("mismatch");

        const wrongMode = issueToken({
            seed: log.seed, mode: "zen", wallet: WALLET,
            start: { gear: { ...log.gear }, feats: [], pickedUp: [] },
            issuedAt: Date.now() - 60_000,
        });
        expect(await refuse({ token: wrongMode, log: encodeLog(log) })).toBe("mismatch");

        // The token promised a run that starts with boots 3; the log plays without.
        const wrongGear = issueToken({
            seed: log.seed, mode: log.mode, wallet: WALLET,
            start: { gear: { boots: 3, gloves: 0, shield: 0, speed: 0, backpack: 0 }, feats: [], pickedUp: [] },
            issuedAt: Date.now() - 60_000,
        });
        expect(await refuse({ token: wrongGear, log: encodeLog(log) })).toBe("mismatch");

        // The token promised feats the log does not carry.
        const wrongFeats = issueToken({
            seed: log.seed, mode: log.mode, wallet: WALLET,
            start: { gear: { ...log.gear }, feats: ["first-blood"], pickedUp: [] },
            issuedAt: Date.now() - 60_000,
        });
        expect(await refuse({ token: wrongFeats, log: encodeLog(log) })).toBe("mismatch");
    });

    test("a sped-up log, tick sum past the wall clock: too_fast", async () => {
        const log = baseLog(); // ~300 moves at 120 ms: well over 5 s of ticks
        // Issued this very instant: the wall clock has not spent what the log claims.
        expect(await refuse({ token: tokenFor(log, 0), log: encodeLog(log) })).toBe("too_fast");
    });

    test("a move rate past the stepper's minimum interval: too_fast", async () => {
        const log = baseLog();
        // Ten moves behind one short tick: no hand on a keyboard moved that fast.
        const ticks = log.events.filter((event) => event.kind === "tick").slice(0, 1);
        const moves: RunLogEvent[] = Array.from({ length: 10 }, () => ({ kind: "move", dx: 0, dy: 1 }));
        const events: RunLogEvent[] = [...ticks, ...moves];
        const forged: RunLog = { ...log, events };
        expect(await refuse({ token: tokenFor(forged), log: encodeLog(forged) })).toBe("too_fast");
    });

    test("a body over 512 kB is refused unread", async () => {
        const log = baseLog();
        const huge = JSON.stringify({ token: tokenFor(log), log: encodeLog(log) }) + " ".repeat(600 * 1024);
        expect(await refuse(huge)).toBe("bad_log");
    });
});
