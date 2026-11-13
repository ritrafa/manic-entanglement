// The shape every mint and save transaction has, checked with nothing but
// @solana/web3.js so the browser helper (lib/nft/client.ts) can share it with
// the server without pulling the Metaplex packages into the client bundle.
import type { VersionedTransaction } from '@solana/web3.js';

export const CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
export const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';

/** The program ids a transaction's instructions call, in order. */
export function programIds(tx: VersionedTransaction): string[] {
    const keys = tx.message.staticAccountKeys;
    return tx.message.compiledInstructions.map((ix) => keys[ix.programIdIndex]?.toBase58() ?? '');
}

/**
 * True when a transaction is one of ours by shape: a legacy message paid by
 * `wallet`, starting with the two compute budget instructions, followed by
 * one or two Metaplex Core instructions and nothing else. So the wallet's
 * signature can never move its SOL or tokens anywhere: no system transfer,
 * no token program, no unknown program. The server runs this before it
 * signs; the client runs it before it asks the wallet to sign.
 */
export function isReptileTransaction(tx: VersionedTransaction, wallet: string): boolean {
    if (tx.message.version !== 'legacy') return false;
    if (tx.message.staticAccountKeys[0]?.toBase58() !== wallet) return false;
    const programs = programIds(tx);
    if (programs.length < 3 || programs.length > 4) return false;
    if (programs[0] !== COMPUTE_BUDGET_PROGRAM_ID || programs[1] !== COMPUTE_BUDGET_PROGRAM_ID) return false;
    return programs.slice(2).every((id) => id === CORE_PROGRAM_ID);
}
