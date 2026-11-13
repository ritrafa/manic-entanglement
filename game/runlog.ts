// The run log: a record of every call the shell makes on a Run, plus the
// encode/decode pair that turns it into one compact text and back. A Run
// records itself through RecordingRun, the same class the shell uses, so the
// live game and a later replay share one code path. Pure: no DOM, no clocks,
// no global randomness.

import { Run, type RunOptions } from "./run";
import { MODES, type ModeId } from "./modes";
import { DIR_DELTAS, type Dir } from "./maze";
import type { ToolId } from "./tools";
import { GEAR_IDS, sanitizeGear, type GearLevels } from "./gear";
import type { HeldTrait } from "./wardrobe";
import { LAYER_ORDER, type Layer } from "./sprite";

/** The only log version this module reads and writes. */
export const RUN_LOG_VERSION = 1;

/** decodeLog refuses any log longer than this many events. */
export const RUN_LOG_MAX_EVENTS = 200000;

/**
 * One recorded call, in the order the shell made it: start the run, advance
 * the clock by whole milliseconds, step, spend a tool charge, take the next
 * level or walk away. Only calls the run accepted are ever recorded, so
 * replaying the list touches a fresh Run exactly as the live one was touched.
 */
export type RunLogEvent =
    | { t: "s" }
    | { t: "t"; ms: number }
    | { t: "m"; dx: number; dy: number }
    | { t: "o"; id: ToolId; dir?: Dir }
    | { t: "n" }
    | { t: "x" };

/** Everything a replay needs: the options the Run was built with and its calls. */
export interface RunLog {
    v: 1;
    seed: number;
    mode: ModeId;
    gear: GearLevels;
    feats: string[];
    pickedUp: HeldTrait[];
    events: RunLogEvent[];
}

/**
 * A Run that writes down every call it takes: the same surface as Run, so the
 * shell can use it everywhere it uses Run today. Each call is forwarded to the
 * real Run untouched; the log only ever gains an event for a call the run
 * actually took (a move blocked by a wall still counts — the run noticed it).
 * Ticks are whole milliseconds: a fractional remainder rides into the next
 * call, so the log stores integers and timing stays the same within 1 ms.
 */
export class RecordingRun extends Run {
    private readonly logSeed: number;
    private readonly logMode: ModeId;
    private readonly logGear: GearLevels;
    private readonly logFeats: string[];
    private readonly logPickedUp: HeldTrait[];
    /** The calls made so far, oldest first. */
    private recorded: RunLogEvent[] = [];
    /** The sub-millisecond remainder the next tick picks up. */
    private tickRemainder = 0;

    constructor(options: RunOptions) {
        super(options);
        this.logSeed = options.seed;
        this.logMode = (options.mode ?? MODES.descent).id;
        this.logGear = sanitizeGear(options.gear);
        this.logFeats = Array.isArray(options.feats) ? [...options.feats] : [];
        this.logPickedUp = Array.isArray(options.pickedUp)
            ? options.pickedUp.map((entry) => ({ ...entry }))
            : [];
    }

    /** The log of everything this run was asked to do, ready to encode. */
    getLog(): RunLog {
        return {
            v: 1,
            seed: this.logSeed,
            mode: this.logMode,
            gear: { ...this.logGear },
            feats: [...this.logFeats],
            pickedUp: this.logPickedUp.map((entry) => ({ ...entry })),
            events: this.recorded.map((event) => ({ ...event })),
        };
    }

    override start(): void {
        if (this.phase === "ready" || this.phase === "dead" || this.phase === "done") {
            this.recorded.push({ t: "s" });
            this.tickRemainder = 0;
        }
        super.start();
    }

    override tick(ms: number): void {
        const value = Number.isFinite(ms) && ms > 0 ? ms : 0;
        this.tickRemainder += value;
        const whole = Math.floor(this.tickRemainder);
        if (whole <= 0) return;
        this.tickRemainder -= whole;
        this.recorded.push({ t: "t", ms: whole });
        super.tick(whole);
    }

    override move(dx: number, dy: number): boolean {
        // Only steps the run could take are recorded: a step outside the
        // playing phase is a no-op the replay never needs to see. A step into
        // a wall is kept — the run counted it as a bump.
        if (this.phase === "playing") this.recorded.push({ t: "m", dx, dy });
        return super.move(dx, dy);
    }

    override useTool(id: ToolId, dir?: Dir): boolean {
        const used = super.useTool(id, dir);
        // A refused use changed nothing; keeping it out of the log lets
        // replay reject a tool call no live run could ever have made.
        if (used) this.recorded.push(dir === undefined ? { t: "o", id } : { t: "o", id, dir });
        return used;
    }

    override nextLevel(): void {
        if (this.phase === "clear") this.recorded.push({ t: "n" });
        super.nextLevel();
    }

    override abandon(): void {
        if (this.phase !== "ready") {
            this.recorded.push({ t: "x" });
            this.tickRemainder = 0;
        }
        super.abandon();
    }
}

/** The single letter for a unit cardinal step, or null when it is not one. */
function moveChar(dx: number, dy: number): string | null {
    if (dx === 0 && dy === -1) return "u";
    if (dx === 1 && dy === 0) return "r";
    if (dx === 0 && dy === 1) return "d";
    if (dx === -1 && dy === 0) return "l";
    return null;
}

/** One event as text; consecutive equal ticks are collapsed by the caller. */
function encodeEvent(event: RunLogEvent): string {
    switch (event.t) {
        case "s":
            return "s";
        case "t":
            return `t${event.ms}`;
        case "m": {
            const single = moveChar(event.dx, event.dy);
            return single !== null ? single : `m${event.dx},${event.dy}`;
        }
        case "o":
            if (event.id === "anchor") return "a";
            if (event.id === "twist") return "w";
            return event.dir !== undefined && event.dir in DIR_DELTAS ? `c${event.dir}` : "c?";
        case "n":
            return "n";
        case "x":
            return "x";
        default:
            return "";
    }
}

/** The event stream: one token per call, runs of equal ticks as `t<ms>*<n>`. */
function encodeEvents(events: RunLogEvent[]): string {
    const parts: string[] = [];
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        if (event.t === "t") {
            // A run of consecutive ticks with the same value becomes one
            // run-length entry: a 15-minute idle clock costs a dozen bytes.
            let count = 1;
            while (i + count < events.length) {
                const next = events[i + count];
                if (next.t !== "t" || next.ms !== event.ms) break;
                count += 1;
            }
            parts.push(count > 1 ? `t${event.ms}*${count}` : `t${event.ms}`);
            i += count - 1;
        } else {
            parts.push(encodeEvent(event));
        }
    }
    return parts.join("");
}

/**
 * The whole log as one compact text: seven `|`-separated fields, the last of
 * them the self-delimiting event stream. Feed it to decodeLog to get the log
 * back; a replay verifies a run against it without touching the DOM.
 */
export function encodeLog(log: RunLog): string {
    const gear = GEAR_IDS.map((id) => String(log.gear[id])).join(".");
    const feats = log.feats.join(",");
    const pickedUp = log.pickedUp.map((entry) => `${entry.layer}:${entry.trait}`).join(",");
    return `1|${log.seed}|${log.mode}|${gear}|${feats}|${pickedUp}|${encodeEvents(log.events)}`;
}

const UNSIGNED = /^\d+$/;
const SIGNED_NUMBER = /^-?\d+(\.\d+)?$/;
const FEAT_ID = /^[a-z0-9-]+$/;
const PICKED_UP = /^([A-Za-z]+):([A-Za-z]+)$/;
const DIR_LETTERS: readonly string[] = ["u", "r", "d", "l"];

/** The five gear levels from "<b>.<g>.<s>.<sp>.<bk>", or null when malformed. */
function decodeGear(text: string): GearLevels | null {
    const fields = text.split(".");
    if (fields.length !== GEAR_IDS.length) return null;
    const levels = {} as GearLevels;
    for (let i = 0; i < GEAR_IDS.length; i++) {
        if (!UNSIGNED.test(fields[i])) return null;
        levels[GEAR_IDS[i]] = Number(fields[i]);
    }
    return sanitizeGear(levels);
}

/** The pickedUp list from "Layer:Trait,Layer:Trait", or null when malformed. */
function decodePickedUp(text: string): HeldTrait[] | null {
    if (text === "") return [];
    const entries: HeldTrait[] = [];
    for (const field of text.split(",")) {
        const match = PICKED_UP.exec(field);
        if (match === null) return null;
        const layer = match[1] as Layer;
        if (!(LAYER_ORDER as readonly string[]).includes(layer)) return null;
        entries.push({ layer, trait: match[2] });
    }
    return entries;
}

/** Read an unsigned integer run at `at`; null when there is none. */
function readRunOfDigits(text: string, at: number): { value: number; next: number } | null {
    let end = at;
    while (end < text.length && text[end] >= "0" && text[end] <= "9") end += 1;
    if (end === at) return null;
    const value = Number(text.slice(at, end));
    return Number.isSafeInteger(value) ? { value, next: end } : null;
}

/** The event stream back from its tokens; null on anything malformed. */
function decodeEvents(text: string): RunLogEvent[] | null {
    const events: RunLogEvent[] = [];
    const push = (event: RunLogEvent, count: number): boolean => {
        if (events.length + count > RUN_LOG_MAX_EVENTS) return false;
        for (let i = 0; i < count; i++) events.push(event);
        return true;
    };
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === "s") {
            if (!push({ t: "s" }, 1)) return null;
            i += 1;
        } else if (ch === "n") {
            if (!push({ t: "n" }, 1)) return null;
            i += 1;
        } else if (ch === "x") {
            if (!push({ t: "x" }, 1)) return null;
            i += 1;
        } else if (ch === "a") {
            if (!push({ t: "o", id: "anchor" }, 1)) return null;
            i += 1;
        } else if (ch === "w") {
            if (!push({ t: "o", id: "twist" }, 1)) return null;
            i += 1;
        } else if (ch === "c") {
            const dir = text[i + 1];
            if (!DIR_LETTERS.includes(dir)) return null;
            if (!push({ t: "o", id: "cut", dir: dir as Dir }, 1)) return null;
            i += 2;
        } else if (DIR_LETTERS.includes(ch)) {
            const delta = ch === "u" ? [0, -1] : ch === "r" ? [1, 0] : ch === "d" ? [0, 1] : [-1, 0];
            if (!push({ t: "m", dx: delta[0], dy: delta[1] }, 1)) return null;
            i += 1;
        } else if (ch === "t") {
            const ms = readRunOfDigits(text, i + 1);
            if (ms === null || ms.value < 1) return null;
            let count = 1;
            let next = ms.next;
            if (text[next] === "*") {
                const run = readRunOfDigits(text, next + 1);
                if (run === null || run.value < 2) return null;
                count = run.value;
                next = run.next;
            }
            if (!push({ t: "t", ms: ms.value }, count)) return null;
            i = next;
        } else if (ch === "m") {
            const comma = text.indexOf(",", i + 1);
            const end = comma === -1 ? text.length : comma;
            const dxText = text.slice(i + 1, end);
            if (!SIGNED_NUMBER.test(dxText)) return null;
            const next = comma === -1 ? text.length : comma + 1;
            let dyEnd = next;
            while (dyEnd < text.length && /[0-9.\-]/.test(text[dyEnd])) dyEnd += 1;
            const dyText = text.slice(next, dyEnd);
            if (!SIGNED_NUMBER.test(dyText)) return null;
            if (!push({ t: "m", dx: Number(dxText), dy: Number(dyText) }, 1)) return null;
            i = dyEnd;
        } else {
            return null;
        }
    }
    return events;
}

/**
 * The text from encodeLog back as a RunLog: null for anything malformed —
 * wrong field count, an unknown mode, a bad number, a stray letter in the
 * event stream or more than RUN_LOG_MAX_EVENTS events. It never throws.
 */
export function decodeLog(text: string): RunLog | null {
    if (typeof text !== "string") return null;
    const fields = text.split("|");
    if (fields.length !== 7) return null;
    const [version, seedText, modeText, gearText, featsText, pickedText, eventsText] = fields;
    if (version !== "1") return null;
    if (!/^-?\d+$/.test(seedText)) return null;
    const seed = Number(seedText);
    if (!Number.isSafeInteger(seed)) return null;
    const mode = modeText as ModeId;
    if (MODES[mode] === undefined) return null;
    const gear = decodeGear(gearText);
    if (gear === null) return null;
    const feats: string[] = featsText === "" ? [] : featsText.split(",");
    if (feats.some((id) => !FEAT_ID.test(id))) return null;
    const pickedUp = decodePickedUp(pickedText);
    if (pickedUp === null) return null;
    const events = decodeEvents(eventsText);
    if (events === null) return null;
    return { v: 1, seed, mode, gear, feats, pickedUp, events };
}

