// The proof peek (E72): the client reads a proof body without the MAC check
// it cannot do - a well-formed body comes back as { issuedAt, mode, depth,
// wallet }, anything else is null whatever its signature claims - and the
// best verified depth counts only proofs signed to the asked wallet.

import { describe, expect, test } from "vitest";

import { bestVerifiedDepth, MINT_GOAL_DEPTH, peekProof, peekRun } from "./proofPeek";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const OTHER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

/** One base64url segment, padding stripped the way the proof texts do it. */
function b64url(text: string): string {
    return Buffer.from(text, "utf8").toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A proof-shaped text with a body of choice; the MAC half is a stub - the
 *  peek never checks it, exactly as the server-side readProof always does. */
function proofText(payload: unknown): string {
    return `${b64url(JSON.stringify(payload))}.${b64url("any-mac-bytes")}`;
}

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        wallet: WALLET,
        issuedAt: 1_700_000_000_000,
        mode: "descent",
        tally: { depth: 9, moves: 100 },
        score: 420,
        pickedUp: [],
        gear: {},
        ...over,
    };
}

describe("peekProof", () => {
    test("a well-formed body comes back without any MAC check", () => {
        expect(peekProof(proofText(body()))).toEqual({
            issuedAt: 1_700_000_000_000,
            mode: "descent",
            depth: 9,
            wallet: WALLET,
        });
    });

    test("the MAC half is never looked at", () => {
        const text = proofText(body());
        const tampered = `${text.split(".")[0]}.${b64url("tampered")}`;
        expect(peekProof(tampered)?.depth).toBe(9);
    });

    test("anything not shaped like a proof is null", () => {
        expect(peekProof(null)).toBeNull();
        expect(peekProof(42)).toBeNull();
        expect(peekProof("")).toBeNull();
        expect(peekProof("no-dot-here")).toBeNull();
        expect(peekProof("a.b.c")).toBeNull();
        expect(peekProof(`notbase64!.${b64url("mac")}`)).toBeNull();
        expect(peekProof(`${b64url("plain text")}.${b64url("mac")}`)).toBeNull();
        expect(peekProof(`${b64url("[1,2]")}.${b64url("mac")}`)).toBeNull();
    });

    test("a body with a wrong-shaped field is null", () => {
        expect(peekProof(proofText(body({ wallet: "0OIl not base58" }))))
            .toBeNull();
        expect(peekProof(proofText(body({ wallet: 7 }))))
            .toBeNull();
        expect(peekProof(proofText(body({ issuedAt: "yesterday" }))))
            .toBeNull();
        expect(peekProof(proofText(body({ issuedAt: Number.NaN }))))
            .toBeNull();
        expect(peekProof(proofText(body({ mode: "turbo" }))))
            .toBeNull();
        expect(peekProof(proofText(body({ tally: "9" }))))
            .toBeNull();
        expect(peekProof(proofText(body({ tally: { depth: "9" } }))))
            .toBeNull();
        expect(peekProof(proofText(body({ tally: {} }))))
            .toBeNull();
    });
});

describe("bestVerifiedDepth", () => {
    test("the deepest proof for this wallet wins", () => {
        const proofs = [
            proofText(body({ tally: { depth: 3 } })),
            proofText(body({ tally: { depth: 12 } })),
            proofText(body({ tally: { depth: 7 } })),
        ];
        expect(bestVerifiedDepth(proofs, WALLET)).toBe(12);
    });

    test("proofs for another wallet and junk never count", () => {
        const proofs = [
            proofText(body({ wallet: OTHER, tally: { depth: 40 } })),
            proofText(body({ tally: { depth: 5 } })),
            "junk",
            `${b64url("{}")}.${b64url("mac")}`,
        ];
        expect(bestVerifiedDepth(proofs, WALLET)).toBe(5);
        expect(bestVerifiedDepth(proofs, OTHER)).toBe(40);
    });

    test("no proofs at all is depth 0", () => {
        expect(bestVerifiedDepth([], WALLET)).toBe(0);
        expect(bestVerifiedDepth(["junk"], WALLET)).toBe(0);
    });

    test("the mint goal is depth 8", () => {
        expect(MINT_GOAL_DEPTH).toBe(8);
    });
});

describe("peekRun (E76)", () => {
    test("the whole body of a proof issued to the wallet, null for anyone else's or a non-proof", () => {
        expect(peekRun(proofText(body()), WALLET)).toEqual(body());
        expect(peekRun(proofText(body()), OTHER)).toBeNull();
        expect(peekRun(proofText({ wallet: WALLET }), WALLET)).toBeNull();
        expect(peekRun("not a proof", WALLET)).toBeNull();
    });
});
