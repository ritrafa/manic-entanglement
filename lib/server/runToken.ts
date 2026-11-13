// The server's signing pen for verified runs (NFT-PLAN N2, E70): HMAC-SHA256
// over node:crypto with RUN_TOKEN_SECRET. A token is `base64url(json).base64url(mac)`
// and so is a proof; the two carry different context strings, so a proof can
// never pass as a token or the other way round. Both readers check the MAC in
// constant time and then the payload's shape: anything that is not exactly a
// run the server could have issued reads as null. Server-side only - this file
// imports node:crypto and must never be pulled into a client component.

import { createHmac, timingSafeEqual } from "node:crypto";

import { MODE_IDS, type ModeId } from "@/game/modes";
import { GEAR_IDS } from "@/game/gear";

/** The context that stamps run tokens; no proof is ever signed under it. */
const TOKEN_CONTEXT = "manic-run-token-v1\n";
/** The context that stamps proofs; no token is ever signed under it. */
const PROOF_CONTEXT = "manic-run-proof-v1\n";

/** A base58 address of the length Solana wallets have. */
const BASE58_WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The highest gear level any shape check accepts (caps live in game/gear.ts;
 *  this only bounds the number a hand-written payload could carry). */
const GEAR_LEVEL_CEILING = 1000;

/** The state a verified run must begin with: what the on-chain reptile has. */
export interface RunStartState {
    /** Gear levels per kind, whole numbers within the caps. */
    gear: Record<string, number>;
    /** The feat ids the progress carries. */
    feats: string[];
    /** The held pickups, the save's { layer, trait } shape. */
    pickedUp: { layer: string; trait: string }[];
}

/** The payload a run token carries. */
export interface TokenPayload {
    /** The seed the server issued for this run. */
    seed: number;
    mode: ModeId;
    wallet: string;
    /** The state the run must begin with. */
    start: RunStartState;
    /** When the server issued the token, in ms. */
    issuedAt: number;
}

/** The payload a proof carries - exactly what game/nftProgress.ts merges as a run. */
export interface ProofPayload {
    wallet: string;
    issuedAt: number;
    mode: ModeId;
    /** The run's tally: validated structurally, finite non-negative
     *  numbers with the mode text and the nested toolsUsed map. */
    tally: Record<string, unknown>;
    /** The score to rank by: milliseconds for a time mode, points elsewhere. */
    score: number;
    pickedUp: { layer: string; trait: string }[];
    gear: Record<string, number>;
}

/** The signing secret, or null when the environment carries none. */
function secret(): string | null {
    const raw = process.env.RUN_TOKEN_SECRET;
    if (typeof raw !== "string" || raw === "") return null;
    return raw;
}

/** True when the server can sign: the routes answer 503 without this. */
export function signingAvailable(): boolean {
    return secret() !== null;
}

function base64urlEncode(text: string): string {
    return Buffer.from(text, "utf8").toString("base64url");
}

function base64urlDecode(part: string): Buffer {
    return Buffer.from(part, "base64url");
}

/** The MAC over the context plus the base64url body: the context keeps the
 *  two payload kinds' MACs apart even for identical JSON. */
function macFor(key: string, context: string, body: string): Buffer {
    return createHmac("sha256", key).update(context).update(body).digest();
}

/** `base64url(json).base64url(mac)`, or null when the payload cannot be
 *  serialised or no secret is set. */
function sign(context: string, payload: unknown): string | null {
    const key = secret();
    if (key === null) return null;
    let body: string;
    try {
        body = base64urlEncode(JSON.stringify(payload));
    } catch {
        return null;
    }
    return `${body}.${macFor(key, context, body).toString("base64url")}`;
}

/** The parsed payload under a valid MAC, or null: split, constant-time MAC
 *  check, then JSON. Shape validation happens in the callers. */
function readSigned(context: string, text: unknown): unknown {
    if (typeof text !== "string") return null;
    const parts = text.split(".");
    if (parts.length !== 2) return null;
    const key = secret();
    if (key === null) return null;
    const mac = base64urlDecode(parts[1]);
    if (mac.length !== 32) return null;
    const expected = macFor(key, context, parts[0]);
    if (!timingSafeEqual(mac, expected)) return null;
    let payload: unknown;
    try {
        payload = JSON.parse(base64urlDecode(parts[0]).toString("utf8"));
    } catch {
        return null;
    }
    return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isWallet(value: unknown): value is string {
    return typeof value === "string" && BASE58_WALLET.test(value);
}

function isMode(value: unknown): value is ModeId {
    return typeof value === "string" && (MODE_IDS as readonly string[]).includes(value);
}

/** Known gear ids only, each an integer level within the shape ceiling. */
function isGear(value: unknown): value is Record<string, number> {
    if (!isRecord(value)) return false;
    for (const [id, level] of Object.entries(value)) {
        if (!(GEAR_IDS as readonly string[]).includes(id)) return false;
        if (!Number.isInteger(level) || (level as number) < 0 || (level as number) > GEAR_LEVEL_CEILING) {
            return false;
        }
    }
    return true;
}

function isPickups(value: unknown): value is { layer: string; trait: string }[] {
    if (!Array.isArray(value)) return false;
    return value.every(
        (entry) => isRecord(entry) && typeof entry.layer === "string" && typeof entry.trait === "string",
    );
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * Finite non-negative numbers, with two exceptions the real Tally carries:
 * the mode id rides as text under "mode", and "minExitEnergy" is null before
 * the first exit (JSON turns an Infinity or NaN into null, so null is
 * refused everywhere else). One level of nested records is allowed for the
 * tally's toolsUsed map.
 */
function isTally(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) return false;
    for (const [key, entry] of Object.entries(value)) {
        if (key === "mode" && typeof entry === "string") continue;
        if (key === "minExitEnergy" && entry === null) continue;
        if (isFiniteNumber(entry) && entry >= 0) continue;
        if (isRecord(entry)) {
            const nested = Object.values(entry).every((inner) => isFiniteNumber(inner) && inner >= 0);
            if (nested) continue;
        }
        return false;
    }
    return true;
}

/** The shape readToken accepts beyond the MAC. */
function isTokenPayload(value: unknown): value is TokenPayload {
    if (!isRecord(value)) return false;
    if (!isWallet(value.wallet)) return false;
    if (!isFiniteNumber(value.issuedAt)) return false;
    if (!isMode(value.mode)) return false;
    if (!Number.isInteger(value.seed) || (value.seed as number) < 0) return false;
    if (!isRecord(value.start)) return false;
    if (!isGear(value.start.gear)) return false;
    if (!isStringArray(value.start.feats)) return false;
    if (!isPickups(value.start.pickedUp)) return false;
    return true;
}

/** The shape readProof accepts beyond the MAC. */
function isProofPayload(value: unknown): value is ProofPayload {
    if (!isRecord(value)) return false;
    if (!isWallet(value.wallet)) return false;
    if (!isFiniteNumber(value.issuedAt)) return false;
    if (!isMode(value.mode)) return false;
    if (!isTally(value.tally)) return false;
    if (!isFiniteNumber(value.score)) return false;
    if (!isPickups(value.pickedUp)) return false;
    if (!isGear(value.gear)) return false;
    return true;
}

/**
 * The signed text for a run token. Whatever the caller hands over is signed
 * as it is - the readers are the gate, not the signer. Throws when
 * RUN_TOKEN_SECRET is unset; routes check signingAvailable() first.
 */
export function issueToken(payload: TokenPayload): string {
    const text = sign(TOKEN_CONTEXT, payload);
    if (text === null) throw new Error("RUN_TOKEN_SECRET is not set");
    return text;
}

/** The token's payload under a valid token MAC and shape, or null. */
export function readToken(text: unknown): TokenPayload | null {
    const payload = readSigned(TOKEN_CONTEXT, text);
    return isTokenPayload(payload) ? payload : null;
}

/** The signed text for a proof, payload exactly as given (see issueToken). */
export function signProof(payload: ProofPayload): string {
    const text = sign(PROOF_CONTEXT, payload);
    if (text === null) throw new Error("RUN_TOKEN_SECRET is not set");
    return text;
}

/** The proof's payload under a valid proof MAC and shape, or null. */
export function readProof(text: unknown): ProofPayload | null {
    const payload = readSigned(PROOF_CONTEXT, text);
    return isProofPayload(payload) ? payload : null;
}
