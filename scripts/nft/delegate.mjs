// Shared by add-game-delegate.mjs and devnet-e2e.mjs: make a public key a
// collection Update Delegate. The collection's update authority must be the
// umi identity. Returns the transaction signature (base58), or null when the
// key is already a delegate.
import { addCollectionPlugin, fetchCollection, updateCollectionPlugin } from '@metaplex-foundation/mpl-core';
import { publicKey } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';

export const GENESIS = {
    mainnet: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
    devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

export async function addGameDelegate(umi, collectionAddress, delegateAddress) {
    const delegate = publicKey(delegateAddress);
    const collection = await fetchCollection(umi, publicKey(collectionAddress));
    if (collection.updateAuthority !== umi.identity.publicKey) {
        throw new Error('this keypair is not the collection update authority');
    }
    if (delegate === umi.identity.publicKey) throw new Error('the game signer must be a different key');
    const plugin = collection.updateDelegate;
    let builder;
    if (plugin === undefined) {
        // No UpdateDelegate plugin yet: add it. Its own authority stays the
        // update authority; the game signer goes into additionalDelegates.
        builder = addCollectionPlugin(umi, {
            collection: collection.publicKey,
            plugin: { type: 'UpdateDelegate', additionalDelegates: [delegate] },
        });
    } else {
        const holdsIt = plugin.authority.type === 'Address' && plugin.authority.address === delegate;
        if (holdsIt || plugin.additionalDelegates.includes(delegate)) return null;
        builder = updateCollectionPlugin(umi, {
            collection: collection.publicKey,
            plugin: { type: 'UpdateDelegate', additionalDelegates: [...plugin.additionalDelegates, delegate] },
        });
    }
    const { signature, result } = await builder.sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
    if (result.value.err !== null) throw new Error('the transaction failed on chain');
    return base58.deserialize(signature)[0];
}
