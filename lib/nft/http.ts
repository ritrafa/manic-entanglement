// The thin HTTP layer of POST /api/nft/mint and /api/nft/save: environment
// (503 when not configured), a per-IP rate limit, a body size cap, JSON, then
// the route logic in lib/nft/service.ts. No error text from the RPC or the
// environment ever reaches the reply or the log (an RPC URL can carry a key).
import { rpcChain, type Chain } from './chain';
import { readNftConfig, type NftConfig } from './config';
import { prepareMint, prepareSave, type Deps, type Result } from './service';

/** The largest request body the routes read (50 proofs fit several times). */
export const MAX_BODY_BYTES = 256 * 1024;
/** Requests per IP per window, per route kind. */
export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60_000;
const RATE_TABLE_CAP = 5000;

export interface RateLimiter {
    allow(key: string, now: number): boolean;
}

/** A fixed-window counter per key, in memory. On a serverless host each
 *  instance keeps its own table, so this is a brake on bursts, not a quota. */
export function createRateLimiter(limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS): RateLimiter {
    const table = new Map<string, { count: number; resetAt: number }>();
    return {
        allow(key, now) {
            const entry = table.get(key);
            if (entry === undefined || now >= entry.resetAt) {
                if (table.size >= RATE_TABLE_CAP) {
                    for (const [k, v] of table) if (now >= v.resetAt) table.delete(k);
                    if (table.size >= RATE_TABLE_CAP) table.clear();
                }
                table.set(key, { count: 1, resetAt: now + windowMs });
                return true;
            }
            entry.count += 1;
            return entry.count <= limit;
        },
    };
}

/** The caller's address as the host reports it. */
export function clientIp(request: Request): string {
    const real = request.headers.get('x-real-ip');
    if (real !== null && real.trim() !== '') return real.trim();
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded !== null && forwarded.trim() !== '') return forwarded.split(',')[0].trim();
    return 'unknown';
}

/** The body as text, or null when it is larger than `cap` bytes. Reads the
 *  stream itself, so a missing or false Content-Length cannot get past. */
export async function readCappedBody(request: Request, cap: number): Promise<string | null> {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > cap) return null;
    if (request.body === null) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > cap) {
            await reader.cancel().catch(() => undefined);
            return null;
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
    });
}

export interface HandlerOptions {
    /** Defaults to reading process.env on every request. */
    config?: () => NftConfig | null;
    /** Defaults to one RPC-backed chain per endpoint, kept between requests. */
    chain?: (config: NftConfig) => Chain;
    limiter?: RateLimiter;
    now?: () => number;
}

const chains = new Map<string, Chain>();
function sharedChain(config: NftConfig): Chain {
    let chain = chains.get(config.rpcUrl);
    if (chain === undefined) {
        chain = rpcChain(config.rpcUrl);
        chains.set(config.rpcUrl, chain);
    }
    return chain;
}

/** Build the POST handler for one of the two routes. */
export function nftHandler(kind: 'mint' | 'save', options: HandlerOptions = {}): (request: Request) => Promise<Response> {
    const limiter = options.limiter ?? createRateLimiter();
    const now = options.now ?? Date.now;
    return async (request) => {
        const config = (options.config ?? readNftConfig)();
        if (config === null) return json(503, { error: 'nft_off' });
        if (!limiter.allow(clientIp(request), now())) {
            return json(429, { error: 'rate_limited' }, { 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) });
        }
        let text: string | null;
        try {
            text = await readCappedBody(request, MAX_BODY_BYTES);
        } catch {
            return json(400, { error: 'bad_request' });
        }
        if (text === null) return json(413, { error: 'too_large' });
        let body: unknown;
        try {
            body = JSON.parse(text);
        } catch {
            return json(400, { error: 'bad_request' });
        }
        const deps: Deps = { config, chain: (options.chain ?? sharedChain)(config), now };
        let result: Result;
        try {
            result = kind === 'mint' ? await prepareMint(body, deps) : await prepareSave(body, deps);
        } catch {
            // Deliberately no message: RPC errors can quote the endpoint.
            console.error(`nft ${kind}: chain or build failure`);
            return json(502, { error: 'chain_unavailable' });
        }
        return json(result.status, result.body);
    };
}
