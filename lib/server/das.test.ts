// The server-side DAS helper (E70, E72): the endpoint comes from the
// environment, getAsset tells found from missing from error without ever
// throwing, the defensive readers dig out what they can and answer null for
// the rest - and the collection gate follows the config, so a devnet asset
// is found on devnet and only the real collection counts elsewhere.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
    assetAttributeList,
    assetInCollection,
    assetName,
    dasGetAsset,
    dasUrl,
} from "./das";
import { REPTILE_COLLECTION } from "@/lib/reptile";

const DEVNET_COLLECTION = "CLH6sKfniaCf4h3NJmCNfzUgjtY6viVtnc8eA43NQNmx";

let saved: Record<string, string | undefined>;

beforeEach(() => {
    saved = {};
    for (const key of ["SOLANA_RPC_URL", "NEXT_PUBLIC_RPC_URL", "NFT_CLUSTER", "NFT_COLLECTION"]) {
        saved[key] = process.env[key];
        delete process.env[key];
    }
});

afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    vi.unstubAllGlobals();
});

function asset(groupValue: unknown): Record<string, unknown> {
    return { grouping: [{ group_value: groupValue }] };
}

describe("assetInCollection follows the config (E72)", () => {
    test("the real collection is the gate with no devnet config", () => {
        expect(assetInCollection(asset(REPTILE_COLLECTION))).toBe(true);
        expect(assetInCollection(asset(DEVNET_COLLECTION))).toBe(false);
    });

    test("devnet with NFT_COLLECTION finds devnet reptiles", () => {
        process.env.NFT_CLUSTER = "devnet";
        process.env.NFT_COLLECTION = DEVNET_COLLECTION;
        expect(assetInCollection(asset(DEVNET_COLLECTION))).toBe(true);
        expect(assetInCollection(asset(REPTILE_COLLECTION))).toBe(false);
    });

    test("mainnet ignores a stray NFT_COLLECTION", () => {
        process.env.NFT_CLUSTER = "mainnet";
        process.env.NFT_COLLECTION = DEVNET_COLLECTION;
        expect(assetInCollection(asset(DEVNET_COLLECTION))).toBe(false);
        expect(assetInCollection(asset(REPTILE_COLLECTION))).toBe(true);
    });

    test("an explicit collection argument wins", () => {
        expect(assetInCollection(asset(DEVNET_COLLECTION), DEVNET_COLLECTION)).toBe(true);
    });

    test("no grouping, or a broken one, is outside every collection", () => {
        expect(assetInCollection({})).toBe(false);
        expect(assetInCollection({ grouping: "no" })).toBe(false);
        expect(assetInCollection(null)).toBe(false);
    });
});

describe("dasUrl", () => {
    test("SOLANA_RPC_URL first, NEXT_PUBLIC_RPC_URL as the fallback", () => {
        expect(dasUrl()).toBeNull();
        process.env.NEXT_PUBLIC_RPC_URL = "https://public.example/rpc";
        expect(dasUrl()).toBe("https://public.example/rpc");
        process.env.SOLANA_RPC_URL = " https://private.example/rpc ";
        expect(dasUrl()).toBe("https://private.example/rpc");
    });

    test("anything not https:// is no endpoint", () => {
        process.env.SOLANA_RPC_URL = "http://plain.example/rpc";
        process.env.NEXT_PUBLIC_RPC_URL = "   ";
        expect(dasUrl()).toBeNull();
    });
});

describe("dasGetAsset never throws", () => {
    test("no endpoint is an error, not a fetch", () => {
        return expect(dasGetAsset("anything")).resolves.toEqual({ status: "error" });
    });

    test("a found reply carries the asset as it came", async () => {
        process.env.SOLANA_RPC_URL = "https://das.example/rpc";
        const asset = { id: "abc", name: "Reptile" };
        vi.stubGlobal("fetch", (async () =>
            new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: asset }))) as typeof fetch);
        await expect(dasGetAsset("abc")).resolves.toEqual({ status: "found", asset });
    });

    test("a 'not found' RPC error reads as missing, any other as error", async () => {
        process.env.SOLANA_RPC_URL = "https://das.example/rpc";
        const reply = (error: unknown) => (async () =>
            new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error }))) as typeof fetch;
        vi.stubGlobal("fetch", reply({ message: "Asset not found" }));
        await expect(dasGetAsset("abc")).resolves.toEqual({ status: "missing" });
        vi.stubGlobal("fetch", reply({ message: "rate limited" }));
        await expect(dasGetAsset("abc")).resolves.toEqual({ status: "error" });
    });

    test("a thrown fetch, a non-OK reply and broken JSON all read as error", async () => {
        process.env.SOLANA_RPC_URL = "https://das.example/rpc";
        vi.stubGlobal("fetch", (async () => { throw new Error("offline"); }) as typeof fetch);
        await expect(dasGetAsset("abc")).resolves.toEqual({ status: "error" });
        vi.stubGlobal("fetch", (async () => new Response("nope", { status: 500 })) as typeof fetch);
        await expect(dasGetAsset("abc")).resolves.toEqual({ status: "error" });
        vi.stubGlobal("fetch", (async () => new Response("{oops")) as typeof fetch);
        await expect(dasGetAsset("abc")).resolves.toEqual({ status: "error" });
    });
});

describe("the defensive readers", () => {
    test("the attribute list, or null", () => {
        const list = [{ key: "Body", value: "Green" }];
        expect(assetAttributeList({ plugins: { attributes: { data: { attribute_list: list } } } }))
            .toBe(list);
        expect(assetAttributeList({})).toBeNull();
        expect(assetAttributeList({ plugins: { attributes: { data: { attribute_list: "no" } } } }))
            .toBeNull();
    });

    test("the name from whichever place the metadata keeps it", () => {
        expect(assetName({ content: { metadata: { name: " A " } } })).toBe(" A ");
        expect(assetName({ content: { name: "B" } })).toBe("B");
        expect(assetName({ name: "C" })).toBe("C");
        expect(assetName({ content: { metadata: { name: "  " } } })).toBeNull();
        expect(assetName(null)).toBeNull();
    });
});
