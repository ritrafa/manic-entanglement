import { publicKey } from '@metaplex-foundation/umi';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { COMPUTE_BUDGET_PROGRAM_ID, CORE_PROGRAM_ID, isReptileTransaction, programIds } from './shape';
import { BLOCKHASH, signatureValid } from './testkit';
import {
    MAX_TX_BYTES, PROBE_UNIT_LIMIT, TxTooLargeError, buildMintTransaction, buildSaveTransaction,
    computeBudgetInstructions, networkFee, offlineUmi, partialSign, priorityFor, type Attribute,
} from './tx';

const umi = offlineUmi();
const key = () => Keypair.generate();
const collectionRef = (address: string) => ({ publicKey: publicKey(address) });
const assetRef = (address: string, owner: string) => ({ publicKey: publicKey(address), owner: publicKey(owner) });
const priority = { unitLimit: 54_321, microLamportsPerUnit: 20_000 };
const attributes: Attribute[] = [{ key: 'Body', value: 'Green' }, { key: 'Best Depth', value: '8' }];

/** A list that takes exactly `bytes` on the wire (4 + key + 4 + value each). */
function listOfBytes(bytes: number): Attribute[] {
    const list: Attribute[] = [];
    let left = bytes;
    while (left > 0) {
        const size = left >= 52 ? 40 : left;
        list.push({ key: `K${list.length}`.padEnd(4, 'x'), value: 'v'.repeat(size - 12) });
        left -= size;
    }
    return list;
}

/** The largest list (in wire bytes) that still builds. */
function maxListBytes(build: (list: Attribute[]) => unknown): number {
    let bytes = 400;
    for (;;) {
        try {
            build(listOfBytes(bytes + 1));
        } catch {
            return bytes;
        }
        bytes += 1;
    }
}

function mint(over: { attributes?: Attribute[] } = {}) {
    const wallet = key(); const asset = key(); const authority = key(); const collection = key();
    const tx = buildMintTransaction(umi, {
        wallet: wallet.publicKey.toBase58(), asset: asset.publicKey.toBase58(),
        authority: authority.publicKey.toBase58(), collection: collectionRef(collection.publicKey.toBase58()),
        name: 'Entangled Reptile #8',
        uri: `https://www.manic-entanglement.com/api/reptile/${asset.publicKey.toBase58()}/0123abcd.json`,
        attributes: over.attributes ?? attributes, blockhash: BLOCKHASH, priority,
    });
    return { tx, wallet, asset, authority, collection };
}

function save(over: Partial<Parameters<typeof buildSaveTransaction>[1]> = {}) {
    const wallet = key(); const asset = key(); const authority = key(); const collection = key();
    const tx = buildSaveTransaction(umi, {
        wallet: wallet.publicKey.toBase58(),
        asset: assetRef(asset.publicKey.toBase58(), wallet.publicKey.toBase58()),
        authority: authority.publicKey.toBase58(), collection: collectionRef(collection.publicKey.toBase58()),
        uri: `https://www.manic-entanglement.com/api/reptile/${asset.publicKey.toBase58()}/89abcdef.json`,
        attributes, hasAttributesPlugin: true, blockhash: BLOCKHASH, priority, ...over,
    });
    return { tx, wallet, asset, authority, collection };
}

const text = (data: Uint8Array) => Buffer.from(data).toString('latin1');

describe('compute budget', () => {
    it('encodes the limit and the price', () => {
        const [limit, price] = computeBudgetInstructions({ unitLimit: 0x010203, microLamportsPerUnit: 20_000 });
        expect([...limit.data]).toEqual([2, 3, 2, 1, 0]);
        expect([...price.data]).toEqual([3, 0x20, 0x4e, 0, 0, 0, 0, 0, 0]);
        expect(limit.programId).toBe(COMPUTE_BUDGET_PROGRAM_ID);
    });
    it('refuses absurd budgets', () => {
        expect(() => computeBudgetInstructions({ unitLimit: 0, microLamportsPerUnit: 1 })).toThrow();
        expect(() => computeBudgetInstructions({ unitLimit: 2_000_000, microLamportsPerUnit: 1 })).toThrow();
        expect(() => computeBudgetInstructions({ unitLimit: 1000, microLamportsPerUnit: 5_000_000 })).toThrow();
    });
    it('prices the network fee: signatures plus priority', () => {
        expect(networkFee(3, { unitLimit: 54_119, microLamportsPerUnit: 20_000 })).toBe(15_000 + 1083);
        expect(networkFee(2, { unitLimit: 100_000, microLamportsPerUnit: 20_000 })).toBe(12_000);
    });
    it('fits the limit to the measured units with a margin, capped', () => {
        expect(priorityFor(37_783).unitLimit).toBe(Math.ceil(37_783 * 1.3) + 5000);
        expect(priorityFor(10_000_000).unitLimit).toBe(PROBE_UNIT_LIMIT);
    });
});

describe('buildMintTransaction', () => {
    it('is paid by the player and needs the player, the asset and the game signer', () => {
        const { tx, wallet, asset, authority } = mint();
        const { numRequiredSignatures } = tx.message.header;
        const signers = tx.message.staticAccountKeys.slice(0, numRequiredSignatures).map((k) => k.toBase58());
        expect(signers[0]).toBe(wallet.publicKey.toBase58());
        expect([...signers].sort()).toEqual(
            [wallet, asset, authority].map((k) => k.publicKey.toBase58()).sort(),
        );
        expect(tx.signatures.every((signature) => signature.every((byte) => byte === 0))).toBe(true);
        expect(tx.message.recentBlockhash).toBe(BLOCKHASH);
        expect(tx.message.version).toBe('legacy');
    });
    it('calls only the compute budget and Core, with the collection as an account', () => {
        const { tx, wallet, collection } = mint();
        expect(programIds(tx)).toEqual([COMPUTE_BUDGET_PROGRAM_ID, COMPUTE_BUDGET_PROGRAM_ID, CORE_PROGRAM_ID]);
        expect(isReptileTransaction(tx, wallet.publicKey.toBase58())).toBe(true);
        expect(tx.message.staticAccountKeys.map((k) => k.toBase58())).toContain(collection.publicKey.toBase58());
        expect([...tx.message.compiledInstructions[0].data]).toEqual([2, 0x31, 0xd4, 0, 0]);
    });
    it('carries the name, the uri and the attribute list', () => {
        const { tx, asset } = mint();
        const data = text(tx.message.compiledInstructions[2].data);
        expect(data).toContain('Entangled Reptile #8');
        expect(data).toContain(`/api/reptile/${asset.publicKey.toBase58()}/0123abcd.json`);
        expect(data).toContain('Best Depth');
    });
    it('makes the player the owner (the owner account is the fee payer)', () => {
        const { tx } = mint();
        // createV2 accounts: asset, collection, authority, payer, owner, ...
        const accounts = tx.message.compiledInstructions[2].accountKeyIndexes;
        expect(accounts[3]).toBe(0);
        expect(accounts[4]).toBe(0);
    });
    it('throws TxTooLargeError past the packet size', () => {
        expect(() => mint({ attributes: listOfBytes(1200) })).toThrow(TxTooLargeError);
        expect(() => mint({ attributes: listOfBytes(640) })).toThrow(TxTooLargeError);
    });
    it('fits an attribute list of up to 590 bytes (three signatures leave less room than a save)', () => {
        // The budget E69 must keep: 4 + key + 4 + value summed over the list.
        expect(mint({ attributes: listOfBytes(590) }).tx.serialize().length).toBeLessThanOrEqual(MAX_TX_BYTES);
        expect(maxListBytes((list) => mint({ attributes: list }))).toBe(595);
    });
});

describe('buildSaveTransaction', () => {
    it('is paid by the player and co-signed by the game signer only', () => {
        const { tx, wallet, authority } = save();
        const signers = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
        expect(signers.map((k) => k.toBase58())).toEqual([wallet.publicKey.toBase58(), authority.publicKey.toBase58()]);
        expect(programIds(tx)).toEqual([
            COMPUTE_BUDGET_PROGRAM_ID, COMPUTE_BUDGET_PROGRAM_ID, CORE_PROGRAM_ID, CORE_PROGRAM_ID,
        ]);
        expect(isReptileTransaction(tx, wallet.publicKey.toBase58())).toBe(true);
    });
    it('updates the uri, then the Attributes plugin', () => {
        const { tx } = save();
        const [, , update, plugin] = tx.message.compiledInstructions;
        expect(text(update.data)).toContain('/89abcdef.json');
        expect(text(plugin.data)).toContain('Best Depth');
        expect(text(plugin.data)).not.toContain('89abcdef');
    });
    it('adds the plugin when the asset has none (a different instruction)', () => {
        const withPlugin = save().tx.message.compiledInstructions[3].data[0];
        const without = save({ hasAttributesPlugin: false }).tx.message.compiledInstructions[3].data[0];
        expect(without).not.toBe(withPlugin);
    });
    it('leaves out what does not change, and refuses an empty save', () => {
        expect(programIds(save({ uri: null }).tx)).toHaveLength(3);
        expect(programIds(save({ attributes: null }).tx)).toHaveLength(3);
        expect(() => save({ uri: null, attributes: null })).toThrow('nothing to save');
    });
    it('fits a 600 byte attribute list together with the uri', () => {
        expect(save({ attributes: listOfBytes(600) }).tx.serialize().length).toBeLessThanOrEqual(MAX_TX_BYTES);
        expect(() => save({ attributes: listOfBytes(1200) })).toThrow(TxTooLargeError);
        expect(maxListBytes((list) => save({ attributes: list }))).toBe(683);
    });
});

describe('partialSign', () => {
    it('signs for the server keys and leaves the fee payer slot empty', () => {
        const { tx, asset, authority } = mint();
        partialSign(tx, [asset, authority]);
        expect(tx.signatures[0].every((byte) => byte === 0)).toBe(true);
        expect(signatureValid(tx, 1)).toBe(true);
        expect(signatureValid(tx, 2)).toBe(true);
    });
    it('refuses to sign as the fee payer', () => {
        const { tx, wallet, asset, authority } = mint();
        expect(() => partialSign(tx, [wallet, asset, authority])).toThrow('fee payer');
    });
    it('refuses a transaction that needs someone else, or not all the given keys', () => {
        const { tx, asset, authority } = mint();
        expect(() => partialSign(tx, [authority])).toThrow('unexpected required signer');
        expect(() => partialSign(save().tx, [asset])).toThrow('unexpected required signer');
        const single = save();
        expect(() => partialSign(single.tx, [single.authority, key()])).toThrow('not required');
    });
});

describe('isReptileTransaction', () => {
    it('refuses anything that is not compute budget plus Core, paid by the wallet', () => {
        const { tx, wallet } = mint();
        expect(isReptileTransaction(tx, key().publicKey.toBase58())).toBe(false);
        const payer = key();
        const transfer = new VersionedTransaction(new TransactionMessage({
            payerKey: payer.publicKey, recentBlockhash: BLOCKHASH,
            instructions: [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: wallet.publicKey, lamports: 1 })],
        }).compileToLegacyMessage());
        expect(isReptileTransaction(transfer, payer.publicKey.toBase58())).toBe(false);
        const v0 = new VersionedTransaction(new TransactionMessage({
            payerKey: payer.publicKey, recentBlockhash: BLOCKHASH, instructions: [],
        }).compileToV0Message());
        expect(isReptileTransaction(v0, payer.publicKey.toBase58())).toBe(false);
    });
});
