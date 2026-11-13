// Test helpers for lib/nft: a fake chain (no network), signed test proofs and
// a signature check. Only the tests import this file.
import { createPublicKey, verify } from 'node:crypto';
import type { AssetV1, CollectionV1 } from '@metaplex-foundation/mpl-core';
import { publicKey } from '@metaplex-foundation/umi';
import { Keypair, type VersionedTransaction } from '@solana/web3.js';
import { signProof, type ProofPayload } from './_pending';
import type { AccountState, AssetInfo, Chain, Simulation } from './chain';
import { GENESIS_HASH, type NftConfig } from './config';
import type { Deps } from './service';
import { offlineUmi, type Attribute } from './tx';

export const BLOCKHASH = '11111111111111111111111111111111';
export const NOW = 1_800_000_000_000;

export function starterLook(over: Record<string, string> = {}) {
    return { Back: 'None', Body: 'Green', Clothes: 'None', Eye: 'Regular', Head: 'None', Background: 'Void', ...over };
}

export function proofPayload(wallet: string, issuedAt: number, over: Partial<ProofPayload> & { depth?: number } = {}): ProofPayload {
    const { depth = 8, ...rest } = over;
    return {
        wallet, issuedAt, mode: 'descent', score: 420, pickedUp: [],
        gear: { boots: 1, gloves: 0, shield: 0, speed: 0, backpack: 0 },
        tally: {
            moves: 400, ms: 300000, kills: 3, pickups: 5, bumps: 9, depth, cleared: Math.max(0, depth - 1),
            lostToFights: 12, minExitEnergy: 20, wardens: 0, toolsUsed: { anchor: 1, twist: 0, cut: 0 },
            darkCleared: 0, banked: 2, mode: 'descent',
        },
        ...rest,
    };
}

export function proof(wallet: string, issuedAt: number, over: Parameters<typeof proofPayload>[2] = {}): string {
    return signProof(proofPayload(wallet, issuedAt, over));
}

export interface FakeChain extends Chain {
    /** Every transaction handed to simulate, in order. */
    simulated: VersionedTransaction[];
    state: {
        genesis: string;
        numMinted: number;
        collectionExists: boolean;
        held: string[];
        assets: Map<string, AssetInfo>;
        lamports: Map<string, AccountState>;
        simulation: Partial<Simulation>;
        /** Lamports the simulated transaction moves from the wallet into the asset. */
        assetGrows: number;
        assetSpace: number;
    };
}

export function assetInfo(address: string, owner: string, collection: string | null, attributes: Attribute[] | null, uri = 'https://old.example/x.json'): AssetInfo {
    return {
        ref: { publicKey: publicKey(address), owner: publicKey(owner) } as unknown as AssetV1,
        owner, collection, name: 'Entangled Reptile', uri, attributes,
    };
}

export function fakeChain(collection: string): FakeChain {
    const state: FakeChain['state'] = {
        genesis: GENESIS_HASH.devnet, numMinted: 7, collectionExists: true, held: [], assets: new Map(),
        lamports: new Map(), simulation: {}, assetGrows: 7_158_480, assetSpace: 685,
    };
    const simulated: VersionedTransaction[] = [];
    return {
        umi: offlineUmi(), simulated, state,
        genesisHash: async () => state.genesis,
        collection: async (address) => (state.collectionExists && address === collection
            ? { ref: { publicKey: publicKey(collection) } as unknown as CollectionV1, numMinted: state.numMinted }
            : null),
        asset: async (address) => state.assets.get(address) ?? null,
        reptilesOwnedBy: async () => state.held,
        accounts: async (addresses) => addresses.map((address) => state.lamports.get(address) ?? null),
        rentExempt: async (space) => (space + 128) * 6960,
        latestBlockhash: async () => ({ blockhash: BLOCKHASH, lastValidBlockHeight: 1000 }),
        simulate: async (tx, watch) => {
            simulated.push(tx);
            const limit = tx.message.compiledInstructions[0].data;
            const units = (limit[1] | (limit[2] << 8) | (limit[3] << 16)) >>> 0;
            const priority = Math.ceil((units * 20_000) / 1_000_000);
            const network = tx.message.header.numRequiredSignatures * 5000 + priority;
            const wallet = state.lamports.get(watch[0]) ?? { lamports: 0, space: 0 };
            const asset = state.lamports.get(watch[1]) ?? { lamports: 0, space: 0 };
            return {
                err: null, logs: [], units: 40_000,
                accounts: [
                    { lamports: wallet.lamports - network - state.assetGrows, space: 0 },
                    { lamports: asset.lamports + state.assetGrows, space: state.assetSpace },
                ],
                ...state.simulation,
            };
        },
    };
}

export function testDeps(): { deps: Deps; chain: FakeChain; config: NftConfig; wallet: Keypair } {
    const config: NftConfig = {
        cluster: 'devnet', rpcUrl: 'https://rpc.invalid', signer: Keypair.generate(),
        collection: Keypair.generate().publicKey.toBase58(),
    };
    const chain = fakeChain(config.collection);
    const wallet = Keypair.generate();
    chain.state.lamports.set(wallet.publicKey.toBase58(), { lamports: 50_000_000, space: 0 });
    return { deps: { config, chain, now: () => NOW }, chain, config, wallet };
}

/** Is slot `index` of the transaction a valid signature by its account key? */
export function signatureValid(tx: VersionedTransaction, index: number): boolean {
    const key = createPublicKey({
        key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), tx.message.staticAccountKeys[index].toBuffer()]),
        format: 'der', type: 'spki',
    });
    return verify(null, tx.message.serialize(), key, tx.signatures[index]);
}
