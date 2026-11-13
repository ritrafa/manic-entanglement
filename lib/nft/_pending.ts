// ============================================================================
// PENDING STAND-INS. DELETE THE BODY OF THIS FILE WHEN E69 AND E70 LAND.
//
// The on-chain code (lib/nft/*) builds on two interfaces that queue cards own:
//   - E69  game/nftProgress.ts      encodeAttributes, decodeAttributes,
//                                   mergeProgress, progressVersion, NftProgress
//   - E70  lib/server/runToken.ts   readProof (and signProof, used by tests)
//
// Nothing else in lib/nft imports those paths: every use goes through this
// one file. To swap the real code in, replace everything below this comment
// with these lines (the names and shapes are the ones the briefs fix):
//
//   export {
//       encodeAttributes, decodeAttributes, mergeProgress, progressVersion,
//   } from '@/game/nftProgress';
//   export type { NftProgress } from '@/game/nftProgress';
//   export { readProof, signProof } from '@/lib/server/runToken';
//   export type Attribute = { key: string; value: string };
//   export type ProofPayload = NonNullable<ReturnType<typeof readProof>>;
//   export type ChosenLook = Parameters<typeof mergeProgress>[2];
//
// then run `npx tsc --noEmit && npm test`. The stand-ins below follow the
// briefs closely enough for the tests and the devnet end-to-end run, but they
// are NOT the real rules (no Solana background feat, simple bitmasks, no
// displayStats helper).
// ============================================================================
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FEATS, evaluateFeats, updateTotals } from '@/game/feats';
import { GEAR_IDS, GEAR_NAMES, gearCap, noGear, sanitizeGear, type GearLevels } from '@/game/gear';
import { MODES, MODE_IDS, betterScore, type ModeId } from '@/game/modes';
import type { Tally } from '@/game/run';
import { LAYER_ORDER, sanitizeLook, type Look } from '@/game/sprite';
import { PICKUP_TRAITS, isUnlocked, type HeldTrait } from '@/game/wardrobe';

export type Attribute = { key: string; value: string };

/** The five layers plus the image background (Q25). */
export type ChosenLook = Look & { Background: string };

export interface NftProgress {
    look: ChosenLook;
    best: Partial<Record<ModeId, number>>;
    totals: Record<string, number>;
    feats: string[];
    traits: HeldTrait[];
    gear: GearLevels;
    synced: number;
}

/** A verified run, exactly as E70 signs it into a proof. */
export interface ProofPayload {
    wallet: string;
    issuedAt: number;
    mode: ModeId;
    tally: Tally;
    score: number;
    pickedUp: HeldTrait[];
    gear: GearLevels;
}

const TOTAL_KEYS: readonly [string, string][] = [
    ['Best Depth', 'deepest'], ['Runs', 'runs'], ['Kills', 'kills'], ['Cleared', 'cleared'], ['Banked', 'banked'],
];

function defaults(): NftProgress {
    return {
        look: { ...sanitizeLook(null), Background: 'Void' },
        best: {}, totals: {}, feats: [], traits: [], gear: noGear(), synced: 0,
    };
}

function toMask(flags: boolean[]): string {
    const bytes = new Uint8Array(Math.ceil(flags.length / 8));
    flags.forEach((on, i) => { if (on) bytes[i >> 3] |= 1 << (i & 7); });
    return Buffer.from(bytes).toString('base64url');
}

function fromMask(text: string, length: number): boolean[] {
    let bytes: Uint8Array = new Uint8Array(0);
    try { bytes = Buffer.from(text, 'base64url'); } catch { /* reads as empty */ }
    return Array.from({ length }, (_, i) => ((bytes[i >> 3] ?? 0) & (1 << (i & 7))) !== 0);
}

function wholeNumber(text: string | undefined): number | null {
    if (text === undefined || !/^\d{1,15}$/.test(text)) return null;
    return Number(text);
}

export function encodeAttributes(progress: NftProgress, keep: readonly Attribute[] = []): Attribute[] {
    const out: Attribute[] = [];
    for (const layer of LAYER_ORDER) out.push({ key: layer, value: progress.look[layer] });
    out.push({ key: 'Background', value: progress.look.Background });
    for (const mode of MODE_IDS) {
        const best = progress.best[mode];
        if (best !== undefined) out.push({ key: `Best ${MODES[mode].name}`, value: String(best) });
    }
    for (const [key, field] of TOTAL_KEYS) out.push({ key, value: String(progress.totals[field] ?? 0) });
    out.push({ key: 'Feats', value: toMask(FEATS.map((feat) => progress.feats.includes(feat.id))) });
    out.push({
        key: 'Traits',
        value: toMask(PICKUP_TRAITS.map((pick) =>
            progress.traits.some((held) => held.layer === pick.layer && held.trait === pick.trait))),
    });
    // "Gear " prefix: old reptiles carry stat keys such as "Speed", which pass
    // through as unknown keys. The derived stats are not stored on chain.
    for (const id of GEAR_IDS) out.push({ key: `Gear ${GEAR_NAMES[id]}`, value: String(progress.gear[id]) });
    out.push({ key: 'Synced', value: String(progress.synced) });
    out.push({ key: 'Version', value: '1' });
    const known = new Set(out.map((entry) => entry.key));
    const unknown = keep
        .filter((entry) => !known.has(entry.key))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return [...out, ...unknown.map((entry) => ({ key: entry.key, value: entry.value }))];
}

export function decodeAttributes(list: readonly Attribute[]): NftProgress {
    const progress = defaults();
    const map = new Map<string, string>();
    for (const entry of Array.isArray(list) ? list : []) {
        if (entry && typeof entry.key === 'string' && typeof entry.value === 'string') map.set(entry.key, entry.value);
    }
    // A value the current art does not know (an old holder's Clothes "White")
    // is kept exactly as it is: only the player picking a new trait for that
    // layer replaces it.
    for (const layer of LAYER_ORDER) {
        const value = map.get(layer);
        if (value !== undefined && value !== '') progress.look[layer] = value;
    }
    progress.look.Background = map.get('Background') || 'Void';
    for (const mode of MODE_IDS) {
        const best = wholeNumber(map.get(`Best ${MODES[mode].name}`));
        if (best !== null) progress.best[mode] = best;
    }
    for (const [key, field] of TOTAL_KEYS) {
        const value = wholeNumber(map.get(key));
        if (value !== null && value > 0) progress.totals[field] = value;
    }
    const feats = fromMask(map.get('Feats') ?? '', FEATS.length);
    progress.feats = FEATS.filter((_, i) => feats[i]).map((feat) => feat.id);
    const traits = fromMask(map.get('Traits') ?? '', PICKUP_TRAITS.length);
    progress.traits = PICKUP_TRAITS.filter((_, i) => traits[i]).map(({ layer, trait }) => ({ layer, trait }));
    const gear: Record<string, number> = {};
    for (const id of GEAR_IDS) {
        const level = wholeNumber(map.get(`Gear ${GEAR_NAMES[id]}`));
        if (level !== null) gear[id] = level;
    }
    progress.gear = sanitizeGear(gear);
    progress.synced = wholeNumber(map.get('Synced')) ?? 0;
    return progress;
}

export function mergeProgress(
    current: NftProgress,
    runs: readonly Omit<ProofPayload, 'wallet'>[],
    chosenLook: ChosenLook | null,
): { progress: NftProgress; applied: number } {
    const progress: NftProgress = {
        look: { ...current.look },
        best: { ...current.best },
        totals: { ...current.totals },
        feats: [...current.feats],
        traits: current.traits.map((held) => ({ ...held })),
        gear: { ...current.gear },
        synced: current.synced,
    };
    let applied = 0;
    const ordered = [...runs].sort((a, b) => a.issuedAt - b.issuedAt);
    for (const run of ordered) {
        if (!(run.issuedAt > progress.synced)) continue;
        progress.totals = updateTotals(progress.totals, run.tally);
        progress.feats.push(...evaluateFeats(progress.feats, run.tally, progress.totals));
        if (betterScore(run.mode, run.score, progress.best[run.mode])) progress.best[run.mode] = run.score;
        for (const pick of run.pickedUp ?? []) {
            const real = PICKUP_TRAITS.some((p) => p.layer === pick.layer && p.trait === pick.trait);
            const held = progress.traits.some((t) => t.layer === pick.layer && t.trait === pick.trait);
            if (real && !held) progress.traits.push({ layer: pick.layer, trait: pick.trait });
        }
        const gear = sanitizeGear(run.gear);
        for (const id of GEAR_IDS) progress.gear[id] = Math.min(gearCap(id), Math.max(progress.gear[id], gear[id]));
        progress.synced = run.issuedAt;
        applied += 1;
    }
    if (chosenLook !== null && typeof chosenLook === 'object') {
        for (const layer of LAYER_ORDER) {
            const trait = chosenLook[layer];
            // The value the layer already has always stays allowed.
            if (typeof trait === 'string' && trait !== progress.look[layer]
                && isUnlocked(layer, trait, progress.feats, progress.traits)) {
                progress.look[layer] = trait;
            }
        }
        // No feat grants the Solana background yet: only Void is accepted.
        if (chosenLook.Background === 'Void') progress.look.Background = 'Void';
    }
    return { progress, applied };
}

export function progressVersion(progress: NftProgress): string {
    let hash = 0x811c9dc5;
    for (const { key, value } of encodeAttributes(progress)) {
        for (const ch of `${key}=${value};`) {
            hash ^= ch.charCodeAt(0) & 0xff;
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
    }
    return hash.toString(16).padStart(8, '0');
}

// ---- E70 stand-in: signed proofs ------------------------------------------

const PROOF_CONTEXT = 'manic-entanglement:proof:v1';

function proofMac(body: string, secret: string): Buffer {
    return createHmac('sha256', secret).update(PROOF_CONTEXT).update('\n').update(body).digest();
}

export function signProof(payload: ProofPayload): string {
    const secret = process.env.RUN_TOKEN_SECRET;
    if (!secret) throw new Error('verification off');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${proofMac(body, secret).toString('base64url')}`;
}

export function readProof(text: string): ProofPayload | null {
    const secret = process.env.RUN_TOKEN_SECRET;
    if (!secret || typeof text !== 'string') return null;
    const parts = text.split('.');
    if (parts.length !== 2) return null;
    try {
        const given = Buffer.from(parts[1], 'base64url');
        const wanted = proofMac(parts[0], secret);
        if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;
        const payload: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (typeof payload !== 'object' || payload === null) return null;
        return payload as ProofPayload;
    } catch {
        return null;
    }
}
