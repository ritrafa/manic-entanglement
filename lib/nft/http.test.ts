import { Keypair } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPTILE_COLLECTION } from '@/lib/reptile';
import { dasReptiles } from './chain';
import { parseAddress, parseSignerKey, readNftConfig } from './config';
import { MAX_BODY_BYTES, RATE_LIMIT, clientIp, createRateLimiter, nftHandler, readCappedBody } from './http';
import { NOW, proof, starterLook, testDeps } from './testkit';

const signer = Keypair.generate();
const KEY = JSON.stringify([...signer.secretKey]);
const fullEnv = { GAME_SIGNER_KEY: KEY, SOLANA_RPC_URL: 'https://rpc.invalid', NFT_CLUSTER: 'mainnet' };

function post(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('https://game.invalid/api/nft/mint', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

describe('readNftConfig', () => {
    it('needs all three variables', () => {
        expect(readNftConfig(fullEnv)?.cluster).toBe('mainnet');
        for (const missing of Object.keys(fullEnv)) {
            expect(readNftConfig({ ...fullEnv, [missing]: undefined })).toBeNull();
            expect(readNftConfig({ ...fullEnv, [missing]: '' })).toBeNull();
        }
        expect(readNftConfig({ ...fullEnv, NFT_CLUSTER: 'testnet' })).toBeNull();
        expect(readNftConfig({ ...fullEnv, SOLANA_RPC_URL: 'http://plain.invalid' })).toBeNull();
        expect(readNftConfig({ ...fullEnv, GAME_SIGNER_KEY: '[1,2,3]' })).toBeNull();
    });
    it('falls back to NEXT_PUBLIC_RPC_URL', () => {
        const config = readNftConfig({ ...fullEnv, SOLANA_RPC_URL: undefined, NEXT_PUBLIC_RPC_URL: 'https://public.invalid' });
        expect(config?.rpcUrl).toBe('https://public.invalid');
    });
    it('mainnet always uses the real collection; devnet needs NFT_COLLECTION', () => {
        const other = Keypair.generate().publicKey.toBase58();
        expect(readNftConfig({ ...fullEnv, NFT_COLLECTION: other })?.collection).toBe(REPTILE_COLLECTION);
        expect(readNftConfig({ ...fullEnv, NFT_CLUSTER: 'devnet' })).toBeNull();
        expect(readNftConfig({ ...fullEnv, NFT_CLUSTER: 'devnet', NFT_COLLECTION: other })?.collection).toBe(other);
    });
    it('reads the signer as a JSON array or base58, and nothing else', () => {
        expect(parseSignerKey(KEY)?.publicKey.toBase58()).toBe(signer.publicKey.toBase58());
        const digits = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let n = BigInt(`0x${Buffer.from(signer.secretKey).toString('hex')}`);
        let b58 = '';
        while (n > BigInt(0)) {
            b58 = digits[Number(n % BigInt(58))] + b58;
            n /= BigInt(58);
        }
        expect(parseSignerKey(b58)?.publicKey.toBase58()).toBe(signer.publicKey.toBase58());
        const broken = [...signer.secretKey];
        broken[40] ^= 1; // the public half no longer matches the secret half
        for (const bad of [undefined, '', 'hello', '[]', JSON.stringify(broken), JSON.stringify(broken.slice(0, 32)), '{"a":1}']) {
            expect(parseSignerKey(bad)).toBeNull();
        }
    });
    it('parses addresses strictly', () => {
        expect(parseAddress(signer.publicKey.toBase58())?.equals(signer.publicKey)).toBe(true);
        for (const bad of [null, 5, '', 'short', `${signer.publicKey.toBase58()}x`, '0'.repeat(40), 'I'.repeat(43)]) {
            expect(parseAddress(bad)).toBeNull();
        }
    });
});

describe('nftHandler', () => {
    const KEYS = ['GAME_SIGNER_KEY', 'SOLANA_RPC_URL', 'NEXT_PUBLIC_RPC_URL', 'NFT_CLUSTER', 'NFT_COLLECTION', 'RUN_TOKEN_SECRET'];
    const saved: Record<string, string | undefined> = {};
    beforeEach(() => {
        for (const key of KEYS) saved[key] = process.env[key];
        process.env.RUN_TOKEN_SECRET = 'http-test-secret';
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        for (const key of KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
        vi.restoreAllMocks();
    });

    it('answers 503 when any variable is missing, for both routes, before reading the body', async () => {
        for (const missing of Object.keys(fullEnv)) {
            Object.assign(process.env, fullEnv);
            delete process.env[missing];
            delete process.env.NEXT_PUBLIC_RPC_URL;
            for (const kind of ['mint', 'save'] as const) {
                const response = await nftHandler(kind)(post('not json'));
                expect(response.status).toBe(503);
                expect(await response.json()).toEqual({ error: 'nft_off' });
            }
        }
    });

    function handler(kind: 'mint' | 'save' = 'mint') {
        const kit = testDeps();
        const handle = nftHandler(kind, { config: () => kit.config, chain: () => kit.chain, now: () => NOW });
        return { ...kit, handle };
    }

    it('serves a mint end to end and never caches it', async () => {
        const { handle, wallet } = handler();
        const W = wallet.publicKey.toBase58();
        const response = await handle(post({ wallet: W, proofs: [proof(W, NOW - 1000)], look: starterLook() }));
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = await response.json();
        expect(typeof body.tx).toBe('string');
        expect(body.fee.total).toBeGreaterThan(0);
        expect(JSON.stringify(body)).not.toContain('rpc.invalid');
    });
    it('passes refusals through with their status', async () => {
        const { handle, wallet } = handler();
        const W = wallet.publicKey.toBase58();
        const response = await handle(post({ wallet: W, proofs: [proof(W, NOW - 1000, { depth: 2 })], look: starterLook() }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'goal_not_reached' });
    });
    it('refuses malformed JSON and oversized bodies', async () => {
        const { handle } = handler();
        expect((await handle(post('{nope'))).status).toBe(400);
        const big = await handle(post(JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) })));
        expect(big.status).toBe(413);
        // A missing Content-Length does not get a large body through: the stream is counted.
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (let i = 0; i < 5; i += 1) controller.enqueue(new Uint8Array(MAX_BODY_BYTES / 4));
                controller.close();
            },
        });
        const streamed = new Request('https://game.invalid/api/nft/mint', {
            method: 'POST', body: stream, duplex: 'half',
        } as RequestInit);
        expect(await readCappedBody(streamed, MAX_BODY_BYTES)).toBeNull();
    });
    it('limits requests per IP', async () => {
        const { handle } = handler();
        const from = (ip: string) => handle(post({}, { 'x-forwarded-for': `${ip}, 10.0.0.1` }));
        for (let i = 0; i < RATE_LIMIT; i += 1) expect((await from('1.1.1.1')).status).toBe(400);
        const limited = await from('1.1.1.1');
        expect(limited.status).toBe(429);
        expect(limited.headers.get('Retry-After')).toBe('60');
        expect((await from('2.2.2.2')).status).toBe(400);
    });
    it('answers 502 without leaking when the chain throws', async () => {
        const { handle, chain, wallet } = handler();
        const W = wallet.publicKey.toBase58();
        chain.genesisHash = async () => {
            throw new Error('fetch failed https://rpc.invalid/?api-key=SECRETKEY');
        };
        const response = await handle(post({ wallet: W, proofs: [proof(W, NOW - 1000)], look: starterLook() }));
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('SECRETKEY');
        expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('SECRETKEY');
    });
});

describe('small pieces', () => {
    it('rate limiter: a fixed window per key', () => {
        const limiter = createRateLimiter(2, 1000);
        expect([limiter.allow('a', 0), limiter.allow('a', 1), limiter.allow('a', 2)]).toEqual([true, true, false]);
        expect(limiter.allow('b', 2)).toBe(true);
        expect(limiter.allow('a', 1000)).toBe(true);
    });
    it('client ip: x-real-ip, then the first forwarded hop', () => {
        expect(clientIp(post({}, { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9');
        expect(clientIp(post({}, { 'x-forwarded-for': ' 1.1.1.1 , 2.2.2.2' }))).toBe('1.1.1.1');
        expect(clientIp(post({}))).toBe('unknown');
    });
    it('DAS reply: only live assets of the collection owned by the wallet', () => {
        const C = 'collection';
        const W = 'wallet';
        const group = [{ group_key: 'collection', group_value: C }];
        expect(dasReptiles([
            { id: 'a', grouping: group, ownership: { owner: W } },
            { id: 'burnt', grouping: group, burnt: true },
            { id: 'other-collection', grouping: [{ group_key: 'collection', group_value: 'x' }] },
            { id: 'other-owner', grouping: group, ownership: { owner: 'someone' } },
            { grouping: group }, null, 'junk',
            { id: 'b', grouping: group },
        ], W, C)).toEqual(['a', 'b']);
        expect(dasReptiles(undefined, W, C)).toEqual([]);
    });
});
