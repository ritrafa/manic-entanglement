// The start route (E70): 503 without the secret, a signed token with a
// server-issued seed and the wallet's on-chain start state with it, the Daily
// seed pinned to the UTC day, and refusals for anything the body should not
// have said. The DAS reply is handed in as a fetch stub - no network.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { POST } from "./route";
import { readToken } from "@/lib/server/runToken";
import { dailySeed } from "@/game/modes";
import { REPTILE_COLLECTION } from "@/lib/reptile";

const SECRET = "start-route-test-secret";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

let savedSecret: string | undefined;
let savedRpc: string | undefined;
let savedPublicRpc: string | undefined;

beforeEach(() => {
    savedSecret = process.env.RUN_TOKEN_SECRET;
    savedRpc = process.env.SOLANA_RPC_URL;
    savedPublicRpc = process.env.NEXT_PUBLIC_RPC_URL;
    process.env.RUN_TOKEN_SECRET = SECRET;
    process.env.SOLANA_RPC_URL = "https://das.example/rpc";
    delete process.env.NEXT_PUBLIC_RPC_URL;
});

afterEach(() => {
    for (const [key, value] of [
        ["RUN_TOKEN_SECRET", savedSecret],
        ["SOLANA_RPC_URL", savedRpc],
        ["NEXT_PUBLIC_RPC_URL", savedPublicRpc],
    ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    vi.unstubAllGlobals();
});

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return POST(new Request("http://localhost/api/run/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
    }));
}

/** A fetch stub answering DAS with one reptile carrying these attributes. */
function dasWithAttributes(attributeList: unknown): typeof fetch {
    return (async () => new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: "run-start",
        result: {
            items: [{
                grouping: [{ group_value: REPTILE_COLLECTION }],
                plugins: { attributes: { data: { attribute_list: attributeList } } },
            }],
        },
    }))) as typeof fetch;
}

function dasFailing(): typeof fetch {
    return (async () => { throw new Error("offline"); }) as typeof fetch;
}

describe("without the secret the route is off", () => {
    test("503 verification off", async () => {
        delete process.env.RUN_TOKEN_SECRET;
        const response = await post({ mode: "descent", wallet: WALLET });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "verification off" });
    });
});

describe("a valid request gets a token, a seed and a start", () => {
    test("the token carries exactly what the reply shows", async () => {
        vi.stubGlobal("fetch", dasFailing());
        const response = await post({ mode: "descent", wallet: WALLET });
        expect(response.status).toBe(200);
        const body = await response.json() as { token: string; seed: number; start: { gear: Record<string, number>; feats: string[]; pickedUp: unknown[] } };
        expect(Number.isInteger(body.seed)).toBe(true);
        expect(body.seed).toBeGreaterThanOrEqual(0);
        expect(body.seed).toBeLessThan(2 ** 32);
        expect(body.start).toEqual({ gear: { boots: 0, gloves: 0, shield: 0, speed: 0, backpack: 0 }, feats: [], pickedUp: [] });
        const payload = readToken(body.token);
        expect(payload).not.toBeNull();
        expect(payload!.seed).toBe(body.seed);
        expect(payload!.mode).toBe("descent");
        expect(payload!.wallet).toBe(WALLET);
        expect(payload!.start).toEqual(body.start);
        expect(Math.abs(payload!.issuedAt - Date.now())).toBeLessThan(10_000);
    });

    test("Daily gets the UTC day's seed, not a random one", async () => {
        vi.stubGlobal("fetch", dasFailing());
        const response = await post({ mode: "daily", wallet: WALLET });
        const body = await response.json() as { seed: number };
        const now = new Date();
        const today = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
        expect(body.seed).toBe(dailySeed(today));
    });

    test("a wallet holding a reptile starts from its decoded progress", async () => {
        vi.stubGlobal("fetch", dasWithAttributes([
            { key: "Gear Boots", value: "3" },
            { key: "Gear Gloves", value: "2" },
            { key: "Runs", value: "12" },
        ]));
        const response = await post({ mode: "descent", wallet: WALLET });
        const body = await response.json() as { token: string; start: { gear: Record<string, number> } };
        expect(body.start.gear.boots).toBe(3);
        expect(body.start.gear.gloves).toBe(2);
        const payload = readToken(body.token);
        expect(payload!.start.gear.boots).toBe(3);
    });

    test("a DAS failure starts from defaults, never an error", async () => {
        vi.stubGlobal("fetch", dasFailing());
        const response = await post({ mode: "descent", wallet: WALLET });
        expect(response.status).toBe(200);
    });
});

describe("the body is validated and capped", () => {
    test("an unknown mode is refused", async () => {
        const response = await post({ mode: "warp", wallet: WALLET });
        expect(response.status).toBe(400);
    });

    test("a missing or non-base58 wallet is refused", async () => {
        expect((await post({ mode: "descent" })).status).toBe(400);
        expect((await post({ mode: "descent", wallet: "0OIl-not-base58-3212345678901234567890" })).status).toBe(400);
        expect((await post({ mode: "descent", wallet: 42 })).status).toBe(400);
    });

    test("a body over 1 kB is refused unread", async () => {
        const huge = JSON.stringify({ mode: "descent", wallet: WALLET }) + " ".repeat(2048);
        const response = await post(huge, { "Content-Length": String(huge.length) });
        expect(response.status).toBe(400);
    });

    test("broken JSON is refused", async () => {
        const response = await post("{mode: descent", {});
        expect(response.status).toBe(400);
    });
});
