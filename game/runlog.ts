// The run log: a compact record of every call the shell makes into a Run, so a
// later verifier can replay it and reach exactly the same result. A log is one
// header (the options the run was built with) plus the ordered list of shell
// calls: ticks, moves, tool uses, level changes and the abandon. Consecutive
// ticks with the same value collapse into one run-length entry when encoding,
// and RecordingRun merges ticks that arrive with nothing between them, which
// is exact because a tick only ever adds its milliseconds and drains from the
// standing pending time. Pure: no DOM, no clocks, no global randomness.

import { Run, type RunOptions } from "./run";
import { MODES, type ModeId } from "./modes";
import { noGear, sanitizeGear, type GearLevels } from "./gear";
import { TOOL_IDS, type ToolId } from "./tools";
import { DIR_DELTAS, type Dir } from "./maze";
import type { HeldTrait } from "./wardrobe";

/** The only log version decodeLog accepts. */
export const RUNLOG_VERSION = 1;

/** A decoded log never expands to more than this many events; bigger is refused. */
export const MAX_LOG_EVENTS = 200000;

/** Longest text decodeLog even looks at; a longer one is refused unread. */
const MAX_LOG_TEXT_CHARS = 4_000_000;

/** One recorded shell call, in the order the shell made it. */
export type RunLogEvent =
    | { kind: "tick"; ms: number }
    | { kind: "move"; dx: number; dy: number }
    | { kind: "tool"; id: ToolId; dir?: Dir }
    | { kind: "next" }
    | { kind: "abandon" };

/** Everything a verifier needs to rebuild the run: the options and the calls. */
export interface RunLog {
    v: 1;
    seed: number;
    mode: ModeId;
    gear: GearLevels;
    feats: string[];
    pickedUp: HeldTrait[];
    events: RunLogEvent[];
}

/** The one character that tells a cardinal move apart in the event string. */
const MOVE_CHARS: Record<string, string> = {
    "0,-1": "u",
    "1,0": "r",
    "0,1": "d",
    "-1,0": "l",
};

const MOVE_DIRS: Record<string, { dx: number; dy: number }> = {
    u: { dx: 0, dy: -1 },
    r: { dx: 1, dy: 0 },
    d: { dx: 0, dy: 1 },
    l: { dx: -1, dy: 0 },
};

const TOOL_CHARS: Record<ToolId, string> = { anchor: "a", twist: "t", cut: "c" };
const TOOL_IDS_BY_CHAR: Record<string, ToolId> = { a: "anchor", t: "twist", c: "cut" };

/** One event as its token in the event string. */
function eventToken(event: RunLogEvent): string | null {
    switch (event.kind) {
        case "tick":
            return Number.isInteger(event.ms) && event.ms > 0 ? `t${event.ms}` : null;
        case "move": {
            const char = MOVE_CHARS[`${event.dx},${event.dy}`];
            if (char !== undefined) return `m${char}`;
            // Only the shell's cardinal steps are ever replayed; anything else
            // still round-trips, and the replay refuses it as the live game would.
            if (Number.isInteger(event.dx) && Number.isInteger(event.dy)
                && Math.abs(event.dx) <= 1 && Math.abs(event.dy) <= 1) {
                return `M${event.dx},${event.dy}`;
            }
            return null;
        }
        case "tool": {
            if (!TOOL_IDS.includes(event.id)) return null;
            if (event.dir === undefined) return `u${TOOL_CHARS[event.id]}`;
            if (event.id !== "cut" || !(event.dir in DIR_DELTAS)) return null;
            return `uc${event.dir}`;
        }
        case "next":
            return "n";
        case "abandon":
            return "a";
        default:
            return null;
    }
}

/**
 * The log as compact text: a small JSON header whose "e" field carries the
 * events as dot-separated tokens. Consecutive ticks with the same value
 * collapse into one run-length entry ("t16x5" is five ticks of 16 ms).
 */
export function encodeLog(log: RunLog): string {
    const tokens: string[] = [];
    let runMs: number | null = null;
    let runCount = 0;
    const flushRun = () => {
        if (runMs !== null) {
            tokens.push(runCount > 1 ? `t${runMs}x${runCount}` : `t${runMs}`);
            runMs = null;
            runCount = 0;
        }
    };
    for (const event of log.events) {
        if (event.kind === "tick") {
            if (runMs === event.ms) {
                runCount += 1;
                continue;
            }
            flushRun();
            runMs = event.ms;
            runCount = 1;
            continue;
        }
        flushRun();
        const token = eventToken(event);
        if (token === null) continue;
        tokens.push(token);
    }
    flushRun();
    return JSON.stringify({
        v: RUNLOG_VERSION,
        s: log.seed,
        m: log.mode,
        g: log.gear,
        f: log.feats,
        p: log.pickedUp,
        e: tokens.join("."),
    });
}

/** True for a whole number in 0..2^53-1, the integers JSON text carries safely. */
function isSafeUint(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** The traits list from decoded JSON: an array of {layer, trait} strings. */
function decodeTraits(value: unknown): HeldTrait[] | null {
    if (!Array.isArray(value) || value.length > 1000) return null;
    const traits: HeldTrait[] = [];
    for (const entry of value) {
        if (typeof entry !== "object" || entry === null) return null;
        const { layer, trait } = entry as Record<string, unknown>;
        if (typeof layer !== "string" || typeof trait !== "string") return null;
        traits.push({ layer, trait });
    }
    return traits;
}

/** The feats list from decoded JSON: an array of strings. */
function decodeFeats(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.length > 1000) return null;
    for (const entry of value) if (typeof entry !== "string") return null;
    return value as string[];
}

/** A parsed tick token carries its run-length count; the other tokens do not. */
type ParsedToken = RunLogEvent | { kind: "tick"; ms: number; count: number };

/** One event token back into an event, or null when it makes no sense. */
function parseToken(token: string): ParsedToken | null {
    const head = token[0];
    if (head === "t") {
        const match = /^t(\d+)(?:x(\d+))?$/.exec(token);
        if (match === null) return null;
        const ms = Number(match[1]);
        const count = match[2] === undefined ? 1 : Number(match[2]);
        if (!Number.isInteger(ms) || ms <= 0) return null;
        if (!Number.isInteger(count) || count <= 0) return null;
        return { kind: "tick", ms, count };
    }
    if (head === "m") {
        const step = MOVE_DIRS[token.slice(1)];
        return step === undefined ? null : { kind: "move", dx: step.dx, dy: step.dy };
    }
    if (head === "M") {
        const match = /^M(-?\d+),(-?\d+)$/.exec(token);
        if (match === null) return null;
        const dx = Number(match[1]);
        const dy = Number(match[2]);
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return null;
        return { kind: "move", dx, dy };
    }
    if (head === "u") {
        const id = TOOL_IDS_BY_CHAR[token[1]];
        if (id === undefined) return null;
        // A Cut without a direction is refused by the run, so no live log holds one.
        if (token.length === 2) return id === "cut" ? null : { kind: "tool", id };
        const dir = token[2];
        if (id !== "cut" || token.length !== 3 || !(dir in DIR_DELTAS)) return null;
        return { kind: "tool", id: "cut", dir: dir as Dir };
    }
    if (token === "n") return { kind: "next" };
    if (token === "a") return { kind: "abandon" };
    return null;
}

/**
 * Text back into a log: null for anything malformed, never a throw. A log
 * whose events expand past MAX_LOG_EVENTS is refused, and so is any text
 * longer than a sane log could be.
 */
export function decodeLog(text: string): RunLog | null {
    try {
        if (typeof text !== "string" || text.length === 0 || text.length > MAX_LOG_TEXT_CHARS) {
            return null;
        }
        const raw: unknown = JSON.parse(text);
        if (typeof raw !== "object" || raw === null) return null;
        const header = raw as Record<string, unknown>;
        if (header.v !== RUNLOG_VERSION) return null;
        if (!isSafeUint(header.s)) return null;
        const mode = header.m;
        if (typeof mode !== "string" || MODES[mode as ModeId] === undefined) return null;
        if (typeof header.g !== "object" || header.g === null) return null;
        if (typeof header.e !== "string") return null;
        const feats = decodeFeats(header.f);
        if (feats === null) return null;
        const pickedUp = decodeTraits(header.p);
        if (pickedUp === null) return null;

        const events: RunLogEvent[] = [];
        const tokens = header.e === "" ? [] : header.e.split(".");
        if (tokens.length > MAX_LOG_EVENTS) return null;
        let total = 0;
        for (const token of tokens) {
            const parsed = parseToken(token);
            if (parsed === null) return null;
            if ("count" in parsed) {
                total += parsed.count;
                if (total > MAX_LOG_EVENTS) return null;
                for (let i = 0; i < parsed.count; i++) events.push({ kind: "tick", ms: parsed.ms });
            } else {
                total += 1;
                if (total > MAX_LOG_EVENTS) return null;
                events.push(parsed);
            }
        }
        return {
            v: RUNLOG_VERSION,
            seed: header.s,
            mode: mode as ModeId,
            gear: sanitizeGear(header.g),
            feats,
            pickedUp,
            events,
        };
    } catch {
        return null;
    }
}

/**
 * A Run that writes down every call the shell makes into it, so the finished
 * log can be encoded, sent, decoded and replayed to the identical result.
 * Same surface as Run: the shell hands it the same options and calls the same
 * methods. Ticks arrive as whole milliseconds — the fraction rides into the
 * next call — and ticks that arrive with nothing between them are merged into
 * one event, which a replay answers exactly.
 */
export class RecordingRun extends Run {
    /** The seed the run was built with. */
    readonly seed: number;
    /** The mode the run was built with. */
    readonly modeId: ModeId;
    /** The gear levels the run was built with. */
    readonly gear: GearLevels;
    /** The feats the run was built with. */
    readonly feats: string[];
    /** The traits the save held when the run was built. */
    readonly pickedUp: HeldTrait[];
    /** True once a start() took effect: before that there is no run to replay. */
    started = false;

    private recorded: RunLogEvent[] = [];
    /** Milliseconds applied to the run but not yet written as one merged tick event. */
    private pendingTickMs = 0;
    /** The fractional milliseconds riding from one call into the next. */
    private tickCarry = 0;

    constructor(options: RunOptions) {
        super(options);
        this.seed = options.seed;
        this.modeId = options.mode === undefined ? MODES.descent.id : options.mode.id;
        this.gear = { ...noGear(), ...(options.gear ?? noGear()) };
        this.feats = Array.isArray(options.feats) ? [...options.feats] : [];
        this.pickedUp = Array.isArray(options.pickedUp)
            ? options.pickedUp.map((entry) => ({ layer: entry.layer, trait: entry.trait }))
            : [];
    }

    /** The log of the run as it stands: the header and every call since the last start. */
    getLog(): RunLog {
        this.flushPendingTick();
        return {
            v: RUNLOG_VERSION,
            seed: this.seed,
            mode: this.modeId,
            gear: { ...this.gear },
            feats: [...this.feats],
            pickedUp: this.pickedUp.map((entry) => ({ layer: entry.layer, trait: entry.trait })),
            events: this.recorded.map((event) => ({ ...event })),
        };
    }

    override start(): void {
        const before = this.phase;
        super.start();
        if (this.phase === "playing" && before !== "playing") {
            // A fresh run: the log is this run's story alone.
            this.started = true;
            this.recorded = [];
            this.pendingTickMs = 0;
            this.tickCarry = 0;
        }
    }

    override tick(ms: number): void {
        if (this.phase !== "playing" || !(ms > 0) || !Number.isFinite(ms)) {
            super.tick(ms);
            return;
        }
        // Whole milliseconds only: the fraction rides into the next call.
        this.tickCarry += ms;
        const whole = Math.floor(this.tickCarry);
        if (whole <= 0) {
            return;
        }
        this.tickCarry -= whole;
        super.tick(whole);
        // Consecutive ticks with nothing between them merge into one event:
        // a replay's single tick of the total drains the very same way.
        this.pendingTickMs += whole;
    }

    override move(dx: number, dy: number): boolean {
        if (this.phase !== "playing") return super.move(dx, dy);
        this.flushPendingTick();
        this.recorded.push({ kind: "move", dx, dy });
        return super.move(dx, dy);
    }

    override useTool(id: ToolId, dir?: Dir): boolean {
        const used = super.useTool(id, dir);
        if (used) {
            this.flushPendingTick();
            this.recorded.push(dir === undefined ? { kind: "tool", id } : { kind: "tool", id, dir });
        }
        return used;
    }

    override nextLevel(): void {
        const before = this.phase;
        super.nextLevel();
        if (this.phase !== before) {
            this.flushPendingTick();
            this.recorded.push({ kind: "next" });
        }
    }

    override abandon(): void {
        const before = this.phase;
        super.abandon();
        if (before !== "ready") {
            this.flushPendingTick();
            this.recorded.push({ kind: "abandon" });
        }
    }

    /** Write the merged tick collected so far as one event, before anything else goes down. */
    private flushPendingTick(): void {
        if (this.pendingTickMs > 0) {
            this.recorded.push({ kind: "tick", ms: this.pendingTickMs });
            this.pendingTickMs = 0;
        }
    }
}
