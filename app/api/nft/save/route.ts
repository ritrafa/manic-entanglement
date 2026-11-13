// POST /api/nft/save: every check lives in lib/nft/service.ts.
import { nftHandler } from '@/lib/nft/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = nftHandler('save');
