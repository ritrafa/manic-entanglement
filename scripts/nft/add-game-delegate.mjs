#!/usr/bin/env node
// OWNER SCRIPT. Adds the game signer to the Entangled Reptiles collection as
// an Update Delegate, so the server can co-sign mints and saves while the
// collection's own authority key stays offline.
//
//   node scripts/nft/add-game-delegate.mjs <owner-keypair-path> <game-signer-pubkey> --cluster mainnet
//
// Options:
//   --cluster devnet|mainnet   required; the RPC must answer for that cluster
//   --rpc <https url>          default: the SOLANA_RPC_URL variable, else the public endpoint
//   --collection <address>     devnet only (mainnet always uses the real collection)
//   --verbose true             on failure, print the full error (it may quote your RPC URL)
//
// It prints only the transaction signature. The keypair file is read once,
// used to sign this one transaction, and never printed or written anywhere.
// The transaction costs the authority a few thousand lamports plus the rent
// for 40 more bytes on the collection account.
import fs from 'node:fs';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { addGameDelegate, GENESIS } from './delegate.mjs';

const MAINNET_COLLECTION = 'Dj5gDUph6CuUiQBjh31HhpmJTXhhfHzbMTNK89wNHzvz';
const PUBLIC_RPC = { mainnet: 'https://api.mainnet-beta.solana.com', devnet: 'https://api.devnet.solana.com' };

function fail(message) {
    console.error(`add-game-delegate: ${message}`);
    process.exit(1);
}

const args = process.argv.slice(2);
const positional = [];
const options = {};
for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
        options[args[i].slice(2)] = args[i + 1];
        i += 1;
    } else {
        positional.push(args[i]);
    }
}
const [keypairPath, gameSigner] = positional;
const cluster = options.cluster;
if (!keypairPath || !gameSigner || (cluster !== 'devnet' && cluster !== 'mainnet')) {
    fail('usage: add-game-delegate.mjs <owner-keypair-path> <game-signer-pubkey> --cluster devnet|mainnet [--rpc url] [--collection address]');
}
if (cluster === 'mainnet' && options.collection !== undefined && options.collection !== MAINNET_COLLECTION) {
    fail('--collection is for devnet only');
}
const collection = cluster === 'mainnet' ? MAINNET_COLLECTION : options.collection;
if (!collection) fail('devnet needs --collection <address>');
try {
    publicKey(gameSigner);
    publicKey(collection);
} catch {
    fail('the game signer and the collection must be base58 public keys');
}

const rpc = options.rpc ?? process.env.SOLANA_RPC_URL ?? PUBLIC_RPC[cluster];
const umi = createUmi(rpc, { commitment: 'confirmed' }).use(mplCore());

let secret;
try {
    secret = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
} catch {
    fail('could not read the keypair file (expected the JSON array solana-keygen writes)');
}
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

try {
    const genesis = await umi.rpc.call('getGenesisHash');
    if (genesis !== GENESIS[cluster]) fail(`the RPC does not answer for ${cluster}`);
    const signature = await addGameDelegate(umi, collection, gameSigner);
    if (signature === null) {
        console.error('add-game-delegate: this key is already a delegate; nothing sent');
    } else {
        console.log(signature);
    }
} catch (error) {
    // The message of an RPC error can carry the endpoint; print the kind only
    // unless it is one of this script's own plain messages or --verbose is on.
    const text = error instanceof Error ? error.message : '';
    const plain = /^(this keypair|the game signer|the transaction failed)/.test(text) || options.verbose !== undefined;
    fail(plain ? text : 'the transaction could not be sent or confirmed (run again with --verbose true for the full error)');
}
