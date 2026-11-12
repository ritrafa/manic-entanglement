// The read-only wallet loader for the Entangled Reptiles collection: one
// JSON-RPC call, a defensive walk of the reply, and nothing else. Nothing
// here signs or sends anything; the RPC host comes from the environment and
// no key is required.
import { DEFAULT_LOOK, Look, sanitizeLook } from '@/game/sprite';

/** The only collection the game looks for (same id the HUD matched before). */
export const REPTILE_COLLECTION = 'Dj5gDUph6CuUiQBjh31HhpmJTXhhfHzbMTNK89wNHzvz';

/** The five sprite traits an NFT's attributes may set (game/sprite.ts). */
const LOOK_LAYERS = ['Back', 'Body', 'Clothes', 'Eye', 'Head'] as const;

/** The RPC endpoint from the environment, or null when it is absent or not a
 *  usable https:// URL. Nothing is fetched and no host lives in the source. */
export function rpcUrl(): string | null {
    const raw = process.env.NEXT_PUBLIC_RPC_URL;
    if (typeof raw !== 'string') return null;
    const url = raw.trim();
    if (url === '' || !url.startsWith('https://')) return null;
    return url;
}

export interface Reptile {
    look: Look;
    image: string | null;
}

export type LoadResult =
    | { status: 'found'; look: Look; image: string | null }
    | { status: 'none' }
    | { status: 'error' };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The item's grouping contains our collection id? */
function inCollection(item: Record<string, unknown>): boolean {
    const grouping = item.grouping;
    if (!Array.isArray(grouping)) return false;
    return grouping.some((entry) =>
        isRecord(entry) && entry.group_value === REPTILE_COLLECTION);
}

/** The first https:// image URL in content.files, or null. Anything else
 *  (javascript:, numbers, missing files) is dropped, never rendered. */
function httpsImage(item: Record<string, unknown>): string | null {
    const content = item.content;
    if (!isRecord(content)) return null;
    const files = content.files;
    if (!Array.isArray(files)) return null;
    for (const file of files) {
        if (!isRecord(file)) continue;
        for (const key of ['uri', 'cdn_uri'] as const) {
            const candidate = file[key];
            if (typeof candidate === 'string' && candidate.startsWith('https://')) {
                return candidate;
            }
        }
    }
    return null;
}

/** Walk the asset list defensively (anything may be missing or of the wrong
 *  type) and return the first item from our collection as a sanitized look
 *  plus an optional image URL. Pure: no fetch, no DOM. */
export function findReptile(items: unknown): Reptile | null {
    if (!Array.isArray(items)) return null;
    for (const item of items) {
        if (!isRecord(item) || !inCollection(item)) continue;

        // plugins.attributes.data.attribute_list: [{ key, value }, ...]
        const plugins = item.plugins;
        const attributes = isRecord(plugins) ? plugins.attributes : undefined;
        const data = isRecord(attributes) ? attributes.data : undefined;
        const rawList = isRecord(data) ? data.attribute_list : undefined;

        const look: Record<string, string> = {};
        if (Array.isArray(rawList)) {
            for (const entry of rawList) {
                if (!isRecord(entry)) continue;
                const { key, value } = entry;
                if (typeof key === 'string'
                    && (LOOK_LAYERS as readonly string[]).includes(key)
                    && typeof value === 'string') {
                    look[key] = value;
                }
            }
        }
        // Unknown or missing traits fall back to DEFAULT_LOOK per layer.
        return { look: sanitizeLook(look), image: httpsImage(item) };
    }
    return null;
}

/** Ask the RPC for the owner's assets and find their reptile. Never throws:
 *  a missing endpoint, a non-OK response, a thrown fetch or malformed JSON
 *  all come back as { status: "error" } for the caller to show. */
export async function loadReptile(
    owner: string,
    fetchImpl: typeof fetch = fetch,
): Promise<LoadResult> {
    const endpoint = rpcUrl();
    if (endpoint === null || owner === '') return { status: 'error' };
    try {
        const response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'reptile-look',
                method: 'getAssetsByOwner',
                params: { ownerAddress: owner, page: 1, limit: 1000 },
            }),
        });
        if (!response.ok) return { status: 'error' };
        const reply: unknown = await response.json();
        // result.items is the asset list; anything else is treated as empty.
        const result = isRecord(reply) ? reply.result : undefined;
        const items = isRecord(result) ? result.items : undefined;
        const reptile = findReptile(items);
        if (reptile === null) return { status: 'none' };
        return { status: 'found', look: reptile.look, image: reptile.image };
    } catch {
        return { status: 'error' };
    }
}

export { DEFAULT_LOOK };
