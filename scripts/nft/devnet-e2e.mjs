#!/usr/bin/env node
// DEVNET END TO END. Never point this at mainnet: it refuses any RPC whose
// genesis hash is mainnet's. It uses only throwaway keys it creates itself
// in the directory given by --keys (keep that outside the repo).
//
//   node scripts/nft/devnet-e2e.mjs --keys <dir> [--rpc <url>] [--local]
//
//   --rpc     default https://api.devnet.solana.com
//   --local   the RPC is a local solana-test-validator running the real Core
//             program (cloned from a cluster); the genesis check is skipped
//
// What it does:
//   1. creates a Core collection with a throwaway authority (shaped like the
//      real one: a Royalties plugin only);
//   2. adds a throwaway game signer as the collection Update Delegate with
//      the owner script's own code (scripts/nft/delegate.mjs), both branches;
//   3. checks what that delegate can and cannot do;
//   4. runs the real route logic (lib/nft/service.ts) and the real client
//      helper (lib/nft/client.ts): a mint for a throwaway player, three
//      saves, a first save on an old-style asset; reads everything back;
//   5. measures every cost from balances and compares it with the fee the
//      server quoted.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
    burn, create, createCollection, fetchAsset, fetchCollection, mplCore, transfer, updateCollection, updatePlugin,
} from '@metaplex-foundation/mpl-core';
import { createSignerFromKeypair, generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createServer } from 'vite';
import { addGameDelegate, GENESIS } from './delegate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const keysDir = option('keys');
const rpc = option('rpc', 'https://api.devnet.solana.com');
const local = flag('local');
if (!keysDir) {
    console.error('usage: devnet-e2e.mjs --keys <dir outside the repo> [--rpc url] [--local]');
    process.exit(1);
}
if (path.resolve(keysDir).startsWith(root + path.sep)) {
    console.error('keep the throwaway keys outside the repo');
    process.exit(1);
}

const sol = (lamports) => `${lamports} lamports (${(lamports / LAMPORTS_PER_SOL).toFixed(9)} SOL)`;
let failures = 0;
function check(label, ok, extra = '') {
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
}
function throwaway(name) {
    fs.mkdirSync(keysDir, { recursive: true });
    const file = path.join(keysDir, `${name}.json`);
    if (fs.existsSync(file)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, 'utf8'))));
    const keypair = Keypair.generate();
    fs.writeFileSync(file, JSON.stringify([...keypair.secretKey]));
    return keypair;
}

const connection = new Connection(rpc, 'confirmed');
const genesis = await connection.getGenesisHash();
if (genesis === GENESIS.mainnet) {
    console.error('this is mainnet; refusing');
    process.exit(1);
}
if (!local && genesis !== GENESIS.devnet) {
    console.error('the RPC is not devnet (pass --local for a local test validator)');
    process.exit(1);
}

const authority = throwaway('authority');
const game = throwaway('game-signer');
const spare = throwaway('spare-delegate');
const stranger = throwaway('stranger');
// A fresh player and old holder every run, so reruns start clean.
const player = Keypair.generate();
const oldHolder = Keypair.generate();
console.log(`cluster: ${local ? 'local validator' : 'devnet'}`);
console.log(`throwaway authority ${authority.publicKey.toBase58()}`);
console.log(`throwaway game signer ${game.publicKey.toBase58()}`);

// ---- funding: airdrop to the throwaway authority only -----------------------
const NEEDED = 0.2 * LAMPORTS_PER_SOL;
if (await connection.getBalance(authority.publicKey) < NEEDED) {
    try {
        const signature = await connection.requestAirdrop(authority.publicKey, LAMPORTS_PER_SOL);
        await connection.confirmTransaction({ signature, ...(await connection.getLatestBlockhash()) }, 'confirmed');
    } catch (error) {
        console.error('AIRDROP FAILED (verbatim):');
        console.error(error instanceof Error ? error.message : String(error));
        console.error(`Fund ${authority.publicKey.toBase58()} with devnet SOL (https://faucet.solana.com) and run again.`);
        process.exit(2);
    }
}
async function fund(to, lamports) {
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: to, lamports }));
    await sendAndConfirmTransaction(connection, tx, [authority], { commitment: 'confirmed' });
}
await fund(player.publicKey, 0.03 * LAMPORTS_PER_SOL);
await fund(oldHolder.publicKey, 0.01 * LAMPORTS_PER_SOL);
await fund(stranger.publicKey, 0.01 * LAMPORTS_PER_SOL);
// Only for the "what can the delegate do" probes at the end; the routes never need it funded.
await fund(game.publicKey, 0.02 * LAMPORTS_PER_SOL);

// ---- 1. the collection ------------------------------------------------------
const umi = createUmi(connection).use(mplCore());
const toUmi = (keypair) => createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(keypair.secretKey));
const authoritySigner = toUmi(authority);
const gameSigner = toUmi(game);
const strangerSigner = toUmi(stranger);
umi.use(keypairIdentity(authoritySigner));
const send = (builder) => builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
const fails = async (builder) => {
    try { await send(builder); return false; } catch { return true; }
};

const collectionSigner = generateSigner(umi);
await send(createCollection(umi, {
    collection: collectionSigner,
    name: 'Entangled Reptiles (devnet test)',
    uri: 'https://www.manic-entanglement.com/',
    plugins: [{
        type: 'Royalties', basisPoints: 500,
        creators: [{ address: authoritySigner.publicKey, percentage: 100 }], ruleSet: { type: 'None' },
    }],
}));
const collection = collectionSigner.publicKey;
console.log(`collection ${collection}`);

// Control: before it is a delegate, the game signer cannot create into the collection.
{
    const before = await fetchCollection(umi, collection);
    check('control: a non-delegate cannot create into the collection', await fails(create(umi, {
        asset: generateSigner(umi), collection: before, authority: gameSigner, payer: toUmi(player),
        owner: publicKey(player.publicKey.toBase58()), name: 'x', uri: 'https://x/x.json',
    })));
}

// ---- 2. the owner script's code: add the delegate ---------------------------
const first = await addGameDelegate(umi, collection, game.publicKey.toBase58());
check('delegate script: adds the UpdateDelegate plugin (no plugin before)', typeof first === 'string');
check('delegate script: a second run is a no-op', await addGameDelegate(umi, collection, game.publicKey.toBase58()) === null);
const second = await addGameDelegate(umi, collection, spare.publicKey.toBase58());
check('delegate script: appends to additionalDelegates when the plugin exists', typeof second === 'string');
{
    const now = await fetchCollection(umi, collection);
    const list = now.updateDelegate?.additionalDelegates ?? [];
    check('collection lists both delegates', list.includes(game.publicKey.toBase58()) && list.includes(spare.publicKey.toBase58()));
}

// ---- 3 and 4. the real route logic and client helper ------------------------
process.env.RUN_TOKEN_SECRET = randomBytes(32).toString('base64');
const vite = await createServer({
    root, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', resolve: { alias: { '@': root } }, optimizeDeps: { noDiscovery: true },
});
const service = await vite.ssrLoadModule('/lib/nft/service.ts');
const chainModule = await vite.ssrLoadModule('/lib/nft/chain.ts');
const client = await vite.ssrLoadModule('/lib/nft/client.ts');
const pending = await vite.ssrLoadModule('/lib/nft/_pending.ts');

const chain = chainModule.rpcChain(rpc);
if (local) chain.genesisHash = async () => GENESIS.devnet;
const deps = {
    config: { cluster: 'devnet', rpcUrl: rpc, collection, signer: game },
    chain,
    now: () => Date.now(),
};
const walletOf = (keypair) => ({
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => { tx.sign([keypair]); return tx; },
});
const balance = (key) => connection.getBalance(key, 'confirmed');
const P = player.publicKey.toBase58();

function proofFor(wallet, issuedAt, over = {}) {
    const tally = {
        moves: 400, ms: 300000, kills: 3, pickups: 5, bumps: 9, depth: 8, cleared: 7, lostToFights: 12,
        minExitEnergy: 20, wardens: 0, toolsUsed: { anchor: 1, twist: 0, cut: 0 }, darkCleared: 0, banked: 2,
        mode: 'descent', ...(over.tally ?? {}),
    };
    return pending.signProof({
        wallet, issuedAt, mode: over.mode ?? 'descent', tally, score: over.score ?? 420,
        pickedUp: over.pickedUp ?? [], gear: over.gear ?? { boots: 1, gloves: 0, shield: 1, speed: 0, backpack: 0 },
    });
}

/** Send a prepared transaction with the real client helper; measure it. */
async function sendMeasured(label, prepared, keypair) {
    if (typeof prepared.tx !== 'string') {
        console.log(`STOP: ${label} was not prepared: ${JSON.stringify(prepared)}`);
        process.exit(1);
    }
    const asset = new PublicKey(prepared.asset);
    const [walletBefore, assetBefore] = [await balance(keypair.publicKey), await balance(asset)];
    const signature = await client.signAndSend(prepared, walletOf(keypair), connection);
    const [walletAfter, assetAfter] = [await balance(keypair.publicKey), await balance(asset)];
    const meta = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    const space = (await connection.getAccountInfo(asset, 'confirmed')).data.length;
    const total = walletBefore - walletAfter;
    const network = meta.meta.fee;
    const measured = {
        label, signature, total, network,
        assetGrew: assetAfter - assetBefore,
        rentForSize: await connection.getMinimumBalanceForRentExemption(space),
        space, units: meta.meta.computeUnitsConsumed,
        bytes: Buffer.from(prepared.tx, 'base64').length,
        quoted: prepared.fee,
    };
    check(`${label}: quoted fee equals the measured cost`, prepared.fee.total === total,
        `quoted ${prepared.fee.total}, measured ${total}`);
    check(`${label}: quoted network fee equals the charged fee`, prepared.fee.network === network,
        `quoted ${prepared.fee.network}, charged ${network}`);
    return measured;
}
/** Why a reply is not a prepared transaction ('' when it is one). */
const why = (r) => (r.status === 200 ? '' : JSON.stringify(r.body).slice(0, 300));
const costs = [];
const t0 = Date.now() - 60_000;

// Refusals first.
let reply = await service.prepareMint({ wallet: P, proofs: [proofFor(P, t0, { tally: { depth: 7 } })], look: starter() }, deps);
check('mint refused below depth 8', reply.status === 403 && reply.body.error === 'goal_not_reached');
reply = await service.prepareMint({ wallet: P, proofs: [proofFor(P, t0)], look: { ...starter(), Body: 'Gold' } }, deps);
check('mint refused with a locked trait', reply.status === 400 && reply.body.error === 'locked_trait');
function starter() {
    return { Back: 'None', Body: 'Green', Clothes: 'None', Eye: 'Regular', Head: 'None', Background: 'Void' };
}

// The mint.
const numBefore = (await fetchCollection(umi, collection)).numMinted;
reply = await service.prepareMint({ wallet: P, proofs: [proofFor(P, t0)], look: starter() }, deps);
check('mint prepared', reply.status === 200, why(reply));
const mint = reply.body;
const mintCost = await sendMeasured('mint', mint, player);
costs.push(mintCost);
const ASSET = mint.asset;
let asset = await fetchAsset(umi, publicKey(ASSET));
check('(a) the collection delegate created an asset in the collection',
    asset.updateAuthority.type === 'Collection' && asset.updateAuthority.address === collection);
check('minted asset: owner is the player', asset.owner === P);
check('minted asset: name numbered from numMinted', asset.name === `Entangled Reptile #${numBefore + 1}`, asset.name);
check('minted asset: uri and attributes as quoted', asset.uri === mint.summary.uri
    && JSON.stringify(asset.attributes.attributeList) === JSON.stringify(mint.summary.attributes), asset.uri);
check('collection numMinted went up by one', (await fetchCollection(umi, collection)).numMinted === numBefore + 1);

reply = await service.prepareMint({ wallet: P, proofs: [proofFor(P, t0 + 1)], look: starter() }, deps);
check('second mint refused: the wallet holds a reptile', reply.status === 409 && reply.body.error === 'already_holds');
reply = await service.prepareMint({ wallet: P, proofs: [proofFor(P, t0)], look: starter() },
    { ...deps, chain: { ...chain, reptilesOwnedBy: async () => [] } });
check('same proof cannot mint twice even past the holder check', reply.status === 409 && reply.body.error === 'proof_used');

// Save 1: same-size change (new run, Head None -> Hood).
// Every counter keeps its digit count, so the account keeps its size.
const save1Proofs = [proofFor(P, t0 + 1000, { score: 555, tally: { kills: 4, cleared: 2, banked: 2 } })];
reply = await service.prepareSave({ wallet: P, asset: ASSET, proofs: save1Proofs, look: { ...starter(), Head: 'Hood' } }, deps);
check('save 1 prepared', reply.status === 200, why(reply));
const save1 = reply.body;
costs.push(await sendMeasured('save (same size)', save1, player));
asset = await fetchAsset(umi, publicKey(ASSET));
const attr = (key) => asset.attributes.attributeList.find((entry) => entry.key === key)?.value;
check('(b) the collection delegate updated the uri and the Attributes plugin',
    asset.uri === save1.summary.uri.to && attr('Head') === 'Hood' && attr('Best Descent') === '555' && attr('Runs') === '2',
    asset.uri);

// Replay: the same proofs and look change nothing.
reply = await service.prepareSave({ wallet: P, asset: ASSET, proofs: [proofFor(P, t0), ...save1Proofs], look: { ...starter(), Head: 'Hood' } }, deps);
check('replaying the same proofs changes nothing', reply.status === 409 && reply.body.error === 'nothing_to_save',
    why(reply));

// Save 2: grows the list (a first Sprint best adds a key) and adds pickups.
reply = await service.prepareSave({
    wallet: P, asset: ASSET, look: null,
    proofs: [proofFor(P, t0 + 2000, { mode: 'sprint', score: 91234, tally: { depth: 5, mode: 'sprint' }, pickedUp: [{ layer: 'Back', trait: 'Oxygen' }] })],
}, deps);
check('save 2 prepared', reply.status === 200, why(reply));
const save2 = reply.body;
costs.push(await sendMeasured('save (list grows)', save2, player));
asset = await fetchAsset(umi, publicKey(ASSET));
check('save 2 read back', asset.uri === save2.summary.uri.to && attr('Best Sprint') === '91234' && attr('Head') === 'Hood');

// Unknown keys survive: the authority adds one by hand, then a save runs.
await send(updatePlugin(umi, {
    asset: asset.publicKey, collection,
    plugin: { type: 'Attributes', attributeList: [...asset.attributes.attributeList, { key: 'High Score', value: '292' }] },
}));
reply = await service.prepareSave({ wallet: P, asset: ASSET, look: null, proofs: [proofFor(P, t0 + 3000, { score: 777 })] }, deps);
check('save 3 prepared', reply.status === 200, why(reply));
costs.push(await sendMeasured('save (after a foreign key)', reply.body, player));
asset = await fetchAsset(umi, publicKey(ASSET));
check('unknown attribute key kept through a save', attr('High Score') === '292' && attr('Best Descent') === '777');

// Refusals on save.
reply = await service.prepareSave({ wallet: stranger.publicKey.toBase58(), asset: ASSET, look: null, proofs: [proofFor(stranger.publicKey.toBase58(), t0 + 4000)] }, deps);
check('a non-owner cannot save', reply.status === 403 && reply.body.error === 'not_owner');
reply = await service.prepareSave({ wallet: P, asset: ASSET, look: null, proofs: [proofFor(stranger.publicKey.toBase58(), t0 + 4000)] }, deps);
check("another wallet's proof is refused", reply.status === 403 && reply.body.error === 'wrong_wallet');

// An old-style asset (made by the authority, look-only attributes like the
// real holders, old uri): its first save rewrites the list.
const oldAsset = generateSigner(umi);
const H = oldHolder.publicKey.toBase58();
await send(create(umi, {
    asset: oldAsset, collection: await fetchCollection(umi, collection), owner: publicKey(H),
    name: 'Entangled Reptile', uri: 'https://example.invalid/ipfs/QmQUk95h6ChFUucCw2gdg2hd1j7LU2vFtgFDZ4Ax3MxLvW',
    plugins: [{
        type: 'Attributes',
        attributeList: [
            ['Head', 'Crown'], ['Eye', 'Regular'], ['Clothes', 'White'], ['Body', 'Purple'], ['Back', 'None'],
            ['High Score', '292'], ['Attack', '1.2'], ['Defense', '1.3'], ['Speed', '1.02'], ['Consumption', '0.98'],
            ['Energy Storage', '120'],
        ].map(([key, value]) => ({ key, value })),
    }],
}));
reply = await service.prepareSave({ wallet: H, asset: oldAsset.publicKey, look: null, proofs: [proofFor(H, t0 + 5000)] }, deps);
check('old holder: first save prepared', reply.status === 200, why(reply));
if (reply.status === 200) {
    costs.push(await sendMeasured('first save on an old asset', reply.body, oldHolder));
    const old = await fetchAsset(umi, oldAsset.publicKey);
    check('old holder: unknown key kept, uri moved to the game', old.attributes.attributeList.some((e) => e.key === 'High Score' && e.value === '292')
        && old.uri.startsWith('https://www.manic-entanglement.com/api/reptile/'));
}

// An asset with no Attributes plugin at all: the save adds the plugin.
const bare = generateSigner(umi);
await send(create(umi, {
    asset: bare, collection: await fetchCollection(umi, collection), owner: publicKey(H),
    name: 'Entangled Reptile', uri: 'https://example.invalid/bare.json',
}));
reply = await service.prepareSave({ wallet: H, asset: bare.publicKey, look: null, proofs: [] }, deps);
check('asset without the plugin: save prepared', reply.status === 200, why(reply));
if (reply.status === 200) {
    costs.push(await sendMeasured('first save, plugin added', reply.body, oldHolder));
    check('asset without the plugin: now has attributes', (await fetchAsset(umi, bare.publicKey)).attributes !== undefined);
}

// ---- what else the delegate key could do (for the owner's risk view) --------
console.log('\nWhat the game signer (a collection Update Delegate) can do on its own:');
const fresh = await fetchCollection(umi, collection);
asset = await fetchAsset(umi, publicKey(ASSET));
const probe = async (label, builder) => console.log(`  ${(await fails(builder)) ? 'cannot' : 'CAN   '}  ${label}`);
await probe("transfer a player's asset", transfer(umi, { asset, collection: fresh, newOwner: gameSigner.publicKey, authority: gameSigner, payer: gameSigner }));
await probe("burn a player's asset", burn(umi, { asset, collection: fresh, authority: gameSigner, payer: gameSigner }));
await probe('rename the collection / change its uri', updateCollection(umi, { collection, name: 'Renamed by delegate', authority: gameSigner, payer: gameSigner }));
await probe('add another delegate', (await import('@metaplex-foundation/mpl-core')).updateCollectionPlugin(umi, {
    collection, authority: gameSigner, payer: gameSigner,
    plugin: { type: 'UpdateDelegate', additionalDelegates: [...fresh.updateDelegate.additionalDelegates, strangerSigner.publicKey] },
}));
await probe('change the collection royalties', (await import('@metaplex-foundation/mpl-core')).updateCollectionPlugin(umi, {
    collection, authority: gameSigner, payer: gameSigner,
    plugin: { type: 'Royalties', basisPoints: 9000, creators: [{ address: gameSigner.publicKey, percentage: 100 }], ruleSet: { type: 'None' } },
}));
await probe('create an asset into the collection for itself', create(umi, {
    asset: generateSigner(umi), collection: fresh, authority: gameSigner, payer: gameSigner, name: 'Rogue', uri: 'https://x/x.json',
}));
await probe("rewrite any holder's attributes", updatePlugin(umi, {
    asset: asset.publicKey, collection, authority: gameSigner, payer: gameSigner,
    plugin: { type: 'Attributes', attributeList: asset.attributes.attributeList },
}));

// ---- the measured costs -----------------------------------------------------
console.log('\nMeasured costs (from balances):');
for (const cost of costs) {
    const protocol = cost.label === 'mint' ? cost.assetGrew - cost.rentForSize : cost.total - cost.network - cost.assetGrew;
    const rent = cost.label === 'mint' ? cost.rentForSize : cost.assetGrew;
    console.log(`- ${cost.label}`);
    console.log(`    total    ${sol(cost.total)}`);
    console.log(`    network  ${sol(cost.network)}`);
    console.log(`    rent     ${sol(rent)}  (account is ${cost.space} bytes)`);
    console.log(`    protocol ${sol(protocol)}`);
    console.log(`    quoted   network ${cost.quoted.network}, rent ${cost.quoted.rent}, protocol ${cost.quoted.protocol}, total ${cost.quoted.total}`);
    console.log(`    compute units ${cost.units}, transaction ${cost.bytes} bytes`);
    console.log(`    signature ${cost.signature}`);
    check(`${cost.label}: quoted split matches`, cost.quoted.rent === rent && cost.quoted.protocol === protocol);
}

await vite.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
