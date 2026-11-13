// POST /api/run/start (NFT-PLAN N2, E70): the server hands a run its seed.
// The body is { mode, wallet }; the reply is { token, seed, start }. The seed
// is 32 random bits from node:crypto, or the calendar day's dailySeed for
// Daily. `start` is the state the run must begin with: the wallet's reptile's
// decoded on-chain progress read through DAS, or defaults when the wallet
// holds none. Without RUN_TOKEN_SECRET the whole route answers 503 - the
// shell then plays exactly as before, unverified. Server-only: node:crypto.

import { randomBytes } from "node:crypto";

import { dailySeed, MODES, type ModeId } from "@/game/modes";
import { noGear, sanitizeGear, type GearLevels } from "@/game/gear";
import { decodeAttributes } from "@/game/nftProgress";
import { REPTILE_COLLECTION } from "@/lib/reptile";
import { issueToken, signingAvailable, type RunStartState } from "@/lib/server/runToken";
import { dasUrl } from "@/lib/server/das";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Longest body the route even looks at. */
const MAX_BODY_BYTES = 1024;

/** A base58 address of the length Solana wallets have. */
const BASE58_WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Milliseconds the DAS lookup may take before the start falls back to defaults. */
const DAS_TIMEOUT_MS = 4000;

function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}

/** The body as a parsed object, or null: capped at maxBytes, JSON, an object. */
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

/** Today UTC as the yyyymmdd number dailySeed hashes. */
function todayUtcYyyymmdd(now: Date): number {
    return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first reptile asset's attribute list from a DAS items array, or null. */
function reptileAttributeList(items: unknown): unknown {
    if (!Array.isArray(items)) return null;
    for (const item of items) {
        if (!isRecord(item)) continue;
        const grouping = item.grouping;
        const inCollection = Array.isArray(grouping) && grouping.some((entry) =>
            isRecord(entry) && entry.group_value === REPTILE_COLLECTION);
        if (!inCollection) continue;
        const plugins = item.plugins;
        const attributes = isRecord(plugins) ? plugins.attributes : undefined;
        const data = isRecord(attributes) ? attributes.data : undefined;
        const list = isRecord(data) ? data.attribute_list : undefined;
        return Array.isArray(list) ? list : [];
    }
    return null;
}

/** The wallet's on-chain start state through DAS: the reptile's decoded
 *  progress, or defaults for a wallet that holds none. Every failure - no
 *  endpoint, a network error, broken JSON - answers with defaults, never a
 *  throw: the run still starts, just from nothing carried. */
async function loadStartState(wallet: string): Promise<RunStartState> {
    const defaults: RunStartState = { gear: noGear(), feats: [], pickedUp: [] };
    const endpoint = dasUrl();
    if (endpoint === null) return defaults;
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "run-start",
                method: "getAssetsByOwner",
                params: { ownerAddress: wallet, page: 1, limit: 1000 },
            }),
            signal: AbortSignal.timeout(DAS_TIMEOUT_MS),
        });
        if (!response.ok) return defaults;
        const reply: unknown = await response.json();
        if (!isRecord(reply) || reply.error !== undefined || reply.result === undefined) return defaults;
        const items = isRecord(reply.result) ? reply.result.items : undefined;
        const list = reptileAttributeList(items);
        if (list === null) return defaults;
        const progress = decodeAttributes(list);
        return {
            gear: sanitizeGear(progress.gear) as GearLevels,
            feats: [...progress.feats],
            pickedUp: progress.traits.map((entry) => ({ layer: entry.layer, trait: entry.trait })),
        };
    } catch {
        return defaults;
    }
}

export async function POST(request: Request): Promise<Response> {
    if (!signingAvailable()) return json({ error: "verification off" }, 503);

    const body = await readBody(request, MAX_BODY_BYTES);
    if (body === null) return json({ error: "bad_body" }, 400);

    const mode = body.mode;
    if (typeof mode !== "string" || MODES[mode as ModeId] === undefined) {
        return json({ error: "bad_mode" }, 400);
    }
    const wallet = body.wallet;
    if (typeof wallet !== "string" || !BASE58_WALLET.test(wallet)) {
        return json({ error: "bad_wallet" }, 400);
    }

    const rules = MODES[mode as ModeId];
    const seed = rules.seed === "daily"
        ? dailySeed(todayUtcYyyymmdd(new Date()))
        : randomBytes(4).readUInt32BE(0);
    const start = await loadStartState(wallet);
    const issuedAt = Date.now();
    const token = issueToken({ seed, mode: rules.id, wallet, start, issuedAt });
    return json({ token, seed, start });
}
