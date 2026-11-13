// Server-only configuration for the mint and save routes. Everything comes
// from process.env; the signer secret is parsed here and never logged, never
// put into an error message and never returned to a caller of the routes.
import { Keypair, PublicKey } from '@solana/web3.js';
import { REPTILE_COLLECTION } from '@/lib/reptile';

export type NftCluster = 'devnet' | 'mainnet';

/** Each cluster's genesis hash: the routes refuse to work when the RPC
 *  answers for a different cluster than NFT_CLUSTER names. */
export const GENESIS_HASH: Record<NftCluster, string> = {
    mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

/** Where every reptile's metadata lives (E71 serves it). */
export const METADATA_BASE = 'https://www.manic-entanglement.com/api/reptile';

export interface NftConfig {
    cluster: NftCluster;
    rpcUrl: string;
    /** The collection assets are minted into and saved in. */
    collection: string;
    /** The game signer: a collection Update Delegate. Signs only transactions
     *  this server built itself. */
    signer: Keypair;
}

type Env = Record<string, string | undefined>;

function httpsUrl(raw: string | undefined): string | null {
    if (typeof raw !== 'string') return null;
    const url = raw.trim();
    return url.startsWith('https://') ? url : null;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(text: string): Uint8Array | null {
    const bytes: number[] = [];
    for (const ch of text) {
        let carry = BASE58.indexOf(ch);
        if (carry < 0) return null;
        for (let i = 0; i < bytes.length; i += 1) {
            carry += bytes[i] * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (const ch of text) {
        if (ch !== '1') break;
        bytes.push(0);
    }
    return Uint8Array.from(bytes.reverse());
}

/** The game signer from its secret: the JSON array `solana-keygen` writes
 *  (64 numbers) or the same 64 bytes as base58. Null for anything else; the
 *  reason is never reported, so nothing about the secret can leak. */
export function parseSignerKey(raw: string | undefined): Keypair | null {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (text === '') return null;
    try {
        let bytes: Uint8Array | null = null;
        if (text.startsWith('[')) {
            const list: unknown = JSON.parse(text);
            if (!Array.isArray(list) || list.length !== 64) return null;
            if (!list.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return null;
            bytes = Uint8Array.from(list as number[]);
        } else {
            bytes = base58Decode(text);
        }
        if (bytes === null || bytes.length !== 64) return null;
        // fromSecretKey checks that the public half matches the secret half.
        return Keypair.fromSecretKey(bytes);
    } catch {
        return null;
    }
}

/** A base58 public key (32 bytes), or null. */
export function parseAddress(value: unknown): PublicKey | null {
    if (typeof value !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return null;
    try {
        const key = new PublicKey(value);
        return key.toBase58() === value ? key : null;
    } catch {
        return null;
    }
}

/**
 * The collection the game looks for and mints into (E72): `NFT_COLLECTION`
 * on devnet, so a test run works against a test collection, and the real
 * `REPTILE_COLLECTION` everywhere else - mainnet behaviour never changes, and
 * a stray variable cannot redirect it. A devnet override that is not a base58
 * address reads as no override. Server-side readers (lib/server/das.ts, the
 * reptile and run/start routes) all ask this one function.
 */
export function collectionAddress(env: Env = process.env): string {
    if (env.NFT_CLUSTER === 'devnet') {
        const override = parseAddress(env.NFT_COLLECTION);
        if (override !== null) return override.toBase58();
    }
    return REPTILE_COLLECTION;
}

/**
 * The routes' configuration, or null when any required variable is missing or
 * malformed (the routes then answer 503):
 *   GAME_SIGNER_KEY  the game signer secret
 *   SOLANA_RPC_URL   the server-side RPC (fallback: NEXT_PUBLIC_RPC_URL)
 *   NFT_CLUSTER      "devnet" or "mainnet"
 * On devnet only, NFT_COLLECTION may name a test collection; mainnet always
 * uses the real collection, so a stray variable cannot redirect real mints.
 */
export function readNftConfig(env: Env = process.env): NftConfig | null {
    const cluster = env.NFT_CLUSTER;
    if (cluster !== 'devnet' && cluster !== 'mainnet') return null;
    const rpcUrl = httpsUrl(env.SOLANA_RPC_URL) ?? httpsUrl(env.NEXT_PUBLIC_RPC_URL);
    if (rpcUrl === null) return null;
    const signer = parseSignerKey(env.GAME_SIGNER_KEY);
    if (signer === null) return null;
    let collection = REPTILE_COLLECTION;
    if (cluster === 'devnet') {
        const override = parseAddress(env.NFT_COLLECTION);
        if (override === null) return null;
        collection = override.toBase58();
    }
    return { cluster, rpcUrl, collection, signer };
}
