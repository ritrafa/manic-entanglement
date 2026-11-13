// The shell's one call to the server (E70): requestRunStart answers null on
// every failure - a thrown fetch (offline), a 503 (no secret), a timeout,
// broken JSON or a wrong-shaped reply - so the run falls back to the local
// seed and save, exactly as before verification existed. The DOM is never
// touched: the fetch implementation comes in as an argument.

import { describe, expect, test } from "vitest";

import { requestRunStart } from "./GameState";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("requestRunStart falls back to null", () => {
    test("a fetch that throws (offline) is a plain fallback", async () => {
        const fetchImpl = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
        expect(await requestRunStart("descent", WALLET, fetchImpl)).toBeNull();
    });

    test("a 503 (verification off) is a plain fallback", async () => {
        const fetchImpl = (async () => new Response(JSON.stringify({ error: "verification off" }), { status: 503 })) as typeof fetch;
        expect(await requestRunStart("descent", WALLET, fetchImpl)).toBeNull();
    });

    test("broken JSON or a wrong-shaped reply is a plain fallback", async () => {
        const broken = (async () => new Response("not json")) as typeof fetch;
        expect(await requestRunStart("descent", WALLET, broken)).toBeNull();
        const wrongShape = (async () => new Response(JSON.stringify({ token: 5, seed: "x" }))) as typeof fetch;
        expect(await requestRunStart("descent", WALLET, wrongShape)).toBeNull();
        const noStart = (async () => new Response(JSON.stringify({ token: "t", seed: 3 }))) as typeof fetch;
        expect(await requestRunStart("descent", WALLET, noStart)).toBeNull();
    });

    test("a wallet that is not a base58 address never even calls", async () => {
        let called = false;
        const fetchImpl = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
        expect(await requestRunStart("descent", "0OIl bad", fetchImpl)).toBeNull();
        expect(called).toBe(false);
    });

    test("a call that never answers is cut off by the timeout", async () => {
        const fetchImpl = (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }) as Promise<Response>;
        expect(await requestRunStart("descent", WALLET, fetchImpl as typeof fetch, 20)).toBeNull();
    });

    test("a good reply comes back as the token, seed and start to play by", async () => {
        const reply = {
            token: "a.b",
            seed: 42,
            start: { gear: { boots: 3, saddle: 9 }, feats: ["first-blood", 7], pickedUp: [{ layer: "Body", trait: "Scales" }, { layer: 1 }] },
        };
        const fetchImpl = (async () => new Response(JSON.stringify(reply))) as typeof fetch;
        const start = await requestRunStart("descent", WALLET, fetchImpl);
        expect(start).not.toBeNull();
        expect(start!.token).toBe("a.b");
        expect(start!.seed).toBe(42);
        // Junk inside the start is dropped, not trusted: only whole non-negative
        // gear levels, string feats and { layer, trait } pickups survive.
        expect(start!.start.gear).toEqual({ boots: 3 });
        expect(start!.start.feats).toEqual(["first-blood"]);
        expect(start!.start.pickedUp).toEqual([{ layer: "Body", trait: "Scales" }]);
    });
});
