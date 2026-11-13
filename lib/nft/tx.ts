// Pure transaction builders for the Entangled Reptiles (Metaplex Core): the
// first mint and the save. Nothing here reads the network, the clock or the
// environment: every input is an argument, and the result is an unsigned
// transaction whose only instructions are the compute budget pair and the
// Core instructions built below. Signing is a separate, explicit step
// (partialSign) and only ever runs on a transaction built here.
import {
    addPlugin, create, mplCore, update, updatePlugin, MPL_CORE_PROGRAM_ID,
} from '@metaplex-foundation/mpl-core';
import {
    createNoopSigner, publicKey, transactionBuilder,
    type Instruction, type TransactionBuilder, type Umi,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Keypair, VersionedMessage, VersionedTransaction } from '@solana/web3.js';
import { COMPUTE_BUDGET_PROGRAM_ID, CORE_PROGRAM_ID } from './shape';

export type Attribute = { key: string; value: string };

if (CORE_PROGRAM_ID !== MPL_CORE_PROGRAM_ID) throw new Error('Core program id mismatch');

/** The largest serialized transaction the network accepts. */
export const MAX_TX_BYTES = 1232;
/** Lamports per signature (the base network fee). */
export const LAMPORTS_PER_SIGNATURE = 5000;

/** The compute budget a transaction asks for: a unit limit and a price in
 *  micro-lamports per unit (the priority fee is limit x price). */
export interface Priority {
    unitLimit: number;
    microLamportsPerUnit: number;
}
/** A modest priority fee: about 0.000002 SOL on a 100,000 unit transaction. */
export const MICROLAMPORTS_PER_UNIT = 20_000;
/** The limit used for the first, unsigned simulation that measures what a
 *  transaction really needs. */
export const PROBE_UNIT_LIMIT = 400_000;

/** The budget for a transaction that used `units` in simulation: a 30%
 *  margin plus a little, never above the probe limit. Core's cost grows with
 *  the account size, so a fixed number would be either wasteful or too low. */
export function priorityFor(units: number): Priority {
    const wanted = Math.ceil(Math.max(0, units) * 1.3) + 5_000;
    return { unitLimit: Math.min(PROBE_UNIT_LIMIT, wanted), microLamportsPerUnit: MICROLAMPORTS_PER_UNIT };
}

export class TxTooLargeError extends Error {
    constructor(public readonly bytes: number | null) {
        super(`transaction is ${bytes ?? 'more than the limit of'} bytes; the limit is ${MAX_TX_BYTES}`);
    }
}

type CollectionRef = NonNullable<Parameters<typeof create>[1]['collection']>;
type AssetRef = Parameters<typeof update>[1]['asset'];

/** A umi context that never talks to the network unless a caller uses its
 *  rpc on purpose: the builders only use its program table and its
 *  transaction factory. */
export function offlineUmi(endpoint = 'http://127.0.0.1:1'): Umi {
    return createUmi(endpoint).use(mplCore());
}

function u32le(value: number): number[] {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function u64le(value: number): number[] {
    const big = BigInt(value);
    return Array.from({ length: 8 }, (_, i) => Number((big >> BigInt(8 * i)) & BigInt(0xff)));
}

/** SetComputeUnitLimit then SetComputeUnitPrice, encoded by hand so no
 *  further package is needed. */
export function computeBudgetInstructions(priority: Priority): Instruction[] {
    if (!Number.isInteger(priority.unitLimit) || priority.unitLimit <= 0 || priority.unitLimit > 1_400_000) {
        throw new Error('bad compute unit limit');
    }
    if (!Number.isInteger(priority.microLamportsPerUnit) || priority.microLamportsPerUnit < 0
        || priority.microLamportsPerUnit > 1_000_000) {
        throw new Error('bad compute unit price');
    }
    const programId = publicKey(COMPUTE_BUDGET_PROGRAM_ID);
    return [
        { programId, keys: [], data: Uint8Array.from([2, ...u32le(priority.unitLimit)]) },
        { programId, keys: [], data: Uint8Array.from([3, ...u64le(priority.microLamportsPerUnit)]) },
    ];
}

/** The network fee of a transaction with this many signatures and this
 *  budget: the base fee plus the priority fee, in lamports. */
export function networkFee(signatures: number, priority: Priority): number {
    return signatures * LAMPORTS_PER_SIGNATURE
        + Math.ceil((priority.unitLimit * priority.microLamportsPerUnit) / 1_000_000);
}

function withBudget(builder: TransactionBuilder, priority: Priority): TransactionBuilder {
    const budget = computeBudgetInstructions(priority).map((instruction) => ({
        instruction, signers: [], bytesCreatedOnChain: 0,
    }));
    return transactionBuilder(budget).add(builder);
}

/** Turn a builder into an unsigned legacy transaction paid by `wallet`. Every
 *  signature slot is empty (zeros) until partialSign or the wallet fills it. */
function finish(umi: Umi, builder: TransactionBuilder, wallet: string, blockhash: string): VersionedTransaction {
    const ready = builder
        .setFeePayer(createNoopSigner(publicKey(wallet)))
        .setBlockhash(blockhash)
        .useLegacyVersion();
    let tx: VersionedTransaction;
    try {
        tx = new VersionedTransaction(VersionedMessage.deserialize(ready.build(umi).serializedMessage));
        tx.serialize();
    } catch (error) {
        // The serializers write into a packet-sized buffer and overflow it.
        if (error instanceof RangeError) throw new TxTooLargeError(null);
        throw error;
    }
    const bytes = tx.serialize().length;
    if (bytes > MAX_TX_BYTES) throw new TxTooLargeError(bytes);
    return tx;
}

export interface MintInput {
    /** The player: owner of the new asset and the fee payer. */
    wallet: string;
    /** The new asset's address; its keypair must sign. */
    asset: string;
    /** The game signer, a collection Update Delegate; must sign. */
    authority: string;
    collection: CollectionRef;
    name: string;
    uri: string;
    attributes: readonly Attribute[];
    blockhash: string;
    priority: Priority;
}

/** The first mint: one Core `create` into the collection, the asset owned
 *  and paid for by the player, with the Attributes plugin set. */
export function buildMintTransaction(umi: Umi, input: MintInput): VersionedTransaction {
    const builder = create(umi, {
        asset: createNoopSigner(publicKey(input.asset)),
        collection: input.collection,
        authority: createNoopSigner(publicKey(input.authority)),
        payer: createNoopSigner(publicKey(input.wallet)),
        owner: publicKey(input.wallet),
        name: input.name,
        uri: input.uri,
        plugins: [{ type: 'Attributes', attributeList: input.attributes.map(({ key, value }) => ({ key, value })) }],
    });
    return finish(umi, withBudget(builder, input.priority), input.wallet, input.blockhash);
}

export interface SaveInput {
    /** The player: the asset's current owner and the fee payer. */
    wallet: string;
    asset: AssetRef;
    /** The game signer, a collection Update Delegate; must sign. */
    authority: string;
    collection: CollectionRef;
    /** The new uri, or null to leave the uri as it is. */
    uri: string | null;
    /** The full new attribute list, or null to leave the plugin as it is. */
    attributes: readonly Attribute[] | null;
    /** Whether the asset already carries the Attributes plugin (update it)
     *  or not (add it). */
    hasAttributesPlugin: boolean;
    blockhash: string;
    priority: Priority;
}

/** A save: Core `update` for the uri, then `updatePlugin` (or `addPlugin`
 *  when the asset has none) for the Attributes list. */
export function buildSaveTransaction(umi: Umi, input: SaveInput): VersionedTransaction {
    if (input.uri === null && input.attributes === null) throw new Error('nothing to save');
    const authority = createNoopSigner(publicKey(input.authority));
    const payer = createNoopSigner(publicKey(input.wallet));
    let builder = transactionBuilder();
    if (input.uri !== null) {
        builder = builder.add(update(umi, {
            asset: input.asset, collection: input.collection, uri: input.uri, authority, payer,
        }));
    }
    if (input.attributes !== null) {
        const plugin = {
            type: 'Attributes' as const,
            attributeList: input.attributes.map(({ key, value }) => ({ key, value })),
        };
        const accounts = {
            asset: input.asset.publicKey, collection: input.collection.publicKey, authority, payer,
        };
        builder = builder.add(input.hasAttributesPlugin
            ? updatePlugin(umi, { ...accounts, plugin })
            : addPlugin(umi, { ...accounts, plugin }));
    }
    return finish(umi, withBudget(builder, input.priority), input.wallet, input.blockhash);
}

/**
 * Sign a transaction built above with the server-held keys (the game signer,
 * and the new asset's key on a mint). The fee payer's slot stays empty for
 * the wallet. Refuses a transaction that needs a signature from anyone but
 * the fee payer and the given keys, or that does not need one of them.
 */
export function partialSign(tx: VersionedTransaction, signers: readonly Keypair[]): VersionedTransaction {
    const required = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures);
    const ours = new Set(signers.map((signer) => signer.publicKey.toBase58()));
    const payer = required[0].toBase58();
    if (ours.has(payer)) throw new Error('a server key must never be the fee payer');
    for (const key of required.slice(1)) {
        if (!ours.has(key.toBase58())) throw new Error('unexpected required signer');
    }
    if (required.length !== signers.length + 1) throw new Error('a given signer is not required');
    tx.sign([...signers]);
    return tx;
}

export function toBase64(tx: VersionedTransaction): string {
    return Buffer.from(tx.serialize()).toString('base64');
}
