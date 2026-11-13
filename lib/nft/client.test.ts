import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NftError, mintReptile, requestMint, requestSave, signAndSend, type ConnectionLike, type WalletLike } from './client';
import { prepareMint, type Prepared } from './service';
import { BLOCKHASH, NOW, proof, signatureValid, starterLook, testDeps } from './testkit';

beforeAll(() => {
    process.env.RUN_TOKEN_SECRET = 'client-test-secret';
});
afterAll(() => {
    delete process.env.RUN_TOKEN_SECRET;
});

async function prepared(): Promise<{ quote: Prepared; wallet: Keypair }> {
    const { deps, wallet } = testDeps();
    const W = wallet.publicKey.toBase58();
    const result = await prepareMint({ wallet: W, proofs: [proof(W, NOW - 1000)], look: starterLook() }, deps);
    if (!('tx' in result.body)) throw new Error('not prepared');
    return { quote: result.body, wallet };
}

function adapter(keypair: Keypair): WalletLike {
    return {
        publicKey: keypair.publicKey,
        signTransaction: async (tx) => {
            tx.sign([keypair]);
            return tx;
        },
    };
}

function connection(over: Partial<ConnectionLike> = {}): ConnectionLike & { sent: Uint8Array[] } {
    const sent: Uint8Array[] = [];
    return {
        sent,
        sendRawTransaction: async (raw) => {
            sent.push(raw);
            return 'SIG';
        },
        confirmTransaction: async () => ({ value: { err: null } }),
        ...over,
    };
}

async function code(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (error) {
        if (error instanceof NftError) return error.code;
        throw error;
    }
    return 'resolved';
}

function reply(status: number, body: unknown): typeof fetch {
    return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const throwing = (message: string) => async () => {
    throw new Error(message);
};

describe('signAndSend', () => {
    it('signs as the fee payer, sends the fully signed transaction and returns the signature', async () => {
        const { quote, wallet } = await prepared();
        const conn = connection();
        expect(await signAndSend(quote, adapter(wallet), conn)).toBe('SIG');
        const tx = VersionedTransaction.deserialize(conn.sent[0]);
        expect([0, 1, 2].every((i) => signatureValid(tx, i))).toBe(true);
    });
    it('refuses, unsigned, a transaction that is not a mint or save by shape', async () => {
        const wallet = Keypair.generate();
        let asked = 0;
        const spy: WalletLike = {
            publicKey: wallet.publicKey,
            signTransaction: async (tx) => {
                asked += 1;
                return tx;
            },
        };
        const drain = new VersionedTransaction(new TransactionMessage({
            payerKey: wallet.publicKey, recentBlockhash: BLOCKHASH,
            instructions: [SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1e9 })],
        }).compileToLegacyMessage());
        const bad = { tx: Buffer.from(drain.serialize()).toString('base64'), blockhash: BLOCKHASH, lastValidBlockHeight: 1 };
        expect(await code(signAndSend(bad, spy, connection()))).toBe('unsafe_transaction');
        // A valid mint for another wallet is refused too: the payer must be this wallet.
        const { quote } = await prepared();
        expect(await code(signAndSend(quote, spy, connection()))).toBe('unsafe_transaction');
        expect(await code(signAndSend({ ...quote, tx: '!!!' }, spy, connection()))).toBe('bad_reply');
        expect(asked).toBe(0);
    });
    it('reports no wallet, a declined signature and a wallet that edits the transaction', async () => {
        const { quote, wallet } = await prepared();
        expect(await code(signAndSend(quote, { publicKey: null }, connection()))).toBe('no_wallet');
        expect(await code(signAndSend(quote, { publicKey: wallet.publicKey }, connection()))).toBe('no_wallet');
        const declines: WalletLike = { publicKey: wallet.publicKey, signTransaction: throwing('User rejected') };
        expect(await code(signAndSend(quote, declines, connection()))).toBe('declined');
        const edits: WalletLike = {
            publicKey: wallet.publicKey,
            signTransaction: async () => new VersionedTransaction(new TransactionMessage({
                payerKey: wallet.publicKey, recentBlockhash: BLOCKHASH, instructions: [],
            }).compileToLegacyMessage()),
        };
        const conn = connection();
        expect(await code(signAndSend(quote, edits, conn))).toBe('wallet_changed_transaction');
        expect(conn.sent).toHaveLength(0);
    });
    it('reports a failed send, an on-chain error and a missing confirmation', async () => {
        const { quote, wallet } = await prepared();
        const w = adapter(wallet);
        expect(await code(signAndSend(quote, w, connection({ sendRawTransaction: throwing('rpc down') })))).toBe('send_failed');
        const failed = async () => ({ value: { err: { InstructionError: [2, 'x'] } } });
        expect(await code(signAndSend(quote, w, connection({ confirmTransaction: failed })))).toBe('send_failed');
        expect(await code(signAndSend(quote, w, connection({ confirmTransaction: throwing('expired') })))).toBe('not_confirmed');
    });
});

describe('requests', () => {
    const input = { wallet: 'W', proofs: ['p'], look: starterLook() };
    it('posts to the two routes and returns the quote', async () => {
        const { quote } = await prepared();
        const calls: [string, unknown][] = [];
        const fake = (async (url: string, init: RequestInit) => {
            calls.push([url, JSON.parse(String(init.body))]);
            return new Response(JSON.stringify(quote), { status: 200 });
        }) as unknown as typeof fetch;
        expect((await requestMint(input, fake)).tx).toBe(quote.tx);
        await requestSave({ ...input, asset: 'A', look: null }, fake);
        expect(calls[0]).toEqual(['/api/nft/mint', input]);
        expect(calls[1]).toEqual(['/api/nft/save', { wallet: 'W', asset: 'A', proofs: ['p'], look: null }]);
    });
    it('turns refusals and broken replies into NftError codes', async () => {
        expect(await code(requestMint(input, reply(403, { error: 'goal_not_reached' })))).toBe('goal_not_reached');
        expect(await code(requestMint(input, reply(503, { error: 'nft_off' })))).toBe('nft_off');
        expect(await code(requestMint(input, reply(500, 'oops')))).toBe('bad_reply');
        expect(await code(requestMint(input, reply(200, { tx: 'x' })))).toBe('bad_reply');
        expect(await code(requestMint(input, throwing('offline') as unknown as typeof fetch))).toBe('network');
    });
    it('mintReptile stops before the wallet when the player does not agree', async () => {
        const { quote, wallet } = await prepared();
        let asked = 0;
        const spy: WalletLike = {
            publicKey: wallet.publicKey,
            signTransaction: async (tx) => {
                asked += 1;
                return tx;
            },
        };
        expect(await code(mintReptile(input, spy, connection(), () => false, reply(200, quote)))).toBe('declined');
        expect(asked).toBe(0);
        const done = await mintReptile(input, adapter(wallet), connection(), (q) => q.fee.total > 0, reply(200, quote));
        expect(done).toMatchObject({ signature: 'SIG', asset: quote.asset, fee: quote.fee });
    });
});
