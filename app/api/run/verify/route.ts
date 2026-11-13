// POST /api/run/verify (NFT-PLAN N2, E70): the server replays a finished
// run's log against its token and, when every check passes, signs a proof.
// The checks: the same seed, mode and start state in the log header; the
// tick milliseconds inside the wall clock since the token was issued; a move
// rate the Stepper could have produced; and a replay that ends the run. Every
// refusal answers 400 with its reason code - bad_token, mismatch, too_fast,
// bad_log, expired. The proof is stateless: no storage, the NFT's Synced
// watermark (E69) stops reuse. Server-only: node:crypto through runToken.

import { CONFIG } from "@/game/config";
import { GEAR_IDS, sanitizeGear } from "@/game/gear";
import { decodeLog } from "@/game/runlog";
import { replay } from "@/game/replay";
import { readToken, signProof } from "@/lib/server/runToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Longest body the route even looks at (a 15-minute bot run encodes far under this). */
const MAX_BODY_BYTES = 512 * 1024;

/** A token this old is refused outright. */
const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The grace added to the wall clock before a log reads as sped up. */
const WALL_CLOCK_SLACK_MS = 5000;

/** The move rate's allowance: the Stepper never steps closer than CONFIG.stepMs,
 *  and the log may run 10% faster than that before it reads as too_fast. */
const MOVE_RATE_SLACK = 0.9;

/** The per-gap allowance (E72): the milliseconds between two consecutive moves
 *  (with no `next` between them) may not fall under this share of stepMs, less
 *  2 ms of frame jitter. The aggregate alone lets a burst of instant moves hide
 *  inside a long run; the Stepper makes a gap this small impossible. */
const MOVE_GAP_FACTOR = 0.8;
const MOVE_GAP_JITTER_MS = 2;

function reject(reason: "bad_token" | "mismatch" | "too_fast" | "bad_log" | "expired"): Response {
    return Response.json({ error: reason }, { status: 400 });
}

/** The body as a parsed object, or null: capped, JSON, an object. */
async function readBody(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    let bytes: ArrayBuffer;
    try {
        bytes = await request.arrayBuffer();
    } catch {
        return null;
    }
    if (bytes.byteLength > maxBytes) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
}

/** A canonical text for a pickup list, order-independent: a set of layer:trait. */
function pickupsKey(list: readonly { layer: string; trait: string }[]): string {
    return list.map((entry) => `${entry.layer}\u0000${entry.trait}`).sort().join("\u0001");
}

/** A canonical text for a feat list, order-independent. */
function featsKey(feats: readonly string[]): string {
    return [...feats].sort().join("\u0001");
}

/** True when two gear records hold the same levels per kind, caps applied. */
function sameGear(a: unknown, b: unknown): boolean {
    const left = sanitizeGear(a);
    const right = sanitizeGear(b);
    return GEAR_IDS.every((id) => left[id] === right[id]);
}

export async function POST(request: Request): Promise<Response> {
    const body = await readBody(request, MAX_BODY_BYTES);
    if (body === null) return reject("bad_log");

    const token = readToken(body.token);
    if (token === null) return reject("bad_token");

    const now = Date.now();
    if (now - token.issuedAt >= TOKEN_MAX_AGE_MS) return reject("expired");

    if (typeof body.log !== "string") return reject("bad_log");
    const log = decodeLog(body.log);
    if (log === null) return reject("bad_log");

    // The log must be the very run the token issued: its seed, its mode and
    // the start state the server handed out.
    if (log.seed !== token.seed) return reject("mismatch");
    if (log.mode !== token.mode) return reject("mismatch");
    if (!sameGear(log.gear, token.start.gear)) return reject("mismatch");
    if (featsKey(log.feats) !== featsKey(token.start.feats)) return reject("mismatch");
    if (pickupsKey(log.pickedUp) !== pickupsKey(token.start.pickedUp)) return reject("mismatch");

    // Wall clock: the run cannot have spent more milliseconds than the world
    // has spent since the token was issued (plus a grace for network and
    // frame jitter), and no move may come faster than the Stepper allows.
    let tickMs = 0;
    let moves = 0;
    for (const event of log.events) {
        if (event.kind === "tick") tickMs += event.ms;
        else if (event.kind === "move") moves += 1;
    }
    if (tickMs > now - token.issuedAt + WALL_CLOCK_SLACK_MS) return reject("too_fast");
    if (moves * CONFIG.stepMs * MOVE_RATE_SLACK > tickMs) return reject("too_fast");

    // The same rule per gap (E72): the Stepper never hands two steps closer
    // than CONFIG.stepMs, so the ticks between two consecutive moves must
    // account for about that much time - unless a `next` (the level change)
    // sits between them, which is not a step the player made. A burst of
    // instant moves inside an otherwise slow log fails here, not in the
    // aggregate above, which it can slip through.
    const minGapMs = CONFIG.stepMs * MOVE_GAP_FACTOR - MOVE_GAP_JITTER_MS;
    let gapMs = 0;
    let sinceMove = false;
    for (const event of log.events) {
        if (event.kind === "tick") {
            if (sinceMove) gapMs += event.ms;
        } else if (event.kind === "move") {
            if (sinceMove && gapMs < minGapMs) return reject("too_fast");
            gapMs = 0;
            sinceMove = true;
        } else if (event.kind === "next") {
            sinceMove = false;
            gapMs = 0;
        }
    }

    // The replay is the verdict: only a log a live shell could have written,
    // ending on a dead, finished or abandoned run, earns a proof.
    const result = replay(log);
    if (result === null || !result.ended) return reject("bad_log");

    const proof = signProof({
        wallet: token.wallet,
        issuedAt: token.issuedAt,
        mode: result.mode,
        // The replay's tally: a record of finite non-negative numbers
        // (and the mode text), checked again by readProof's shape rules.
        tally: result.tally as unknown as Record<string, unknown>,
        score: result.score,
        pickedUp: result.pickedUp.map((entry) => ({ layer: entry.layer, trait: entry.trait })),
        gear: result.gear,
    });
    return Response.json({ proof });
}
