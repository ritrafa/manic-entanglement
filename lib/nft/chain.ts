// Everything the mint and save routes read from the chain, behind one small
// interface so the route logic can be tested without a network. The real
// implementation reads accounts straight from the RPC (authoritative, no
// indexer lag) and asks the DAS index only for the one-per-wallet check.
import {
    deserializeAssetV1, deserializeCollectionV1, type AssetV1, type CollectionV1,
} from '@metaplex-foundation/mpl-core';
import { lamports, publicKey, type RpcAccount, type Umi } from '@metaplex-foundation/umi';
import { Connection, PublicKey, type VersionedTransaction } from '@solana/web3.js';
import { CORE_PROGRAM_ID } from './shape';
import { offlineUmi, type Attribute } from './tx';

export interface AccountState {
    lamports: number;
    space: number;
}

export interface CollectionInfo {
    ref: CollectionV1;
    numMinted: number;
}

export interface AssetInfo {
    ref: AssetV1;
    owner: string;
    /** The collection the asset belongs to, or null when it has none. */
    collection: string | null;
    name: string;
    uri: string;
    /** The Attributes plugin's list, or null when the asset has no such plugin. */
    attributes: Attribute[] | null;
}

export interface Simulation {
    /** Null when the transaction would succeed. */
    err: unknown;
    logs: string[];
    units: number;
    /** The watched accounts after the transaction, in the order asked. */
    accounts: (AccountState | null)[];
}

export interface Chain {
    umi: Umi;
    genesisHash(): Promise<string>;
    collection(address: string): Promise<CollectionInfo | null>;
    asset(address: string): Promise<AssetInfo | null>;
    /** The addresses of the collection's assets this wallet owns. */
    reptilesOwnedBy(wallet: string, collection: string): Promise<string[]>;
    accounts(addresses: string[]): Promise<(AccountState | null)[]>;
    rentExempt(space: number): Promise<number>;
    latestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
    simulate(tx: VersionedTransaction, watch: string[]): Promise<Simulation>;
}

/** One of the two owner lookups could not answer (as opposed to "none"). */
class LookupUnavailable extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The asset ids in a DAS reply that belong to the collection, are owned by
 *  the wallet and are not burnt. Pure, defensive: anything may be missing. */
export function dasReptiles(items: unknown, wallet: string, collection: string): string[] {
    if (!Array.isArray(items)) return [];
    const found: string[] = [];
    for (const item of items) {
        if (!isRecord(item) || typeof item.id !== 'string' || item.burnt === true) continue;
        const grouping = Array.isArray(item.grouping) ? item.grouping : [];
        if (!grouping.some((g) => isRecord(g) && g.group_key === 'collection' && g.group_value === collection)) continue;
        const ownership = item.ownership;
        if (isRecord(ownership) && typeof ownership.owner === 'string' && ownership.owner !== wallet) continue;
        found.push(item.id);
    }
    return found;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
    const digits: number[] = [];
    for (const byte of bytes) {
        let carry = byte;
        for (let i = 0; i < digits.length; i += 1) {
            carry += digits[i] << 8;
            digits[i] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let text = '';
    for (const byte of bytes) {
        if (byte !== 0) break;
        text += '1';
    }
    for (let i = digits.length - 1; i >= 0; i -= 1) text += BASE58[digits[i]];
    return text;
}

function toRpcAccount(address: string, info: { data: Uint8Array; lamports: number; owner: PublicKey; executable: boolean }): RpcAccount {
    return {
        publicKey: publicKey(address),
        data: Uint8Array.from(info.data),
        executable: info.executable,
        owner: publicKey(info.owner.toBase58()),
        lamports: lamports(info.lamports),
    };
}

/** The chain as seen through one RPC endpoint. `fetchImpl` is only used for
 *  the DAS call; the rest goes through @solana/web3.js. */
export function rpcChain(rpcUrl: string, fetchImpl: typeof fetch = fetch): Chain {
    const connection = new Connection(rpcUrl, 'confirmed');
    const umi = offlineUmi(rpcUrl);
    let genesis: string | null = null;

    async function coreAccount(address: string): Promise<RpcAccount | null> {
        const info = await connection.getAccountInfo(new PublicKey(address));
        if (info === null || info.owner.toBase58() !== CORE_PROGRAM_ID) return null;
        return toRpcAccount(address, info);
    }

    /** DAS: the wallet's assets in the collection, from the index. */
    async function ownedByIndex(wallet: string, collection: string): Promise<string[]> {
        let reply: unknown;
        try {
            const response = await fetchImpl(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 'reptile-holder', method: 'getAssetsByOwner',
                    params: { ownerAddress: wallet, page: 1, limit: 1000 },
                }),
            });
            if (!response.ok) throw new LookupUnavailable();
            reply = await response.json();
        } catch {
            throw new LookupUnavailable();
        }
        if (!isRecord(reply) || reply.error !== undefined || !isRecord(reply.result)) throw new LookupUnavailable();
        return dasReptiles(reply.result.items, wallet, collection);
    }

    /** The same question asked of the accounts themselves: Core assets whose
     *  owner is the wallet and whose update authority is the collection. */
    async function ownedByAccounts(wallet: string, collection: string): Promise<string[]> {
        try {
            const group = new Uint8Array(33);
            group[0] = 2; // UpdateAuthority::Collection
            group.set(new PublicKey(collection).toBytes(), 1);
            const found = await connection.getProgramAccounts(new PublicKey(CORE_PROGRAM_ID), {
                dataSlice: { offset: 0, length: 0 },
                filters: [
                    { memcmp: { offset: 0, bytes: base58Encode(Uint8Array.from([1])) } }, // Key::AssetV1
                    { memcmp: { offset: 1, bytes: wallet } },
                    { memcmp: { offset: 33, bytes: base58Encode(group) } },
                ],
            });
            return found.map((entry) => entry.pubkey.toBase58());
        } catch {
            throw new LookupUnavailable();
        }
    }

    return {
        umi,
        async genesisHash() {
            if (genesis === null) genesis = await connection.getGenesisHash();
            return genesis;
        },
        async collection(address) {
            const account = await coreAccount(address);
            if (account === null) return null;
            try {
                const ref = deserializeCollectionV1(account);
                return { ref, numMinted: ref.numMinted };
            } catch {
                return null;
            }
        },
        async asset(address) {
            const account = await coreAccount(address);
            if (account === null) return null;
            let ref: AssetV1;
            try {
                ref = deserializeAssetV1(account);
            } catch {
                return null;
            }
            return {
                ref,
                owner: ref.owner,
                collection: ref.updateAuthority.type === 'Collection' ? (ref.updateAuthority.address ?? null) : null,
                name: ref.name,
                uri: ref.uri,
                attributes: ref.attributes
                    ? ref.attributes.attributeList.map(({ key, value }) => ({ key, value }))
                    : null,
            };
        },
        async reptilesOwnedBy(wallet, collection) {
            // Two independent answers: the DAS index (may lag a few seconds
            // behind a fresh mint) and the accounts themselves (some RPCs
            // refuse the scan). Either one finding a reptile is enough; the
            // wallet is clear only when at least one could answer.
            const [index, accounts] = await Promise.allSettled([
                ownedByIndex(wallet, collection), ownedByAccounts(wallet, collection),
            ]);
            if (index.status === 'rejected' && accounts.status === 'rejected') {
                throw new Error('holder lookup unavailable');
            }
            const found = new Set<string>();
            if (index.status === 'fulfilled') index.value.forEach((id) => found.add(id));
            if (accounts.status === 'fulfilled') accounts.value.forEach((id) => found.add(id));
            return [...found];
        },
        async accounts(addresses) {
            const infos = await connection.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)));
            return infos.map((info) => (info === null ? null : { lamports: info.lamports, space: info.data.length }));
        },
        rentExempt(space) {
            return connection.getMinimumBalanceForRentExemption(space);
        },
        async latestBlockhash() {
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            return { blockhash, lastValidBlockHeight };
        },
        async simulate(tx, watch) {
            const { value } = await connection.simulateTransaction(tx, {
                sigVerify: false,
                replaceRecentBlockhash: false,
                commitment: 'confirmed',
                accounts: { encoding: 'base64', addresses: watch },
            });
            return {
                err: value.err,
                logs: value.logs ?? [],
                units: value.unitsConsumed ?? 0,
                accounts: (value.accounts ?? []).map((account) => (account === null ? null : {
                    lamports: account.lamports,
                    space: Buffer.from(account.data[0], 'base64').length,
                })),
            };
        },
    };
}
