// The collection the game works in (E72): NFT_COLLECTION on devnet so a test
// run mints into and reads a test collection, and the real
// REPTILE_COLLECTION everywhere else - a stray variable on mainnet, or a
// devnet one that is not an address, never moves it.

import { describe, expect, test } from "vitest";

import { collectionAddress } from "./config";
import { REPTILE_COLLECTION } from "@/lib/reptile";

/** A second collection id, only ever used as the devnet override. */
const DEVNET_COLLECTION = "CLH6sKfniaCf4h3NJmCNfzUgjtY6viVtnc8eA43NQNmx";

describe("collectionAddress", () => {
    test("devnet with a test collection reads it", () => {
        expect(collectionAddress({
            NFT_CLUSTER: "devnet",
            NFT_COLLECTION: DEVNET_COLLECTION,
        })).toBe(DEVNET_COLLECTION);
    });

    test("devnet without one, or with a broken one, keeps the real collection", () => {
        expect(collectionAddress({ NFT_CLUSTER: "devnet" })).toBe(REPTILE_COLLECTION);
        expect(collectionAddress({ NFT_CLUSTER: "devnet", NFT_COLLECTION: "" }))
            .toBe(REPTILE_COLLECTION);
        expect(collectionAddress({ NFT_CLUSTER: "devnet", NFT_COLLECTION: "0OIl-not-base58" }))
            .toBe(REPTILE_COLLECTION);
        expect(collectionAddress({ NFT_CLUSTER: "devnet", NFT_COLLECTION: DEVNET_COLLECTION + "x" }))
            .toBe(REPTILE_COLLECTION);
    });

    test("mainnet never leaves the real collection, whatever the env says", () => {
        expect(collectionAddress({ NFT_CLUSTER: "mainnet" })).toBe(REPTILE_COLLECTION);
        expect(collectionAddress({
            NFT_CLUSTER: "mainnet",
            NFT_COLLECTION: DEVNET_COLLECTION,
        })).toBe(REPTILE_COLLECTION);
    });

    test("no or unknown cluster is not devnet either", () => {
        expect(collectionAddress({})).toBe(REPTILE_COLLECTION);
        expect(collectionAddress({
            NFT_CLUSTER: "localhost",
            NFT_COLLECTION: DEVNET_COLLECTION,
        })).toBe(REPTILE_COLLECTION);
    });
});
