// The mint and save route logic as plain functions: every check is made here,
// on the server, from the chain plus the signed proofs. Nothing the client
// sends is trusted beyond "this wallet asks": not the depth, not the look, not
// the attributes, and never a transaction. The functions build the exact
// transaction themselves, sign it with the server-held keys, simulate it, and
// hand it back for the wallet to sign and send.
import { createHmac } from 'node:crypto';
import { Keypair, type VersionedTransaction } from '@solana/web3.js';
import { TRAITS, LAYER_ORDER } from '@/game/sprite';
import { FREE_TRAITS } from '@/game/wardrobe';
import {
    decodeAttributes, encodeAttributes, mergeProgress, progressVersion, readProof,
    type ChosenLook, type ProofPayload,
} from './_pending';
import type { Chain, Simulation } from './chain';
import { GENESIS_HASH, METADATA_BASE, parseAddress, type NftConfig } from './config';
import { isReptileTransaction } from './shape';
import {
    MICROLAMPORTS_PER_UNIT, PROBE_UNIT_LIMIT, TxTooLargeError, buildMintTransaction, buildSaveTransaction,
    networkFee, partialSign, priorityFor, toBase64, type Attribute, type Priority,
} from './tx';

/** The depth a verified run must reach before its wallet may mint (Q-C). */
export const MINT_GOAL_DEPTH = 8;
/** Proofs older than this are refused. */
export const PROOF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** A proof may not claim to come from the future (clock skew allowance). */
const PROOF_FUTURE_SLACK_MS = 5 * 60 * 1000;
export const MAX_PROOFS = 50;
export const MAX_PROOF_CHARS = 8192;

export interface Fee {
    /** Signature fees plus the priority fee. */
    network: number;
    /** The rent deposit the asset account takes (refunded on burn). On a
     *  save: only what the account grows by; negative when it shrinks. */
    rent: number;
    /** The Metaplex Core protocol fee. */
    protocol: number;
    total: number;
}

export interface Prepared {
    /** The transaction, base64: signed by the server's keys, waiting for the
     *  wallet's signature as fee payer. */
    tx: string;
    asset: string;
    blockhash: string;
    lastValidBlockHeight: number;
    /** Lamports, estimated by simulating this exact transaction. */
    fee: Fee;
    summary: MintSummary | SaveSummary;
}

export interface MintSummary {
    kind: 'mint';
    name: string;
    uri: string;
    attributes: Attribute[];
    /** How many verified runs the starting progress includes. */
    applied: number;
}

export interface SaveSummary {
    kind: 'save';
    applied: number;
    /** Attribute changes; `from` is null for a new key. */
    changes: { key: string; from: string | null; to: string }[];
    uri: { from: string; to: string } | null;
}

export type Result =
    | { status: 200; body: Prepared }
    | { status: number; body: { error: string; detail?: string } };

export interface Deps {
    config: NftConfig;
    chain: Chain;
    now: () => number;
}

function refuse(status: number, error: string, detail?: string): Result {
    return { status, body: detail === undefined ? { error } : { error, detail } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read and check the proofs: every one must be signed by this server, bound
 *  to this wallet and under 30 days old. Duplicates collapse. */
function readProofs(raw: unknown, wallet: string, now: number): ProofPayload[] | Result {
    if (!Array.isArray(raw) || raw.length > MAX_PROOFS) return refuse(400, 'bad_request', 'proofs');
    const byTime = new Map<number, ProofPayload>();
    for (const text of raw) {
        if (typeof text !== 'string' || text.length > MAX_PROOF_CHARS) return refuse(400, 'bad_proof');
        const proof = readProof(text);
        if (proof === null) return refuse(400, 'bad_proof');
        if (proof.wallet !== wallet) return refuse(403, 'wrong_wallet');
        const { issuedAt } = proof;
        if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt)) return refuse(400, 'bad_proof');
        if (issuedAt > now + PROOF_FUTURE_SLACK_MS || now - issuedAt >= PROOF_MAX_AGE_MS) {
            return refuse(400, 'expired_proof');
        }
        if (!isRecord(proof.tally)) return refuse(400, 'bad_proof');
        byTime.set(issuedAt, proof);
    }
    return [...byTime.values()].sort((a, b) => a.issuedAt - b.issuedAt);
}

/** The look as the client sent it: five layer names and a background, all
 *  strings naming real traits. On a save, a layer may also repeat the value
 *  the asset already has on chain (`current`), even one the current art does
 *  not know: such a value is kept, never rewritten. Null for anything else. */
function readLook(raw: unknown, current: Record<string, string> = {}): ChosenLook | null {
    if (!isRecord(raw)) return null;
    const look: Record<string, string> = {};
    for (const layer of LAYER_ORDER) {
        const trait = raw[layer];
        if (typeof trait !== 'string') return null;
        if (!TRAITS[layer].includes(trait) && trait !== current[layer]) return null;
        look[layer] = trait;
    }
    if (typeof raw.Background !== 'string' || raw.Background.length > 32) return null;
    look.Background = raw.Background;
    return look as ChosenLook;
}

/** A first mint may wear only the free starter traits (Q23), nothing where a
 *  layer has no free trait, on the standard Void background (Q25). */
export function isStarterLook(look: ChosenLook): boolean {
    if (look.Background !== 'Void') return false;
    return LAYER_ORDER.every((layer) => {
        const trait = look[layer];
        if (FREE_TRAITS[layer]?.includes(trait)) return true;
        return trait === 'None' && TRAITS[layer].includes('None');
    });
}

/**
 * The new asset's keypair, derived from the game signer's secret, the wallet
 * and the proof that earns the mint. So one proof can mint one asset: a
 * second mint with the same proof lands on the same address and the chain
 * refuses it (also when two requests race). The key only ever signs its own
 * creation; it has no power over the asset afterwards.
 */
export function mintAssetKeypair(signer: Keypair, wallet: string, issuedAt: number): Keypair {
    const seed = createHmac('sha256', signer.secretKey.slice(0, 32))
        .update(`manic-entanglement:mint-asset:v1\n${wallet}\n${issuedAt}`)
        .digest();
    return Keypair.fromSeed(seed);
}

export function metadataUri(asset: string, version: string): string {
    return `${METADATA_BASE}/${asset}/${version}.json`;
}

async function clusterProblem({ config, chain }: Deps): Promise<Result | null> {
    if (await chain.genesisHash() !== GENESIS_HASH[config.cluster]) return refuse(503, 'wrong_cluster');
    return null;
}

function simulationRefusal(sim: Simulation, walletLamports: number): Result {
    const text = `${JSON.stringify(sim.err)} ${sim.logs.join(' ')}`;
    if (walletLamports === 0 || /AccountNotFound|InsufficientFunds|insufficient lamports/i.test(text)) {
        return refuse(402, 'insufficient_funds');
    }
    if (/already in use/i.test(text)) return refuse(409, 'proof_used');
    return refuse(400, 'simulation_failed', sim.logs.slice(-3).join(' | ').slice(0, 400));
}

/** The unit limit a built transaction asks for (its first instruction). */
function unitLimitOf(tx: VersionedTransaction): number {
    const data = tx.message.compiledInstructions[0].data;
    return (data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24)) >>> 0;
}

/**
 * Build, sign (server keys only), simulate and price a transaction.
 * `build` is one of this module's own calls into lib/nft/tx.ts. It runs
 * twice: once unsigned with a generous compute limit to measure what the
 * transaction needs, then with the fitted limit; only that second, final
 * transaction is signed.
 */
async function finalize(
    deps: Deps,
    build: (priority: Priority) => VersionedTransaction,
    signers: Keypair[],
    wallet: string,
    asset: string,
    isMint: boolean,
): Promise<{ tx: string; fee: Fee } | Result> {
    const watch = [wallet, asset];
    const before = await deps.chain.accounts(watch);
    const walletBefore = before[0]?.lamports ?? 0;
    const assetBefore = before[1]?.lamports ?? 0;
    let tx: VersionedTransaction;
    try {
        const probe = await deps.chain.simulate(
            build({ unitLimit: PROBE_UNIT_LIMIT, microLamportsPerUnit: MICROLAMPORTS_PER_UNIT }), watch,
        );
        if (probe.err !== null) return simulationRefusal(probe, walletBefore);
        tx = build(priorityFor(probe.units));
    } catch (error) {
        if (error instanceof TxTooLargeError) return refuse(422, 'too_large');
        throw error;
    }
    // The last gate before the game signer signs: by shape the transaction
    // can only be compute budget + Core, paid by the wallet.
    if (!isReptileTransaction(tx, wallet)) return refuse(500, 'internal');
    partialSign(tx, signers);
    const sim = await deps.chain.simulate(tx, watch);
    if (sim.err !== null) return simulationRefusal(sim, walletBefore);
    const network = networkFee(signers.length + 1, {
        unitLimit: unitLimitOf(tx), microLamportsPerUnit: MICROLAMPORTS_PER_UNIT,
    });
    // The simulated balance already has the network fee taken off.
    const walletAfter = sim.accounts[0]?.lamports ?? walletBefore;
    const assetAfter = sim.accounts[1];
    const assetGrew = (assetAfter?.lamports ?? assetBefore) - assetBefore;
    const paid = walletBefore - walletAfter - network;
    // Mint: the asset account holds its rent deposit plus the Core fee.
    // Save: the account's growth is all rent (negative when it shrinks).
    let rent = assetGrew;
    if (isMint && assetAfter) rent = Math.min(paid, await deps.chain.rentExempt(assetAfter.space));
    return { tx: toBase64(tx), fee: { network, rent, protocol: paid - rent, total: network + paid } };
}

function isResult(value: unknown): value is Result {
    return isRecord(value) && typeof value.status === 'number' && isRecord(value.body);
}

/** POST /api/nft/mint, body { wallet, proofs, look }. */
export async function prepareMint(body: unknown, deps: Deps): Promise<Result> {
    if (!isRecord(body)) return refuse(400, 'bad_request');
    const walletKey = parseAddress(body.wallet);
    if (walletKey === null) return refuse(400, 'bad_request', 'wallet');
    const wallet = walletKey.toBase58();
    const signer = deps.config.signer;
    if (wallet === signer.publicKey.toBase58()) return refuse(400, 'bad_request', 'wallet');

    const proofs = readProofs(body.proofs, wallet, deps.now());
    if (isResult(proofs)) return proofs;
    const earned = proofs.filter((proof) => Number(proof.tally.depth) >= MINT_GOAL_DEPTH);
    if (earned.length === 0) return refuse(403, 'goal_not_reached');

    const look = readLook(body.look);
    if (look === null) return refuse(400, 'bad_look');
    if (!isStarterLook(look)) return refuse(400, 'locked_trait');

    const wrong = await clusterProblem(deps);
    if (wrong) return wrong;
    const collection = await deps.chain.collection(deps.config.collection);
    if (collection === null) return refuse(503, 'collection_missing');
    const held = await deps.chain.reptilesOwnedBy(wallet, deps.config.collection);
    if (held.length > 0) return refuse(409, 'already_holds');

    const { progress, applied } = mergeProgress(decodeAttributes([]), proofs, look);
    if (LAYER_ORDER.some((layer) => progress.look[layer] !== look[layer]) || progress.look.Background !== 'Void') {
        return refuse(400, 'locked_trait');
    }
    const attributes = encodeAttributes(progress);

    // One asset per earning proof: take the first whose address is still free.
    const candidates = earned.map((proof) => mintAssetKeypair(signer, wallet, proof.issuedAt));
    const taken = await deps.chain.accounts(candidates.map((kp) => kp.publicKey.toBase58()));
    const assetKeypair = candidates.find((_, i) => taken[i] === null);
    if (assetKeypair === undefined) return refuse(409, 'proof_used');
    const asset = assetKeypair.publicKey.toBase58();

    const name = `Entangled Reptile #${collection.numMinted + 1}`;
    const uri = metadataUri(asset, progressVersion(progress));
    const { blockhash, lastValidBlockHeight } = await deps.chain.latestBlockhash();
    const done = await finalize(deps, (priority) => buildMintTransaction(deps.chain.umi, {
        wallet, asset, authority: signer.publicKey.toBase58(), collection: collection.ref,
        name, uri, attributes, blockhash, priority,
    }), [assetKeypair, signer], wallet, asset, true);
    if (isResult(done)) return done;
    return {
        status: 200,
        body: {
            ...done, asset, blockhash, lastValidBlockHeight,
            summary: { kind: 'mint', name, uri, attributes, applied },
        },
    };
}

function sameList(a: readonly Attribute[], b: readonly Attribute[]): boolean {
    return a.length === b.length && a.every((entry, i) => entry.key === b[i].key && entry.value === b[i].value);
}

function listChanges(from: readonly Attribute[], to: readonly Attribute[]): SaveSummary['changes'] {
    const before = new Map(from.map((entry) => [entry.key, entry.value]));
    const changes: SaveSummary['changes'] = [];
    for (const { key, value } of to) {
        const old = before.get(key);
        if (old !== value) changes.push({ key, from: old ?? null, to: value });
    }
    return changes;
}

/** POST /api/nft/save, body { wallet, asset, proofs, look }. `look` may be
 *  null to keep the look the asset has. */
export async function prepareSave(body: unknown, deps: Deps): Promise<Result> {
    if (!isRecord(body)) return refuse(400, 'bad_request');
    const walletKey = parseAddress(body.wallet);
    const assetKey = parseAddress(body.asset);
    if (walletKey === null) return refuse(400, 'bad_request', 'wallet');
    if (assetKey === null) return refuse(400, 'bad_request', 'asset');
    const wallet = walletKey.toBase58();
    const asset = assetKey.toBase58();
    const signer = deps.config.signer;
    if (wallet === signer.publicKey.toBase58()) return refuse(400, 'bad_request', 'wallet');

    const proofs = readProofs(body.proofs, wallet, deps.now());
    if (isResult(proofs)) return proofs;
    if (body.look !== undefined && body.look !== null && !isRecord(body.look)) return refuse(400, 'bad_look');

    const wrong = await clusterProblem(deps);
    if (wrong) return wrong;
    const collection = await deps.chain.collection(deps.config.collection);
    if (collection === null) return refuse(503, 'collection_missing');
    const onChain = await deps.chain.asset(asset);
    if (onChain === null) return refuse(404, 'asset_not_found');
    if (onChain.collection !== deps.config.collection) return refuse(403, 'not_in_collection');
    if (onChain.owner !== wallet) return refuse(403, 'not_owner');

    const current = onChain.attributes ?? [];
    let look: ChosenLook | null = null;
    if (isRecord(body.look)) {
        look = readLook(body.look, Object.fromEntries(current.map((entry) => [entry.key, entry.value])));
        if (look === null) return refuse(400, 'bad_look');
    }
    const { progress, applied } = mergeProgress(decodeAttributes(current), proofs, look);
    // A look the merged progress has not unlocked is refused, not dropped
    // silently: the player would otherwise pay for a save that ignores it.
    if (look !== null && (LAYER_ORDER.some((layer) => progress.look[layer] !== look[layer])
        || progress.look.Background !== look.Background)) {
        return refuse(400, 'locked_trait');
    }
    // Unknown keys the asset carries (old holders, other tools) are kept.
    const next = encodeAttributes(progress, current);
    const uri = metadataUri(asset, progressVersion(progress));
    const attributesChanged = onChain.attributes === null || !sameList(current, next);
    const uriChanged = onChain.uri !== uri;
    if (!attributesChanged && !uriChanged) return refuse(409, 'nothing_to_save');

    const { blockhash, lastValidBlockHeight } = await deps.chain.latestBlockhash();
    const done = await finalize(deps, (priority) => buildSaveTransaction(deps.chain.umi, {
        wallet, asset: onChain.ref, authority: signer.publicKey.toBase58(), collection: collection.ref,
        uri: uriChanged ? uri : null,
        attributes: attributesChanged ? next : null,
        hasAttributesPlugin: onChain.attributes !== null,
        blockhash, priority,
    }), [signer], wallet, asset, false);
    if (isResult(done)) return done;
    return {
        status: 200,
        body: {
            ...done, asset, blockhash, lastValidBlockHeight,
            summary: {
                kind: 'save', applied,
                changes: attributesChanged ? listChanges(current, next) : [],
                uri: uriChanged ? { from: onChain.uri, to: uri } : null,
            },
        },
    };
}
