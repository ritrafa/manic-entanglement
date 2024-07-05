import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { createSignerFromKeypair, signerIdentity, TransactionBuilderSendAndConfirmOptions } from '@metaplex-foundation/umi';

export const createUmiInstance = () => {
  const umi = createUmi('https://api.mainnet-beta.solana.com', 'processed').use(mplCore());
  
  if (!process.env.WALLET_PRIVATE_KEY) {
    throw new Error('WALLET_PRIVATE_KEY is not set');
  }

  const secretKey = JSON.parse(process.env.WALLET_PRIVATE_KEY);
  const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
  const myKeypairSigner = createSignerFromKeypair(umi, keypair);

  umi.use(signerIdentity(myKeypairSigner));

  return { umi, myKeypairSigner };
};

export const txConfig: TransactionBuilderSendAndConfirmOptions = {
  send: { skipPreflight: true },
  confirm: { commitment: 'processed' },
};