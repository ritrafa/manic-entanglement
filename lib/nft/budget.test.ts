// The real codec's largest attribute list against what one transaction can
// carry. If the codec grows (more keys, longer names, more feats or pickup
// traits), these fail before a player's mint or save can.
import { publicKey } from '@metaplex-foundation/umi';
import { Keypair } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { FEATS } from '@/game/feats';
import { GEAR_IDS, gearCap, type GearLevels } from '@/game/gear';
import { MODE_IDS } from '@/game/modes';
import { LAYER_ORDER, TRAITS } from '@/game/sprite';
import { PICKUP_TRAITS } from '@/game/wardrobe';
import { decodeAttributes, encodeAttributes, type Attribute, type NftProgress } from './progress';
import { BLOCKHASH } from './testkit';
import { MAX_TX_BYTES, buildMintTransaction, buildSaveTransaction, offlineUmi } from './tx';

const umi = offlineUmi();
const priority = { unitLimit: 400_000, microLamportsPerUnit: 20_000 };
const wireBytes = (list: readonly Attribute[]) => list.reduce((sum, { key, value }) => sum + 8 + key.length + value.length, 0);
const longest = (names: readonly string[]) => [...names].sort((a, b) => b.length - a.length)[0];

/** Everything at its largest: the longest trait names, every feat and pickup,
 *  capped gear, seven-digit counters and bests in every mode. */
function fullProgress(): NftProgress {
    const progress = decodeAttributes([]);
    for (const layer of LAYER_ORDER) progress.look[layer] = longest(TRAITS[layer]);
    progress.look.Background = 'Solana';
    for (const mode of MODE_IDS) progress.best[mode] = 9_999_999;
    progress.totals = { runs: 9_999_999, kills: 9_999_999, cleared: 9_999_999, banked: 9_999_999, deepest: 9_999 };
    progress.feats = FEATS.map((feat) => feat.id);
    progress.traits = PICKUP_TRAITS.map(({ layer, trait }) => ({ layer, trait }));
    const gear = {} as GearLevels;
    for (const id of GEAR_IDS) gear[id] = gearCap(id);
    progress.gear = gear;
    progress.synced = 9_999_999_999_999;
    return progress;
}

/** The extra keys a real old holder carries (read from mainnet). */
const OLD_KEYS: Attribute[] = [
    { key: 'High Score', value: '292' }, { key: 'Attack', value: '1.2' }, { key: 'Defense', value: '1.3' },
    { key: 'Speed', value: '1.02' }, { key: 'Consumption', value: '0.98' }, { key: 'Energy Storage', value: '120' },
];

const address = () => Keypair.generate().publicKey.toBase58();

describe('attribute budget with the real codec', () => {
    const full = encodeAttributes(fullProgress());
    const fullOld = encodeAttributes(fullProgress(), OLD_KEYS);

    it('the fullest list survives a round trip (nothing was clipped building it)', () => {
        const back = decodeAttributes(full);
        expect(back.feats).toHaveLength(FEATS.length);
        expect(back.traits).toHaveLength(PICKUP_TRAITS.length);
        expect(encodeAttributes(back)).toEqual(full);
    });
    it('stays under the mint limit of 591 bytes, with room to spare', () => {
        // A mint can never be this full (starter look, a few runs), yet even
        // this list must fit beside three signatures and a five-digit number.
        expect(wireBytes(full)).toBeLessThanOrEqual(591);
        const asset = address();
        const tx = buildMintTransaction(umi, {
            wallet: address(), asset, authority: address(), collection: { publicKey: publicKey(address()) },
            name: 'Entangled Reptile #99999',
            uri: `https://www.manic-entanglement.com/api/reptile/${asset}/0123abcd.json`,
            attributes: full, blockhash: BLOCKHASH, priority,
        });
        expect(tx.serialize().length).toBeLessThanOrEqual(MAX_TX_BYTES);
    });
    it('a full save fits, also with an old holder\'s extra keys', () => {
        expect(wireBytes(fullOld)).toBeLessThanOrEqual(683);
        const wallet = address();
        const asset = address();
        const tx = buildSaveTransaction(umi, {
            wallet, asset: { publicKey: publicKey(asset), owner: publicKey(wallet) }, authority: address(),
            collection: { publicKey: publicKey(address()) },
            uri: `https://www.manic-entanglement.com/api/reptile/${asset}/0123abcd.json`,
            attributes: fullOld, hasAttributesPlugin: true, blockhash: BLOCKHASH, priority,
        });
        expect(tx.serialize().length).toBeLessThanOrEqual(MAX_TX_BYTES);
        console.log(`attribute bytes: full ${wireBytes(full)}, full + old keys ${wireBytes(fullOld)}, save tx ${tx.serialize().length}`);
    });
});
