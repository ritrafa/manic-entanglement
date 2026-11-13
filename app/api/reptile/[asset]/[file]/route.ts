// GET /api/reptile/[asset]/[file] (NFT-PLAN N4, E71): the collection's own
// metadata and image host. The NFT's URI is
// https://www.manic-entanglement.com/api/reptile/<asset>/<v>.json and its
// image is the sibling <v>.png, where <v> is the progressVersion (E69) of
// the on-chain attribute list: every save writes a new <v>, so wallets and
// marketplaces refetch. The asset is read through DAS getAsset and must
// belong to REPTILE_COLLECTION; the JSON follows the Metaplex JSON standard
// and the PNG stacks the 16x16 PFP masters over the background at 512x512.
// The current version caches immutably; an older <v> renders the current
// state with a short shared-cache TTL. Server-only: fs and sharp.

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { MODES, MODE_IDS } from "@/game/modes";
import { decodeAttributes, displayStats, progressVersion, type NftProgress } from "@/game/nftProgress";
import { LAYER_ORDER, pfpLayers } from "@/game/sprite";
import {
    assetAttributeList,
    assetInCollection,
    assetName,
    dasGetAsset,
} from "@/lib/server/das";
import { collectionAddress } from "@/lib/nft/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A base58 asset id of the length Solana addresses have. */
const BASE58_ASSET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The only two file names the route answers: eight hex chars, then .json or .png. */
const VERSIONED_FILE = /^([0-9a-f]{8})\.(json|png)$/;

/** The game, as the metadata names it. */
const SITE_URL = "https://www.manic-entanglement.com";

/** The collection description every reptile's metadata carries. */
const COLLECTION_DESCRIPTION =
    "Playable characters for the maze speedrunner, https://www.manic-entanglement.com, upgradable in-game.";

/** The standard background (Q25): flat void. */
const VOID_COLOR = "#06120d";

/** The feat-reward background: the Solana gradient, smooth at full size. */
const SOLANA_TOP_LEFT = "#9945FF";
const SOLANA_BOTTOM_RIGHT = "#14F195";

/** The PFP masters are 16x16; the image is their 32x nearest-neighbour blow-up. */
const IMAGE_SIZE = 512;

interface MetaplexAttribute {
    trait_type: string;
    value: string | number;
}

function reply(body: unknown, status: number, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}

/** A stat as display text with one decimal, the way the HUD shows them. */
function oneDecimal(value: number): string {
    return (Math.round(value * 10) / 10).toFixed(1);
}

/** The JSON attributes from the decoded progress: the look with the values
 *  exactly as they are stored (an old holder's Clothes `White` shows as
 *  `White`), the earned bests, Best Depth, the five derived stats and the
 *  feat count. The Feats and Traits bitmasks are never shown. */
export function metadataAttributes(progress: NftProgress): MetaplexAttribute[] {
    const attributes: MetaplexAttribute[] = [];
    for (const layer of LAYER_ORDER) {
        attributes.push({ trait_type: layer, value: progress.look[layer] });
    }
    attributes.push({ trait_type: "Background", value: progress.look.Background });

    for (const id of MODE_IDS) {
        const best = progress.best[id];
        if (typeof best === "number" && Number.isFinite(best)) {
            attributes.push({ trait_type: `Best ${MODES[id].name}`, value: best });
        }
    }
    const depth = progress.totals.deepest;
    if (typeof depth === "number" && Number.isFinite(depth)) {
        attributes.push({ trait_type: "Best Depth", value: Math.floor(depth) });
    }

    const stats = displayStats(progress);
    attributes.push({ trait_type: "Attack", value: oneDecimal(stats.attack) });
    attributes.push({ trait_type: "Defense", value: oneDecimal(stats.defense) });
    attributes.push({ trait_type: "Speed", value: oneDecimal(stats.speed) });
    attributes.push({ trait_type: "Consumption", value: oneDecimal(stats.consumption) });
    attributes.push({ trait_type: "Storage", value: oneDecimal(stats.storage) });

    attributes.push({ trait_type: "Feats", value: progress.feats.length });
    return attributes;
}

/** The 512x512 background base: the flat void, or the Solana gradient
 *  rendered as a vector so it is smooth at full resolution, not pixelated. */
function backgroundBase(background: string): Promise<Buffer> {
    if (background === "Solana") {
        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}">`
            + `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">`
            + `<stop offset="0" stop-color="${SOLANA_TOP_LEFT}"/>`
            + `<stop offset="1" stop-color="${SOLANA_BOTTOM_RIGHT}"/>`
            + `</linearGradient></defs>`
            + `<rect width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" fill="url(#g)"/></svg>`;
        return sharp(Buffer.from(svg)).png().toBuffer();
    }
    return sharp({
        create: { width: IMAGE_SIZE, height: IMAGE_SIZE, channels: 4, background: VOID_COLOR },
    }).png().toBuffer();
}

/** One PFP master read from disk under public/ and scaled 32x with nearest
 *  neighbour; null when the file is not there (it never is for `None`, which
 *  pfpLayers already skipped, and never for a sanitized trait either). */
async function layerInput(layerUrl: string): Promise<Buffer | null> {
    const filePath = path.join(process.cwd(), "public", layerUrl.replace(/^\//, ""));
    try {
        const master = await fs.readFile(filePath);
        return await sharp(master)
            .resize(IMAGE_SIZE, IMAGE_SIZE, { kernel: "nearest" })
            .png()
            .toBuffer();
    } catch {
        return null;
    }
}

/** The reptile's portrait: the background with the PFP layers stacked in
 *  draw order. Unknown look values draw the way sanitizeLook falls back
 *  (pfpLayers sanitizes); the JSON keeps showing the stored text. */
export async function renderReptilePng(progress: NftProgress): Promise<Buffer> {
    const base = await backgroundBase(progress.look.Background);
    const composites: sharp.OverlayOptions[] = [];
    for (const layerUrl of pfpLayers(progress.look)) {
        const input = await layerInput(layerUrl);
        if (input !== null) composites.push({ input });
    }
    return sharp(base).composite(composites).png().toBuffer();
}

export async function GET(
    request: Request,
    context: { params: Promise<{ asset: string; file: string }> },
): Promise<Response> {
    const params = await context.params;
    const assetId = typeof params.asset === "string" ? params.asset : "";
    const file = typeof params.file === "string" ? params.file : "";
    const requested = VERSIONED_FILE.exec(file);
    if (requested === null || !BASE58_ASSET.test(assetId)) {
        return reply({ error: "bad_request" }, 400, { "Cache-Control": "no-store" });
    }
    const version = requested[1];
    const kind = requested[2];

    const result = await dasGetAsset(assetId);
    if (result.status === "error") {
        return reply({ error: "das_unavailable" }, 502, { "Cache-Control": "no-store" });
    }
    if (result.status === "missing" || !assetInCollection(result.asset, collectionAddress())) {
        return reply({ error: "not_found" }, 404, { "Cache-Control": "no-store" });
    }

    // The current state renders whatever <v> was asked for; only a matching
    // <v> earns the immutable year, an old one rides a short shared-cache TTL
    // so a wallet still holding a stale URI sees the reptile as it is now.
    const progress = decodeAttributes(assetAttributeList(result.asset));
    const cacheControl = version === progressVersion(progress)
        ? "public, max-age=31536000, immutable"
        : "public, s-maxage=300";

    const imageUrl = `${SITE_URL}/api/reptile/${assetId}/${version}.png`;

    if (kind === "json") {
        return reply({
            name: assetName(result.asset) ?? "Entangled Reptile",
            description: COLLECTION_DESCRIPTION,
            image: imageUrl,
            external_url: SITE_URL,
            attributes: metadataAttributes(progress),
            properties: { files: [{ uri: imageUrl, type: "image/png" }] },
        }, 200, { "Cache-Control": cacheControl });
    }

    let png: Buffer;
    try {
        png = await renderReptilePng(progress);
    } catch {
        return reply({ error: "render_failed" }, 502, { "Cache-Control": "no-store" });
    }
    return new Response(new Uint8Array(png), {
        status: 200,
        headers: { "Content-Type": "image/png", "Cache-Control": cacheControl },
    });
}
