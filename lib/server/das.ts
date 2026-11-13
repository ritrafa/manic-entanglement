// The server-side DAS helper (E70, reused by E71): the RPC endpoint from the
// environment and one defensive JSON-RPC call. Nothing here signs or sends
// anything and no key is read; the caller decides what a failure means.

import { REPTILE_COLLECTION } from "@/lib/reptile";

/** Milliseconds a DAS lookup may take before the caller treats it as failed. */
const DAS_TIMEOUT_MS = 4000;

/** The DAS endpoint: SOLANA_RPC_URL first, NEXT_PUBLIC_RPC_URL as the fallback. */
export function dasUrl(): string | null {
    for (const candidate of [process.env.SOLANA_RPC_URL, process.env.NEXT_PUBLIC_RPC_URL]) {
        if (typeof candidate !== "string") continue;
        const url = candidate.trim();
        if (url !== "" && url.startsWith("https://")) return url;
    }
    return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One DAS getAsset outcome: the asset, a clean "the chain has no such id",
 *  or a failure (no endpoint, network, timeout, broken JSON, RPC error). */
export type DasAssetResult =
    | { status: "found"; asset: Record<string, unknown> }
    | { status: "missing" }
    | { status: "error" };

/** True when a DAS error reply means "this id does not exist" rather than
 *  "the RPC could not answer right now". Read defensively: any shape may
 *  arrive, and anything that does not clearly say "not found" is a failure. */
function isNotFoundReply(error: unknown): boolean {
    const texts: unknown[] = [];
    if (typeof error === "string") texts.push(error);
    else if (isRecord(error)) {
        texts.push(error.message, error.code);
        if (isRecord(error.data)) texts.push(error.data.message);
    }
    return texts.some((text) =>
        typeof text === "string" && /not\s+found|could\s+not\s+be\s+found|does\s+not\s+exist/i.test(text),
    );
}

/** Ask DAS for one asset by id. Never throws: every transport or parse
 *  failure answers { status: "error" }, a plain "no such asset" the missing
 *  verdict, and a usable reply the asset record as it came. */
export async function dasGetAsset(assetId: string): Promise<DasAssetResult> {
    const endpoint = dasUrl();
    if (endpoint === null) return { status: "error" };
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "reptile-metadata",
                method: "getAsset",
                params: { id: assetId },
            }),
            signal: AbortSignal.timeout(DAS_TIMEOUT_MS),
        });
        if (!response.ok) return { status: "error" };
        const reply: unknown = await response.json();
        if (!isRecord(reply)) return { status: "error" };
        if (reply.error !== undefined) {
            return isNotFoundReply(reply.error) ? { status: "missing" } : { status: "error" };
        }
        if (!isRecord(reply.result)) return { status: "error" };
        return { status: "found", asset: reply.result };
    } catch {
        return { status: "error" };
    }
}

/** The item's grouping contains our collection id? */
export function assetInCollection(asset: unknown): boolean {
    if (!isRecord(asset)) return false;
    const grouping = asset.grouping;
    if (!Array.isArray(grouping)) return false;
    return grouping.some((entry) =>
        isRecord(entry) && entry.group_value === REPTILE_COLLECTION);
}

/** The asset's Attributes plugin list, or null when it carries none. */
export function assetAttributeList(asset: unknown): unknown {
    if (!isRecord(asset)) return null;
    const plugins = asset.plugins;
    const attributes = isRecord(plugins) ? plugins.attributes : undefined;
    const data = isRecord(attributes) ? attributes.data : undefined;
    const list = isRecord(data) ? data.attribute_list : undefined;
    return Array.isArray(list) ? list : null;
}

/** The asset's on-chain name: the metadata's first, then the content's,
 *  then the top level one DAS may carry; null when none is a usable text. */
export function assetName(asset: unknown): string | null {
    if (!isRecord(asset)) return null;
    const content = asset.content;
    const metadata = isRecord(content) ? content.metadata : undefined;
    const candidates: unknown[] = [
        isRecord(metadata) ? metadata.name : undefined,
        isRecord(content) ? content.name : undefined,
        asset.name,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
    }
    return null;
}
