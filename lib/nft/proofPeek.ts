// Reading a run proof without the pen (E72): the browser holds signed proofs
// in the save (game/save.ts `pendingProofs`) and must show what they say -
// the wallet's best verified depth, which runs belong to this wallet - but
// only the server can check the MAC (lib/server/runToken.ts). This file
// decodes the body only, never trusts it, and never throws: the values are
// hints for the UI, and the mint and save routes read the very same texts
// with the MAC check in front. Pure: atob only, no node:crypto, no DOM.

import { MODE_IDS, type ModeId } from "@/game/modes";

/** The depth a verified run must reach before a wallet may mint (Q-C). The
 *  mint route enforces the same value (lib/nft/service.ts): one number,
 *  one rule, the panel just reads it. */
export const MINT_GOAL_DEPTH = 8;

/** A base58 address of the length Solana wallets have. */
const BASE58_WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The body of one proof, read without checking the signature. */
export interface ProofPeek {
    /** When the server signed the proof, in ms. */
    issuedAt: number;
    /** The mode the run played. */
    mode: ModeId;
    /** The deepest level the run reached (tally.depth). */
    depth: number;
    /** The wallet the proof was issued to (base58). */
    wallet: string;
}

/** The modes a proof may name; anything else is not a proof body. */
const MODE_NAMES: readonly string[] = [...MODE_IDS];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One base64url segment as text, padding restored; null when it is not. */
function decodeBase64UrlSegment(part: string): string | null {
    try {
        const normal = part.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normal + "=".repeat((4 - (normal.length % 4)) % 4);
        return atob(padded);
    } catch {
        return null;
    }
}

/**
 * The body of one proof text, decoded with no MAC check - the client cannot
 * check it, the server does. The proof is `base64url(json).base64url(mac)`;
 * the JSON body holds `{ wallet, issuedAt, mode, tally, score, pickedUp,
 * gear }`. Anything not shaped like that, or whose body names no real
 * wallet, mode, finite issuedAt or numeric tally depth, answers null. The
 * values are a peek for the UI only: never trust them, only the signed
 * server-side read (readProof) decides.
 */
export function peekProof(text: unknown): ProofPeek | null {
    const payload = proofBody(text);
    if (payload === null) return null;
    const { wallet, issuedAt, mode, tally } = payload;
    if (typeof wallet !== "string" || !BASE58_WALLET.test(wallet)) return null;
    if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return null;
    if (typeof mode !== "string" || !MODE_NAMES.includes(mode)) return null;
    if (!isRecord(tally)) return null;
    const depth = tally.depth;
    if (typeof depth !== "number" || !Number.isFinite(depth)) return null;
    return { issuedAt, mode: mode as ModeId, depth, wallet };
}

/** The JSON body of a proof text, unchecked; null when it is not one. */
function proofBody(text: unknown): Record<string, unknown> | null {
    if (typeof text !== "string") return null;
    const parts = text.split(".");
    if (parts.length !== 2) return null;
    const json = decodeBase64UrlSegment(parts[0]);
    if (json === null) return null;
    try {
        const payload: unknown = JSON.parse(json);
        return isRecord(payload) ? payload : null;
    } catch {
        return null;
    }
}

/**
 * The whole body of one proof (E76), unchecked, when peekProof reads it as a
 * proof issued to `wallet`: the run mergeProgress folds. The shell uses it
 * only to show a linked wallet the progress its unsaved runs carry; what
 * reaches the chain is still decided by the server's signed read.
 */
export function peekRun(text: unknown, wallet: string): Record<string, unknown> | null {
    const peek = peekProof(text);
    if (peek === null || peek.wallet !== wallet) return null;
    return proofBody(text);
}

/**
 * The best depth this wallet has reached in a verified run (E72): the highest
 * tally depth across the proofs issued to `wallet`, ignoring every text that
 * does not read as a proof and every proof signed to another wallet. 0 when
 * none is left - the Mint panel unlocks at MINT_GOAL_DEPTH.
 */
export function bestVerifiedDepth(proofs: readonly string[], wallet: string): number {
    let best = 0;
    for (const text of proofs) {
        const peek = peekProof(text);
        if (peek === null || peek.wallet !== wallet) continue;
        if (peek.depth > best) best = peek.depth;
    }
    return best;
}
