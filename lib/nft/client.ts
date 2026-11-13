// The browser side of minting and saving, with no UI in it: ask the server
// for the transaction, check it, have the wallet sign it, send it, confirm it.
// The Mint panel and the Save button (a later card) sit on top of this.
//
//   const quote = await requestMint({ wallet, proofs, look });
//   // show quote.fee and quote.summary, let the player agree, then:
//   const signature = await signAndSend(quote, { publicKey, signTransaction }, connection);
//
// or in one call, with the agreement as a callback:
//
//   const done = await mintReptile({ wallet, proofs, look }, walletAdapter, connection,
//       (quote) => askThePlayer(quote.fee.total));
//
// Only @solana/web3.js is imported here (types aside), so the Metaplex
// packages stay out of the client bundle.
import { VersionedTransaction } from '@solana/web3.js';
import type { Fee, MintSummary, Prepared, SaveSummary } from './service';
import { isReptileTransaction } from './shape';

export type { Fee, MintSummary, Prepared, SaveSummary };

/** The look as the routes take it: the five layers and the background. */
export interface LookChoice {
    Back: string;
    Body: string;
    Clothes: string;
    Eye: string;
    Head: string;
    Background: string;
}

export interface MintRequest {
    /** The connected wallet's address (base58). */
    wallet: string;
    /** Signed proofs from /api/run/verify (the save's pendingProofs). */
    proofs: string[];
    look: LookChoice;
}

export interface SaveRequest {
    wallet: string;
    /** The reptile's asset address. */
    asset: string;
    proofs: string[];
    /** Null keeps the look the reptile has on chain. */
    look: LookChoice | null;
}

/**
 * Why a mint or save did not happen. `code` is the server's reason
 * (`goal_not_reached`, `already_holds`, `locked_trait`, `bad_proof`,
 * `wrong_wallet`, `expired_proof`, `proof_used`, `not_owner`,
 * `not_in_collection`, `asset_not_found`, `nothing_to_save`,
 * `insufficient_funds`, `simulation_failed`, `too_large`, `rate_limited`,
 * `nft_off`, `chain_unavailable`, `bad_request`) or one of the client's own:
 * `network` (the request failed), `bad_reply`, `unsafe_transaction` (the
 * transaction is not the shape a mint or save has; nothing was signed),
 * `no_wallet`, `declined` (the player said no), `wallet_changed_transaction`,
 * `send_failed`, `not_confirmed`.
 */
export class NftError extends Error {
    constructor(
        public readonly code: string,
        public readonly status: number | null = null,
        public readonly detail: string | null = null,
    ) {
        super(detail === null ? code : `${code}: ${detail}`);
        this.name = 'NftError';
    }
}

/** The part of a wallet adapter this needs (useWallet() fits). */
export interface WalletLike {
    publicKey: { toBase58(): string } | null;
    signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
}

/** The part of a web3.js Connection this needs. */
export interface ConnectionLike {
    sendRawTransaction(raw: Uint8Array, options?: { skipPreflight?: boolean; maxRetries?: number }): Promise<string>;
    confirmTransaction(
        strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
        commitment?: 'confirmed' | 'finalized',
    ): Promise<{ value: { err: unknown } }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFee(value: unknown): value is Fee {
    return isRecord(value) && ['network', 'rent', 'protocol', 'total'].every((k) => Number.isFinite(value[k]));
}

async function request(path: string, body: unknown, fetchImpl: typeof fetch): Promise<Prepared> {
    let response: Response;
    let reply: unknown;
    try {
        response = await fetchImpl(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        reply = await response.json();
    } catch {
        throw new NftError('network');
    }
    if (!response.ok) {
        const code = isRecord(reply) && typeof reply.error === 'string' ? reply.error : 'bad_reply';
        const detail = isRecord(reply) && typeof reply.detail === 'string' ? reply.detail : null;
        throw new NftError(code, response.status, detail);
    }
    if (!isRecord(reply) || typeof reply.tx !== 'string' || typeof reply.asset !== 'string'
        || typeof reply.blockhash !== 'string' || typeof reply.lastValidBlockHeight !== 'number'
        || !isFee(reply.fee) || !isRecord(reply.summary)) {
        throw new NftError('bad_reply', response.status);
    }
    return reply as unknown as Prepared;
}

/** Ask the server for a first-mint transaction. Nothing is signed or sent. */
export function requestMint(input: MintRequest, fetchImpl: typeof fetch = fetch): Promise<Prepared> {
    return request('/api/nft/mint', { wallet: input.wallet, proofs: input.proofs, look: input.look }, fetchImpl);
}

/** Ask the server for a save transaction. Nothing is signed or sent. */
export function requestSave(input: SaveRequest, fetchImpl: typeof fetch = fetch): Promise<Prepared> {
    return request(
        '/api/nft/save',
        { wallet: input.wallet, asset: input.asset, proofs: input.proofs, look: input.look },
        fetchImpl,
    );
}

/**
 * Have the wallet sign a prepared transaction, send it and wait until it is
 * confirmed. Returns the transaction signature. Before the wallet is asked,
 * the transaction is checked: it must be paid by this wallet and call only
 * the compute budget and Metaplex Core programs; anything else is refused
 * unsigned (`unsafe_transaction`).
 */
export async function signAndSend(
    prepared: Pick<Prepared, 'tx' | 'blockhash' | 'lastValidBlockHeight'>,
    wallet: WalletLike,
    connection: ConnectionLike,
): Promise<string> {
    if (wallet.publicKey === null || typeof wallet.signTransaction !== 'function') throw new NftError('no_wallet');
    let tx: VersionedTransaction;
    try {
        tx = VersionedTransaction.deserialize(Uint8Array.from(atob(prepared.tx), (ch) => ch.charCodeAt(0)));
    } catch {
        throw new NftError('bad_reply');
    }
    if (!isReptileTransaction(tx, wallet.publicKey.toBase58()) || tx.message.recentBlockhash !== prepared.blockhash) {
        throw new NftError('unsafe_transaction');
    }
    const message = tx.message.serialize();
    let signed: VersionedTransaction;
    try {
        signed = await wallet.signTransaction(tx);
    } catch {
        throw new NftError('declined');
    }
    // The server's signatures cover these exact bytes; a wallet that edits
    // the message (extra instructions) would make them invalid.
    const after = signed.message.serialize();
    if (after.length !== message.length || after.some((byte, i) => byte !== message[i])) {
        throw new NftError('wallet_changed_transaction');
    }
    let signature: string;
    try {
        signature = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 5 });
    } catch (error) {
        throw new NftError('send_failed', null, error instanceof Error ? error.message.slice(0, 200) : null);
    }
    let result: { value: { err: unknown } };
    try {
        result = await connection.confirmTransaction(
            { signature, blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight },
            'confirmed',
        );
    } catch {
        throw new NftError('not_confirmed', null, signature);
    }
    if (result.value.err !== null) throw new NftError('send_failed', null, signature);
    return signature;
}

export interface Done {
    signature: string;
    asset: string;
    fee: Fee;
    summary: Prepared['summary'];
}

/** Called with the server's quote before the wallet is asked; resolve false
 *  to stop (the helper then throws `declined`). */
export type Agree = (quote: Prepared) => boolean | Promise<boolean>;

async function run(quote: Prepared, wallet: WalletLike, connection: ConnectionLike, agree?: Agree): Promise<Done> {
    if (agree !== undefined && !(await agree(quote))) throw new NftError('declined');
    const signature = await signAndSend(quote, wallet, connection);
    return { signature, asset: quote.asset, fee: quote.fee, summary: quote.summary };
}

/** Request, (optionally) agree, sign, send and confirm a first mint. */
export async function mintReptile(
    input: MintRequest, wallet: WalletLike, connection: ConnectionLike, agree?: Agree, fetchImpl: typeof fetch = fetch,
): Promise<Done> {
    return run(await requestMint(input, fetchImpl), wallet, connection, agree);
}

/** Request, (optionally) agree, sign, send and confirm a save. */
export async function saveReptile(
    input: SaveRequest, wallet: WalletLike, connection: ConnectionLike, agree?: Agree, fetchImpl: typeof fetch = fetch,
): Promise<Done> {
    return run(await requestSave(input, fetchImpl), wallet, connection, agree);
}
