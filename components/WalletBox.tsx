'use client';

import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { loadReptile } from '@/lib/reptile';
import { pfpLayers, type Look } from '@/game/sprite';
import GameState from '@/lib/GameState';
import { peekProof } from '@/lib/nft/proofPeek';
import MintPanel from './MintPanel';
import { SavePanel } from './SavePanel';
import WalletContextProvider from './WalletContextProvider';
import NftModal from './NftModal';

interface WalletBoxProps {
    gameState: GameState;
}

type LoadStatus = 'idle' | 'loading' | 'found' | 'none' | 'error';

/** The reptile the last lookup found, kept for the "found" state. */
interface FoundReptile {
    look: Look;
    number: string | null;
}

/** A CSS custom property in a style object (--s sizes the sprite). */
function cssVars(vars: Record<string, string>): React.CSSProperties {
    return vars as React.CSSProperties;
}

/** An address shows shortened only: first four, last four (design/components/WalletBox). */
function shortAddress(address: string): string {
    return address.length > 8 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
}

/** The wallet corner of the HUD, the design's WalletBox
 *  (design/components/WalletBox): closed until the HUD's Wallet button pulls
 *  this in, then one small box — connect, looking up, reptile found with its
 *  PFP and number, none found, network failure. A JSON-RPC error reply from
 *  the endpoint reads as a network failure, never as an empty wallet
 *  (lib/reptile.ts, E15 review). Saving and minting come later, so no chain
 *  feature is advertised here; the box only ever changes the look
 *  (gameState.setLook), never stats or the high score, and the HUD's own PFP
 *  portrait follows that look — it is built locally, never from the NFT's
 *  image address.
 *
 *  The wallet code lives behind components/WalletGate.tsx (next/dynamic,
 *  ssr: false): this file brings its own provider — and with it the wallet
 *  CSS the provider imports — so nothing from @solana/* is on the page
 *  before the Wallet button is clicked. The connect button and the reptile
 *  loader sit in the inner component, under the provider, so their hooks
 *  see the live wallet context. Rendered only when an RPC endpoint is
 *  configured (components/Hud.tsx), so the useWallet hook here always has
 *  its provider. */
const WalletBox: React.FC<WalletBoxProps> = ({ gameState }) => (
    <WalletContextProvider>
        <WalletBoxContent gameState={gameState} />
    </WalletContextProvider>
);

/** The box as it was before the lazy split, unchanged: it only ever renders
 *  as a child of WalletContextProvider, so useWallet has its context. */
const WalletBoxContent: React.FC<WalletBoxProps> = ({ gameState }) => {
    const { publicKey, disconnect } = useWallet();
    const [status, setStatus] = useState<LoadStatus>('idle');
    const [reptile, setReptile] = useState<FoundReptile | null>(null);
    // True right after a load merged the reptile's carried progress into the
    // save (Q24): the status line reads "Progress restored" once (the shell's
    // toast says the same over the board).
    const [restored, setRestored] = useState(false);
    // The two panels the box opens (E72): Mint from "None found", Save from
    // the found state. Each stays up until its own button closes it.
    const [mintOpen, setMintOpen] = useState(false);
    const [saveOpen, setSaveOpen] = useState(false);
    // The pending-proof count (E70): the shell keeps signed runs in the save
    // until the player saves them to the NFT; the box only hints at it.
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);

    // Tell the shell which wallet is connected (E70): only then does a run
    // ask /api/run/start for its seed. Leaving the box disconnects it too.
    useEffect(() => {
        gameState.setWallet(publicKey ? publicKey.toBase58() : null);
        return () => {
            gameState.setWallet(null);
        };
    }, [publicKey, gameState]);

    const handleCheckAssets = useCallback(async () => {
        if (!publicKey) return;
        setStatus('loading');
        // loadReptile never throws: every failure comes back as a status,
        // and a JSON-RPC error reply comes back as 'error' too.
        const result = await loadReptile(publicKey.toBase58());
        if (result.status === 'found') {
            // The loaded look goes straight to the shell; the HUD portrait follows.
            gameState.setLook(result.look);
            setReptile({ look: result.look, number: result.number ?? null });
            // The shell learns the asset and the on-chain look (the save flow
            // writes to it and compares against it), and the reptile restores
            // the progress it carries (Q24): bests, totals, feats, traits and
            // gear merge into the save, and the toast says so once.
            gameState.setReptile({
                asset: result.asset ?? null,
                number: result.number ?? null,
                look: result.progress?.look ?? null,
            });
            setRestored(result.progress !== undefined && gameState.restoreReptileProgress(result.progress));
        } else {
            setReptile(null);
            gameState.setReptile(null);
            setRestored(false);
        }
        setStatus(result.status);
    }, [publicKey, gameState]);

    const handleDisconnect = useCallback(() => {
        setStatus('idle');
        setReptile(null);
        setRestored(false);
        setMintOpen(false);
        setSaveOpen(false);
        gameState.setReptile(null);
        void disconnect();
    }, [disconnect, gameState]);

    const address = publicKey?.toBase58();
    // The Save button wakes when this wallet has proofs waiting or the
    // wardrobe picked a look since the reptile loaded (E72).
    const saveReady = model.hasReptile
        && (model.lookPickedSinceLoad
            || (address !== undefined
                && gameState.getPendingProofs().some((proof) => peekProof(proof)?.wallet === address)));

    return (
        <div className="left-box">
            <div className="me-wallet">
                <WalletMultiButton />
                {model.pendingProofs > 0 && (
                    <p className="me-hint" role="status">
                        {model.pendingProofs} {model.pendingProofs === 1 ? 'run' : 'runs'} to save
                    </p>
                )}
                {address !== undefined && status !== 'found' && (
                    <button
                        type="button"
                        className="me-btn me-btn-block"
                        onClick={handleCheckAssets}
                        disabled={status === 'loading'}
                    >
                        Check assets
                    </button>
                )}
                {status === 'loading' && (
                    <p className="me-status is-busy" role="status">Loading...</p>
                )}
                {status === 'found' && restored && (
                    <p className="me-status is-ok" role="status">Progress restored</p>
                )}
                {status === 'found' && reptile !== null && (
                    <>
                        <div className="me-wallet-id">
                            <div className="me-sprite" style={cssVars({ '--s': '48px' })} role="img" aria-label="Your Entangled Reptile">
                                {pfpLayers(reptile.look).map((url) => (
                                    <img key={url} src={url} alt="" width={48} height={48} draggable={false} />
                                ))}
                            </div>
                            <div>
                                <p className="me-display-sm">{reptile.number !== null ? `Reptile #${reptile.number}` : 'Entangled Reptile'}</p>
                                {address !== undefined && <p className="me-hint">Wallet {shortAddress(address)}</p>}
                            </div>
                        </div>
                        <div className="me-row">
                            <button
                                type="button"
                                className="me-btn me-btn-gold me-btn-sm"
                                onClick={() => setSaveOpen(true)}
                                disabled={!saveReady}
                            >
                                Save
                            </button>
                            <button type="button" className="me-btn me-btn-sm" onClick={handleDisconnect}>Disconnect</button>
                        </div>
                    </>
                )}
                {status === 'none' && (
                    <>
                        {address !== undefined && <p className="me-hint">Wallet {shortAddress(address)}</p>}
                        <p className="me-status" role="status">No Entangled Reptile in this wallet</p>
                        <button type="button" className="me-btn me-btn-block" onClick={() => setMintOpen(true)}>
                            Mint a reptile
                        </button>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <p className="me-status is-bad" role="alert">Could not reach the network</p>
                        <button type="button" className="me-btn me-btn-block" onClick={handleCheckAssets}>
                            Try again
                        </button>
                    </>
                )}
                {mintOpen && address !== undefined && (
                    <NftModal label="Mint a reptile">
                        <MintPanel
                            gameState={gameState}
                            wallet={address}
                            onClose={() => setMintOpen(false)}
                            onMinted={() => void handleCheckAssets()}
                        />
                    </NftModal>
                )}
                {saveOpen && (
                    <NftModal label="Save progress to my NFT">
                        <SavePanel
                            gameState={gameState}
                            onClose={() => setSaveOpen(false)}
                            onSaved={() => void handleCheckAssets()}
                        />
                    </NftModal>
                )}
            </div>
        </div>
    );
};

export default WalletBox;
