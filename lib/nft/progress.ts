// The two interfaces the on-chain code builds on, in one place: the attribute
// codec and merge rule (game/nftProgress.ts, E69) and the signed run proofs
// (lib/server/runToken.ts, E70). lib/nft imports them only through this file.
export {
    encodeAttributes, decodeAttributes, mergeProgress, progressVersion,
} from '@/game/nftProgress';
export type { NftProgress, NftLook as ChosenLook, AttributeEntry as Attribute } from '@/game/nftProgress';
export { readProof, signProof } from '@/lib/server/runToken';
export type { ProofPayload } from '@/lib/server/runToken';
