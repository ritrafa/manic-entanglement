import { NextRequest, NextResponse } from 'next/server';
import { pinFileToIPFS } from '@/lib/ipfs';
import { createNFT } from '@/lib/nft';

export async function POST(req: NextRequest) {
  try {
    const { gifBlob, selectedTraits } = await req.json();

    console.log('Received request with traits:', selectedTraits);

    // Convert base64 to buffer
    const buffer = Buffer.from(gifBlob.split(',')[1], 'base64');

    console.log('Converted blob to buffer');

    // Pin file to IPFS
    const ipfsResponse = await pinFileToIPFS(buffer, 'reptile.gif');

    console.log('Pinned file to IPFS:', ipfsResponse);

    // Create NFT
    const collectionAddress = process.env.NEXT_PUBLIC_COLLECTION_ADDRESS;
    if (!collectionAddress) {
      throw new Error('Collection address not set');
    }
    const nftResult = await createNFT(collectionAddress, ipfsResponse.IpfsHash, selectedTraits);

    console.log('NFT created:', nftResult);

    return NextResponse.json({ message: 'NFT created successfully', result: nftResult });
  } catch (error: unknown) {
    console.error('Error in create-nft route:', error);
    
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    return NextResponse.json({ message: 'Error creating NFT', error: errorMessage }, { status: 500 });
  }
}