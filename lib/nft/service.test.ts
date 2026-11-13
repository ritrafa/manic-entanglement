import { Keypair, VersionedTransaction } from '@solana/web3.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeAttributes, encodeAttributes, mergeProgress, progressVersion } from './_pending';
import { GENESIS_HASH, METADATA_BASE } from './config';
import {
    MINT_GOAL_DEPTH, PROOF_MAX_AGE_MS, isStarterLook, mintAssetKeypair, prepareMint, prepareSave,
    type Prepared, type Result,
} from './service';
import { COMPUTE_BUDGET_PROGRAM_ID, CORE_PROGRAM_ID, isReptileTransaction, programIds } from './shape';
import { NOW, assetInfo, proof, proofPayload, signatureValid, starterLook, testDeps } from './testkit';

const SECRET = 'test-secret-for-proofs';
let savedSecret: string | undefined;
beforeAll(() => {
    savedSecret = process.env.RUN_TOKEN_SECRET;
    process.env.RUN_TOKEN_SECRET = SECRET;
});
afterAll(() => {
    if (savedSecret === undefined) delete process.env.RUN_TOKEN_SECRET;
    else process.env.RUN_TOKEN_SECRET = savedSecret;
});

const T = NOW - 60_000;
const error = (result: Result) => ('error' in result.body ? result.body.error : null);
function ok(result: Result): Prepared {
    if (result.status !== 200 || !('tx' in result.body)) throw new Error(`refused: ${JSON.stringify(result.body)}`);
    return result.body;
}
const decode = (prepared: Prepared) => VersionedTransaction.deserialize(Buffer.from(prepared.tx, 'base64'));
const text = (data: Uint8Array) => Buffer.from(data).toString('latin1');

describe('prepareMint: refusals', () => {
    it('refuses a malformed body or wallet', async () => {
        const { deps, wallet } = testDeps();
        const W = wallet.publicKey.toBase58();
        expect((await prepareMint(null, deps)).status).toBe(400);
        expect((await prepareMint({ wallet: 'nope', proofs: [], look: starterLook() }, deps)).status).toBe(400);
        expect((await prepareMint({ wallet: W, proofs: 'x', look: starterLook() }, deps)).status).toBe(400);
        expect((await prepareMint({ wallet: W, proofs: Array(51).fill('x'), look: starterLook() }, deps)).status).toBe(400);
        const self = deps.config.signer.publicKey.toBase58();
        expect((await prepareMint({ wallet: self, proofs: [proof(self, T)], look: starterLook() }, deps)).status).toBe(400);
    });
    it('refuses a bad proof: garbage, tampered, or signed with another secret', async () => {
        const { deps, wallet, chain } = testDeps();
        const W = wallet.publicKey.toBase58();
        const good = proof(W, T);
        const [body, mac] = good.split('.');
        const forgedBody = Buffer.from(JSON.stringify(proofPayload(W, T, { depth: 99 }))).toString('base64url');
        process.env.RUN_TOKEN_SECRET = 'another-secret';
        const foreign = proof(W, T);
        process.env.RUN_TOKEN_SECRET = SECRET;
        for (const bad of ['garbage', `${forgedBody}.${mac}`, `${body}.AAAA`, foreign, 42, 'x'.repeat(9000)]) {
            const result = await prepareMint({ wallet: W, proofs: [good, bad], look: starterLook() }, deps);
            expect([result.status, error(result)]).toEqual([400, 'bad_proof']);
        }
        expect(chain.simulated).toHaveLength(0);
    });
    it('refuses a proof made for another wallet', async () => {
        const { deps, wallet } = testDeps();
        const other = Keypair.generate().publicKey.toBase58();
        const result = await prepareMint({ wallet: wallet.publicKey.toBase58(), proofs: [proof(other, T)], look: starterLook() }, deps);
        expect([result.status, error(result)]).toEqual([403, 'wrong_wallet']);
    });
    it('refuses a proof 30 days old or from the future', async () => {
        const { deps, wallet } = testDeps();
        const W = wallet.publicKey.toBase58();
        for (const issuedAt of [NOW - PROOF_MAX_AGE_MS, NOW - PROOF_MAX_AGE_MS - 1, NOW + 10 * 60_000]) {
            const result = await prepareMint({ wallet: W, proofs: [proof(W, issuedAt)], look: starterLook() }, deps);
            expect([result.status, error(result)]).toEqual([400, 'expired_proof']);
        }
        expect((await prepareMint({ wallet: W, proofs: [proof(W, NOW - PROOF_MAX_AGE_MS + 1000)], look: starterLook() }, deps)).status).toBe(200);
    });
    it('refuses when no proof reaches depth 8', async () => {
        const { deps, wallet, chain } = testDeps();
        const W = wallet.publicKey.toBase58();
        expect(MINT_GOAL_DEPTH).toBe(8);
        const none = await prepareMint({ wallet: W, proofs: [], look: starterLook() }, deps);
        expect([none.status, error(none)]).toEqual([403, 'goal_not_reached']);
        const shallow = await prepareMint({ wallet: W, proofs: [proof(W, T, { depth: 7 }), proof(W, T + 1, { depth: 3 })], look: starterLook() }, deps);
        expect([shallow.status, error(shallow)]).toEqual([403, 'goal_not_reached']);
        expect(chain.simulated).toHaveLength(0);
    });
    it('refuses a locked trait, a non-Void background or a malformed look', async () => {
        const { deps, wallet } = testDeps();
        const W = wallet.publicKey.toBase58();
        const proofs = [proof(W, T)];
        const locked: Record<string, string>[] = [
            { Body: 'Gold' }, { Head: 'Crown' }, { Back: 'Wings' }, { Background: 'Solana' }, { Clothes: 'Tank' },
        ];
        for (const over of locked) {
            const result = await prepareMint({ wallet: W, proofs, look: starterLook(over) }, deps);
            expect([result.status, error(result)]).toEqual([400, 'locked_trait']);
        }
        for (const look of [null, 'Green', { Body: 'Green' }, starterLook({ Body: 'NoSuchTrait' })]) {
            const result = await prepareMint({ wallet: W, proofs, look }, deps);
            expect([result.status, error(result)]).toEqual([400, 'bad_look']);
        }
        // Even a feat the proofs themselves earn does not widen a first mint (Q23).
        expect(isStarterLook(starterLook({ Body: 'Pink' }) as never)).toBe(false);
        expect(isStarterLook(starterLook({ Body: 'Blue', Eye: 'Asleep', Head: 'Hood' }) as never)).toBe(true);
    });
    it('refuses a wallet that already holds a reptile', async () => {
        const { deps, wallet, chain } = testDeps();
        const W = wallet.publicKey.toBase58();
        chain.state.held = [Keypair.generate().publicKey.toBase58()];
        const result = await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps);
        expect([result.status, error(result)]).toEqual([409, 'already_holds']);
        expect(chain.simulated).toHaveLength(0);
    });
    it('refuses a proof whose asset already exists, and uses the next earning proof', async () => {
        const { deps, wallet, chain } = testDeps();
        const W = wallet.publicKey.toBase58();
        const spent = mintAssetKeypair(deps.config.signer, W, T).publicKey.toBase58();
        chain.state.lamports.set(spent, { lamports: 1, space: 1 });
        const used = await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps);
        expect([used.status, error(used)]).toEqual([409, 'proof_used']);
        const next = ok(await prepareMint({ wallet: W, proofs: [proof(W, T), proof(W, T + 5)], look: starterLook() }, deps));
        expect(next.asset).toBe(mintAssetKeypair(deps.config.signer, W, T + 5).publicKey.toBase58());
    });
    it('answers 503 on the wrong cluster or a missing collection', async () => {
        const { deps, wallet, chain } = testDeps();
        const W = wallet.publicKey.toBase58();
        chain.state.genesis = GENESIS_HASH.mainnet;
        let result = await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps);
        expect([result.status, error(result)]).toEqual([503, 'wrong_cluster']);
        chain.state.genesis = GENESIS_HASH.devnet;
        chain.state.collectionExists = false;
        result = await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps);
        expect([result.status, error(result)]).toEqual([503, 'collection_missing']);
    });
    it('reports an empty wallet and a failing simulation without signing anything useful', async () => {
        const { deps, wallet, chain } = testDeps();
        const W = wallet.publicKey.toBase58();
        chain.state.simulation = { err: { InstructionError: [2, 'Custom'] }, logs: ['Program log: nope'] };
        let result = await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps);
        expect([result.status, error(result)]).toEqual([400, 'simulation_failed']);
        expect(chain.simulated).toHaveLength(1);
        expect(chain.simulated[0].signatures.every((s) => s.every((b) => b === 0))).toBe(true);
        chain.state.lamports.delete(W);
        chain.state.simulation = { err: 'AccountNotFound' };
        result = await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps);
        expect([result.status, error(result)]).toEqual([402, 'insufficient_funds']);
    });
});

describe('prepareMint: the transaction', () => {
    it('builds the exact mint, signed by the asset key and the game signer only', async () => {
        const { deps, wallet, chain, config } = testDeps();
        const W = wallet.publicKey.toBase58();
        const look = starterLook({ Body: 'Blue', Head: 'Hood' });
        const prepared = ok(await prepareMint({ wallet: W, proofs: [proof(W, T)], look }, deps));
        const tx = decode(prepared);

        expect(isReptileTransaction(tx, W)).toBe(true);
        expect(programIds(tx)).toEqual([COMPUTE_BUDGET_PROGRAM_ID, COMPUTE_BUDGET_PROGRAM_ID, CORE_PROGRAM_ID]);
        const signers = tx.message.staticAccountKeys.slice(0, 3).map((k) => k.toBase58());
        expect(signers[0]).toBe(W);
        expect(signers.slice(1).sort()).toEqual([prepared.asset, config.signer.publicKey.toBase58()].sort());
        expect(tx.signatures[0].every((b) => b === 0)).toBe(true);
        expect(signatureValid(tx, 1) && signatureValid(tx, 2)).toBe(true);
        expect(tx.message.staticAccountKeys.map((k) => k.toBase58())).toContain(config.collection);

        const expected = mergeProgress(decodeAttributes([]), [proofPayload(W, T)], look as never).progress;
        const data = text(tx.message.compiledInstructions[2].data);
        expect(data).toContain('Entangled Reptile #8');
        expect(data).toContain(`${METADATA_BASE}/${prepared.asset}/${progressVersion(expected)}.json`);
        if (prepared.summary.kind !== 'mint') throw new Error('kind');
        expect(prepared.summary.attributes).toEqual(encodeAttributes(expected));
        expect(prepared.summary.attributes).toContainEqual({ key: 'Body', value: 'Blue' });
        expect(prepared.summary.attributes).toContainEqual({ key: 'Best Depth', value: '8' });
        expect(prepared.summary.name).toBe('Entangled Reptile #8');
        expect(prepared.asset).toBe(mintAssetKeypair(config.signer, W, T).publicKey.toBase58());

        // Two simulations: the unsigned probe, then the final signed one.
        expect(chain.simulated).toHaveLength(2);
        expect(chain.simulated[0].signatures.every((s) => s.every((b) => b === 0))).toBe(true);
        expect([...tx.message.compiledInstructions[0].data.slice(1, 5)]).toEqual([0xa8, 0xde, 0, 0]); // 40000*1.3+5000
    });
    it('quotes the fee split: network, rent and the Core fee', async () => {
        const { deps, wallet } = testDeps();
        const W = wallet.publicKey.toBase58();
        const { fee } = ok(await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps));
        expect(fee).toEqual({ network: 15_000 + 1140, rent: 5_658_480, protocol: 1_500_000, total: 7_174_620 });
    });
    it('ignores a transaction or attributes the client sends along', async () => {
        const { deps, wallet } = testDeps();
        const W = wallet.publicKey.toBase58();
        const plain = ok(await prepareMint({ wallet: W, proofs: [proof(W, T)], look: starterLook() }, deps));
        const stuffed = ok(await prepareMint({
            wallet: W, proofs: [proof(W, T)], look: starterLook(),
            tx: 'AAAA', transaction: 'AAAA', attributes: [{ key: 'Best Depth', value: '999' }], name: 'Mine', uri: 'https://evil.example',
        }, deps));
        expect(stuffed.tx).toBe(plain.tx);
    });
    it('gives the same wallet and proof the same asset address, and others a different one', () => {
        const signer = Keypair.generate();
        const a = mintAssetKeypair(signer, 'w1', 5).publicKey.toBase58();
        expect(mintAssetKeypair(signer, 'w1', 5).publicKey.toBase58()).toBe(a);
        expect(mintAssetKeypair(signer, 'w1', 6).publicKey.toBase58()).not.toBe(a);
        expect(mintAssetKeypair(signer, 'w2', 5).publicKey.toBase58()).not.toBe(a);
        expect(mintAssetKeypair(Keypair.generate(), 'w1', 5).publicKey.toBase58()).not.toBe(a);
    });
});

describe('prepareSave', () => {
    function withAsset(attributes: { key: string; value: string }[] | null = [{ key: 'Body', value: 'Green' }, { key: 'High Score', value: '292' }]) {
        const kit = testDeps();
        const W = kit.wallet.publicKey.toBase58();
        const A = Keypair.generate().publicKey.toBase58();
        kit.chain.state.assets.set(A, assetInfo(A, W, kit.config.collection, attributes));
        kit.chain.state.lamports.set(A, { lamports: 3_144_520, space: 462 });
        kit.chain.state.assetGrows = 174_000;
        return { ...kit, W, A };
    }

    it('refuses a non-owner', async () => {
        const { deps, A } = withAsset();
        const other = Keypair.generate().publicKey.toBase58();
        const result = await prepareSave({ wallet: other, asset: A, proofs: [proof(other, T)], look: null }, deps);
        expect([result.status, error(result)]).toEqual([403, 'not_owner']);
    });
    it('refuses an asset outside the collection, or one that does not exist', async () => {
        const { deps, chain, W, A } = withAsset();
        const result = await prepareSave({ wallet: W, asset: Keypair.generate().publicKey.toBase58(), proofs: [], look: null }, deps);
        expect([result.status, error(result)]).toEqual([404, 'asset_not_found']);
        for (const collection of [null, Keypair.generate().publicKey.toBase58()]) {
            chain.state.assets.set(A, assetInfo(A, W, collection, []));
            const outside = await prepareSave({ wallet: W, asset: A, proofs: [proof(W, T)], look: null }, deps);
            expect([outside.status, error(outside)]).toEqual([403, 'not_in_collection']);
        }
    });
    it('refuses bad proofs, other wallets and old proofs like the mint does', async () => {
        const { deps, W, A } = withAsset();
        const other = Keypair.generate().publicKey.toBase58();
        const cases: [string, number, string][] = [
            ['garbage', 400, 'bad_proof'], [proof(other, T), 403, 'wrong_wallet'],
            [proof(W, NOW - PROOF_MAX_AGE_MS - 5), 400, 'expired_proof'],
        ];
        for (const [bad, status, code] of cases) {
            const result = await prepareSave({ wallet: W, asset: A, proofs: [bad], look: null }, deps);
            expect([result.status, error(result)]).toEqual([status, code]);
        }
    });
    it('refuses a look the merged progress has not unlocked', async () => {
        const { deps, W, A } = withAsset();
        const result = await prepareSave({ wallet: W, asset: A, proofs: [proof(W, T)], look: starterLook({ Body: 'Gold' }) }, deps);
        expect([result.status, error(result)]).toEqual([400, 'locked_trait']);
        const bad = await prepareSave({ wallet: W, asset: A, proofs: [], look: { Body: 'Green' } }, deps);
        expect([bad.status, error(bad)]).toEqual([400, 'bad_look']);
    });
    it('merges the on-chain attributes with the proofs, keeps unknown keys, and writes the new uri', async () => {
        const { deps, config, W, A } = withAsset();
        const prepared = ok(await prepareSave({ wallet: W, asset: A, proofs: [proof(W, T, { score: 555 })], look: starterLook({ Head: 'Hood' }) }, deps));
        const tx = decode(prepared);
        expect(isReptileTransaction(tx, W)).toBe(true);
        expect(programIds(tx)).toHaveLength(4);
        expect(tx.message.staticAccountKeys.slice(0, 2).map((k) => k.toBase58())).toEqual([W, config.signer.publicKey.toBase58()]);
        expect(tx.message.header.numRequiredSignatures).toBe(2);
        expect(tx.signatures[0].every((b) => b === 0)).toBe(true);
        expect(signatureValid(tx, 1)).toBe(true);
        const plugin = text(tx.message.compiledInstructions[3].data);
        expect(plugin).toContain('High Score');
        expect(plugin).toContain('Hood');
        if (prepared.summary.kind !== 'save') throw new Error('kind');
        expect(prepared.summary.applied).toBe(1);
        expect(prepared.summary.changes).toContainEqual({ key: 'Head', from: null, to: 'Hood' });
        expect(prepared.summary.changes).toContainEqual({ key: 'Best Descent', from: null, to: '555' });
        expect(prepared.summary.changes.some((change) => change.key === 'High Score')).toBe(false);
        expect(prepared.summary.uri?.to.startsWith(`${METADATA_BASE}/${A}/`)).toBe(true);
        expect(text(tx.message.compiledInstructions[2].data)).toContain(prepared.summary.uri?.to);
        expect(prepared.fee).toEqual({ network: 10_000 + 1140, rent: 174_000, protocol: 0, total: 185_140 });
    });
    it('has nothing to save when the same proofs come again', async () => {
        const { deps, chain, W, A } = withAsset();
        const proofs = [proof(W, T, { score: 555 })];
        const first = ok(await prepareSave({ wallet: W, asset: A, proofs, look: null }, deps));
        if (first.summary.kind !== 'save' || first.summary.uri === null) throw new Error('kind');
        // The chain now holds what the save wrote.
        const current = chain.state.assets.get(A)?.attributes ?? [];
        const merged = mergeProgress(decodeAttributes(current), [proofPayload(W, T, { score: 555 })], null).progress;
        chain.state.assets.set(A, assetInfo(A, W, deps.config.collection, encodeAttributes(merged, current), first.summary.uri.to));
        const before = chain.simulated.length;
        const again = await prepareSave({ wallet: W, asset: A, proofs, look: null }, deps);
        expect([again.status, error(again)]).toEqual([409, 'nothing_to_save']);
        expect(chain.simulated).toHaveLength(before);
    });
    it('adds the plugin on an asset that has none', async () => {
        const withList = withAsset([]);
        const withNone = withAsset(null);
        const update = decode(ok(await prepareSave({ wallet: withList.W, asset: withList.A, proofs: [proof(withList.W, T)], look: null }, withList.deps)));
        const add = decode(ok(await prepareSave({ wallet: withNone.W, asset: withNone.A, proofs: [proof(withNone.W, T)], look: null }, withNone.deps)));
        expect(add.message.compiledInstructions[3].data[0]).not.toBe(update.message.compiledInstructions[3].data[0]);
    });
});
