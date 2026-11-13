// The token and proof helpers (E70): a MAC check that refuses every tamper,
// two contexts that never cross, and shape validation that refuses a
// well-signed payload the server could never have issued.

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    issueToken,
    readProof,
    readToken,
    signProof,
    type ProofPayload,
    type TokenPayload,
} from "./runToken";

const SECRET = "unit-test-secret-not-a-real-one";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

let savedSecret: string | undefined;

beforeEach(() => {
    savedSecret = process.env.RUN_TOKEN_SECRET;
    process.env.RUN_TOKEN_SECRET = SECRET;
});

afterEach(() => {
    if (savedSecret === undefined) delete process.env.RUN_TOKEN_SECRET;
    else process.env.RUN_TOKEN_SECRET = savedSecret;
});

function tokenPayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
    return {
        seed: 123456789,
        mode: "descent",
        wallet: WALLET,
        start: { gear: { boots: 2, gloves: 1 }, feats: ["first-blood"], pickedUp: [{ layer: "Body", trait: "Scales" }] },
        issuedAt: 1_700_000_000_000,
        ...overrides,
    };
}

function proofPayload(overrides: Partial<ProofPayload> = {}): ProofPayload {
    return {
        wallet: WALLET,
        issuedAt: 1_700_000_000_000,
        mode: "descent",
        tally: { moves: 120, ms: 45000, kills: 3, depth: 4, toolsUsed: { anchor: 1, twist: 0, cut: 0 } },
        score: 900,
        pickedUp: [{ layer: "Body", trait: "Scales" }],
        gear: { boots: 2, gloves: 1 },
        ...overrides,
    };
}

describe("issueToken / readToken", () => {
    test("a token reads back with the payload it was issued with", () => {
        const payload = tokenPayload();
        const text = issueToken(payload);
        expect(text.split(".")).toHaveLength(2);
        expect(readToken(text)).toEqual(payload);
    });

    test("tampering with the payload, the MAC or the separator is refused", () => {
        const text = issueToken(tokenPayload());
        const [body, mac] = text.split(".");
        // A different payload under the old MAC.
        const forgedBody = Buffer.from(JSON.stringify(tokenPayload({ seed: 1 })), "utf8").toString("base64url");
        expect(readToken(`${forgedBody}.${mac}`)).toBeNull();
        // A flipped MAC character.
        const flipped = `${body}.${(mac[0] === "A" ? "B" : "A") + mac.slice(1)}`;
        expect(readToken(flipped)).toBeNull();
        // No separator, an empty half, extra separators.
        expect(readToken(body)).toBeNull();
        expect(readToken(`${body}.`)).toBeNull();
        expect(readToken(`${body}.${mac}.`)).toBeNull();
        expect(readToken("")).toBeNull();
        expect(readToken(null)).toBeNull();
        expect(readToken(42)).toBeNull();
    });

    test("without a secret nothing reads and nothing signs", () => {
        const text = issueToken(tokenPayload());
        delete process.env.RUN_TOKEN_SECRET;
        expect(readToken(text)).toBeNull();
        expect(() => issueToken(tokenPayload())).toThrow();
    });
});

describe("signProof / readProof", () => {
    test("a proof reads back with the payload it was signed with", () => {
        const payload = proofPayload();
        expect(readProof(signProof(payload))).toEqual(payload);
    });

    test("a proof never passes as a token, and a token never as a proof", () => {
        const proof = signProof(proofPayload());
        expect(readToken(proof)).toBeNull();
        const token = issueToken(tokenPayload());
        expect(readProof(token)).toBeNull();
    });
});

describe("shape validation beyond the MAC", () => {
    test("a well-signed token with a bad shape is refused", () => {
        const bad: Partial<TokenPayload>[] = [
            { wallet: "0OIl" + WALLET.slice(4) }, // not base58
            { wallet: WALLET.slice(0, 31) }, // too short
            { mode: "warp" as TokenPayload["mode"] },
            { issuedAt: "soon" as unknown as number },
            { seed: 1.5 },
            { seed: -1 },
            { start: { gear: { wings: 1 }, feats: [], pickedUp: [] } }, // unknown gear id
            { start: { gear: { boots: 1.5 }, feats: [], pickedUp: [] } }, // fractional level
            { start: { gear: { boots: 2 }, feats: [3 as unknown as string], pickedUp: [] } },
            { start: { gear: {}, feats: [], pickedUp: [{ layer: "Body" } as unknown as { layer: string, trait: string }] } },
        ];
        for (const override of bad) {
            expect(readToken(issueToken(tokenPayload(override)))).toBeNull();
        }
    });

    test("a well-signed proof with a bad shape is refused", () => {
        const bad: Partial<ProofPayload>[] = [
            { wallet: "has spaces in it 3212345678901234567890123" },
            { issuedAt: Number.NaN },
            { issuedAt: "1700000000000" as unknown as number },
            { mode: "endless" as ProofPayload["mode"] },
            { tally: { moves: -1 } },
            { tally: { moves: Number.POSITIVE_INFINITY } },
            { tally: { moves: "12" } },
            { score: Number.NaN },
            { score: "900" as unknown as number },
            { pickedUp: [{ layer: 1, trait: "S" } as unknown as { layer: string, trait: string }] },
            { gear: { boots: 1, saddle: 2 } },
            { gear: { boots: 2.5 } },
        ];
        for (const override of bad) {
            expect(readProof(signProof(proofPayload(override)))).toBeNull();
        }
    });

    test("the tally's nested tool map survives, its siblings must stay numbers", () => {
        expect(readProof(signProof(proofPayload({
            tally: { moves: 1, toolsUsed: { anchor: 1, twist: 0, cut: 0 } },
        })))).not.toBeNull();
        expect(readProof(signProof(proofPayload({
            tally: { moves: 1, toolsUsed: { anchor: "one" } },
        })))).toBeNull();
    });
});
