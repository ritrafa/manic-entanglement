import { 
    create, 
    fetchCollection,
    ruleSet
  } from '@metaplex-foundation/mpl-core';
  import { generateSigner } from '@metaplex-foundation/umi';
  import { createUmiInstance, txConfig } from './server-utils';
  
  export const createNFT = async (collectionAddress: string, uri: string, selectedTraits: { [key: string]: string }) => {
    const { umi, myKeypairSigner } = createUmiInstance();
  
    const asset = generateSigner(umi);
    const collection = await fetchCollection(umi, collectionAddress);
    
    const result = await create(umi, {
      asset: asset,
      collection: collection,
      name: 'Entangled Reptile',
      uri: uri,
      plugins: [
        {
          type: 'Royalties',
          basisPoints: 500,
          creators: [
            {
              address: myKeypairSigner.publicKey,
              percentage: 100,
            },
          ],
          ruleSet: ruleSet('None'),
        },
        {
          type: 'Attributes',
          attributeList: Object.entries(selectedTraits).map(([key, value]) => ({ key, value }))
        }
      ],
    }).sendAndConfirm(umi, txConfig);
  
    return result;
  };