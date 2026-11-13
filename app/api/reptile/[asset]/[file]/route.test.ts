// The reptile metadata and image route (E71): the JSON follows the Metaplex
// standard and shows the decoded on-chain progress (stored look values and
// all, derived stats included, bitmasks never), the PNG is the 16x16 PFP
// masters stacked over the background at 512x512, and the caching follows
// the requested version. The DAS reply is a fetch stub and the image is
// decoded back with sharp - no network.

import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import sharp from "sharp";

import { GET } from "./route";
import {
    decodeAttributes,
    displayStats,
    encodeAttributes,
    progressVersion,
    type NftProgress,
} from "@/game/nftProgress";
import { DEFAULT_LOOK } from "@/game/sprite";
import { REPTILE_COLLECTION } from "@/lib/reptile";

const ASSET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const NFT_DIR = path.join(process.cwd(), "public", "images", "nft");

let savedRpc: string | undefined;
let savedPublicRpc: string | undefined;

beforeEach(() => {
    savedRpc = process.env.SOLANA_RPC_URL;
    savedPublicRpc = process.env.NEXT_PUBLIC_RPC_URL;
    process.env.SOLANA_RPC_URL = "https://das.example/rpc";
    delete process.env.NEXT_PUBLIC_RPC_URL;
});

afterEach(() => {
    for (const [key, value] of [
        ["SOLANA_RPC_URL", savedRpc],
        ["NEXT_PUBLIC_RPC_URL", savedPublicRpc],
    ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    vi.unstubAllGlobals();
});

function get(asset: string, file: string): Promise<Response> {
    return GET(new Request(`http://localhost/api/reptile/${asset}/${file}`), {
        params: Promise.resolve({ asset, file }),
    });
}

/** A progress with something to show on every front: an unknown Clothes
 *  trait an old holder wears, bests, depth, gear that moves every stat and
 *  one feat. */
function sampleProgress(background: "Void" | "Solana"): NftProgress {
    return {
        look: { ...DEFAULT_LOOK, Clothes: "White", Background: background },
        best: { descent: 1234, sprint: 45678 },
        totals: { deepest: 42, runs: 10 },
        feats: ["first-exit"],
        traits: [],
        gear: { boots: 1, gloves: 2, shield: 0, speed: 0, backpack: 3 },
        synced: 1234,
    };
}

/** The DAS getAsset reply for one reptile in the collection. */
function reptileAsset(attributeList: unknown, name = "Entangled Reptile #0412"): Record<string, unknown> {
    return {
        id: ASSET,
        grouping: [{ group_value: REPTILE_COLLECTION }],
        content: { metadata: { name } },
        plugins: { attributes: { data: { attribute_list: attributeList } } },
    };
}

/** The fetch stubs, each recording the JSON-RPC request it was sent. */
function dasReply(payload: { result?: unknown; error?: unknown }, sent?: { body?: unknown }): typeof fetch {
    return (async (_input: unknown, init?: RequestInit) => {
        if (sent) sent.body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: "reptile-metadata", ...payload }));
    }) as typeof fetch;
}

function dasFailing(): typeof fetch {
    return (async () => {
        throw new Error("offline");
    }) as typeof fetch;
}

const PROGRESS = sampleProgress("Void");
const LIST = encodeAttributes(PROGRESS);
const V = progressVersion(PROGRESS);

describe("bad requests are refused before anything is fetched", () => {
    test("asset ids that are not base58 addresses give 400", async () => {
        for (const asset of ["", "0OIl-not-base58", "a".repeat(31), "a".repeat(45), "l".repeat(40)]) {
            const response = await get(asset, `${V}.json`);
            expect(response.status).toBe(400);
        }
    });

    test("file names that are not <8 hex>.json or <8 hex>.png give 400", async () => {
        for (const file of [
            "deadbeef.txt", "deadbee.json", "deadbeefg.png",
            "DEADBEEF.json", "deadbeef", `${V}.json.json`, "",
        ]) {
            const response = await get(ASSET, file);
            expect(response.status).toBe(400);
        }
    });
});

describe("the collection gate", () => {
    test("an asset outside the collection is 404", async () => {
        vi.stubGlobal("fetch", dasReply({
            result: {
                ...reptileAsset(LIST),
                grouping: [{ group_value: "SomeOtherCollectionMintAddressHere111111111111111" }],
            },
        }));
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(404);
    });

    test("an asset the chain does not have is 404", async () => {
        vi.stubGlobal("fetch", dasReply({
            error: { code: -32003, message: `Asset ${ASSET} could not be found` },
        }));
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(404);
    });
});

describe("DAS failures", () => {
    test("a thrown fetch is 502 with no cache", async () => {
        vi.stubGlobal("fetch", dasFailing());
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(502);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    test("a broken reply is 502", async () => {
        vi.stubGlobal("fetch", (async () => new Response("<html>nope</html>")) as typeof fetch);
        const response = await get(ASSET, `${V}.png`);
        expect(response.status).toBe(502);
    });

    test("no endpoint configured is 502 without a fetch", async () => {
        delete process.env.SOLANA_RPC_URL;
        const spy = vi.fn();
        vi.stubGlobal("fetch", spy as unknown as typeof fetch);
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(502);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("the JSON metadata", () => {
    test("the Metaplex fields are the game's own", async () => {
        const sent: { body?: unknown } = {};
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(LIST) }, sent));
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("application/json");

        // The route asked DAS for exactly this asset by getAsset.
        expect(sent.body).toMatchObject({
            jsonrpc: "2.0",
            method: "getAsset",
            params: { id: ASSET },
        });

        const body = await response.json();
        expect(body.name).toBe("Entangled Reptile #0412");
        expect(body.description).toBe(
            "Playable characters for the maze speedrunner, https://www.manic-entanglement.com, upgradable in-game.",
        );
        expect(body.image).toBe(`https://www.manic-entanglement.com/api/reptile/${ASSET}/${V}.png`);
        expect(body.external_url).toBe("https://www.manic-entanglement.com");
        expect(body.properties.files).toEqual([
            { uri: `https://www.manic-entanglement.com/api/reptile/${ASSET}/${V}.png`, type: "image/png" },
        ]);
    });

    test("the attributes show the stored look, the bests, the stats and the feat count", async () => {
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(LIST) }));
        const response = await get(ASSET, `${V}.json`);
        const body = await response.json();
        const traits = new Map<string, unknown>(
            body.attributes.map((entry: { trait_type: string; value: unknown }) => [entry.trait_type, entry.value]),
        );

        // The look as stored: the unknown Clothes trait shows as the holder wrote it.
        expect(traits.get("Back")).toBe("None");
        expect(traits.get("Body")).toBe("Green");
        expect(traits.get("Clothes")).toBe("White");
        expect(traits.get("Eye")).toBe("Regular");
        expect(traits.get("Head")).toBe("None");
        expect(traits.get("Background")).toBe("Void");

        // Bests and depth.
        expect(traits.get("Best Descent")).toBe(1234);
        expect(traits.get("Best Sprint")).toBe(45678);
        expect(traits.get("Best Depth")).toBe(42);

        // The five derived stats, one decimal like the HUD.
        const stats = displayStats(PROGRESS);
        const decimal = (value: number) => (Math.round(value * 10) / 10).toFixed(1);
        expect(traits.get("Attack")).toBe(decimal(stats.attack));
        expect(traits.get("Defense")).toBe(decimal(stats.defense));
        expect(traits.get("Speed")).toBe(decimal(stats.speed));
        expect(traits.get("Consumption")).toBe(decimal(stats.consumption));
        expect(traits.get("Storage")).toBe(decimal(stats.storage));
        expect(traits.get("Attack")).toBe("1.2"); // gloves 2 at +0.1

        // The feat count, and never the raw bitmasks or bookkeeping.
        expect(traits.get("Feats")).toBe(1);
        for (const hidden of ["Traits", "Synced", "Version", "Runs", "Kills", "Cleared", "Banked", "Gear Boots"]) {
            expect(traits.has(hidden)).toBe(false);
        }
    });

    test("an asset with no attributes at all still renders defaults", async () => {
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(null) }));
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(200);
        const body = await response.json();
        const traits = new Map<string, unknown>(
            body.attributes.map((entry: { trait_type: string; value: unknown }) => [entry.trait_type, entry.value]),
        );
        expect(traits.get("Body")).toBe(DEFAULT_LOOK.Body);
        expect(traits.get("Feats")).toBe(0);
    });
});

describe("caching follows the requested version", () => {
    test("the current version is immutable", async () => {
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(LIST) }));
        for (const file of [`${V}.json`, `${V}.png`]) {
            const response = await get(ASSET, file);
            expect(response.status).toBe(200);
            expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        }
    });

    test("an older version renders the current state with a short shared-cache TTL", async () => {
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(LIST) }));
        const stale = V === "00000000" ? "00000001" : "00000000";
        for (const file of [`${stale}.json`, `${stale}.png`]) {
            const response = await get(ASSET, file);
            expect(response.status).toBe(200);
            expect(response.headers.get("cache-control")).toBe("public, s-maxage=300");
        }
    });
});

describe("the PNG", () => {
    test("it is 512x512 and its pixels are the masters scaled 32x", async () => {
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(LIST) }));
        const response = await get(ASSET, `${V}.png`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        const png = Buffer.from(await response.arrayBuffer());

        const rendered = sharp(png);
        const meta = await rendered.metadata();
        expect(meta.width).toBe(512);
        expect(meta.height).toBe(512);
        const out = await rendered.ensureAlpha().raw().toBuffer();

        // The Void background shows through where no layer is drawn.
        expect([out[0], out[1], out[2]]).toEqual([0x06, 0x12, 0x0d]);

        // A Body pixel the Eye does not cover must come back the master's
        // exact colour, nearest-neighbour at 32x.
        const master = async (file: string): Promise<Buffer> =>
            sharp(await fs.readFile(path.join(NFT_DIR, file))).ensureAlpha().raw().toBuffer();
        const body = await master("Body/Greenpfp.png");
        const eye = await master("Eye/Regularpfp.png");
        let checked = 0;
        for (let y = 0; y < 16; y += 1) {
            for (let x = 0; x < 16; x += 1) {
                const at = (y * 16 + x) * 4;
                if (body[at + 3] !== 255 || eye[at + 3] !== 0) continue;
                const ox = x * 32 + 16;
                const oy = y * 32 + 16;
                const oAt = (oy * 512 + ox) * 4;
                expect([out[oAt], out[oAt + 1], out[oAt + 2], out[oAt + 3]])
                    .toEqual([body[at], body[at + 1], body[at + 2], 255]);
                checked += 1;
            }
        }
        expect(checked).toBeGreaterThan(10); // the check actually sampled the body
    });

    test("the Solana background runs from the gradient's two colours at the corners", async () => {
        const solana = sampleProgress("Solana");
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(encodeAttributes(solana)) }));
        const response = await get(ASSET, `${progressVersion(solana)}.png`);
        expect(response.status).toBe(200);
        const out = await sharp(Buffer.from(await response.arrayBuffer())).ensureAlpha().raw().toBuffer();

        const near = (at: number, [r, g, b]: number[]) => {
            expect(Math.abs(out[at] - r)).toBeLessThanOrEqual(4);
            expect(Math.abs(out[at + 1] - g)).toBeLessThanOrEqual(4);
            expect(Math.abs(out[at + 2] - b)).toBeLessThanOrEqual(4);
        };
        near(0, [0x99, 0x45, 0xff]); // top-left
        near((511 * 512 + 511) * 4, [0x14, 0xf1, 0x95]); // bottom-right
    });
});

describe("the devnet collection (E72)", () => {
    const DEVNET_COLLECTION = "CLH6sKfniaCf4h3NJmCNfzUgjtY6viVtnc8eA43NQNmx";
    let savedCluster: string | undefined;
    let savedCollection: string | undefined;

    beforeEach(() => {
        savedCluster = process.env.NFT_CLUSTER;
        savedCollection = process.env.NFT_COLLECTION;
        process.env.NFT_CLUSTER = "devnet";
        process.env.NFT_COLLECTION = DEVNET_COLLECTION;
    });

    afterEach(() => {
        if (savedCluster === undefined) delete process.env.NFT_CLUSTER;
        else process.env.NFT_CLUSTER = savedCluster;
        if (savedCollection === undefined) delete process.env.NFT_COLLECTION;
        else process.env.NFT_COLLECTION = savedCollection;
    });

    test("a reptile of the devnet test collection is served", async () => {
        const asset = reptileAsset(LIST);
        asset.grouping = [{ group_value: DEVNET_COLLECTION }];
        vi.stubGlobal("fetch", dasReply({ result: asset }));
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(200);
    });

    test("on devnet the real collection is not the gate any more", async () => {
        vi.stubGlobal("fetch", dasReply({ result: reptileAsset(LIST) }));
        const response = await get(ASSET, `${V}.json`);
        expect(response.status).toBe(404);
    });
});
