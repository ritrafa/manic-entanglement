'use client';

// The first mint (E72, design/components/Mint): a wallet with no reptile
// sees the panel locked until a verified run reaches the goal depth, then a
// starter-trait picker with a live preview and the mint action. The goal
// line and the terms are the owner's words, not the spec example's: the
// goal is depth 8 in a *verified* run (proofPeek.MINT_GOAL_DEPTH, the same
// value the mint route enforces), and the terms tell the honest cost - the
// quote's total fee in SOL, most of it a rent deposit returned on a burn.
// The signing goes through lib/nft/client.ts: requestMint for the quote,
// signAndSend for the wallet's signature; every error is an NftError whose
// code maps to one plain reason here.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

import GameState from '@/lib/GameState';
import { NftError, requestMint, signAndSend, type LookChoice, type Prepared } from '@/lib/nft/client';
import { bestVerifiedDepth, MINT_GOAL_DEPTH, peekProof } from '@/lib/nft/proofPeek';
import { FREE_TRAITS } from '@/game/wardrobe';
import { DEFAULT_LOOK, LAYER_ORDER, TRAITS, frameAt, pfpLayers, spriteLayers, type Layer, type Look } from '@/game/sprite';

interface MintPanelProps {
    gameState: GameState;
    /** The connected wallet's address (base58). */
    wallet: string;
    onClose: () => void;
    /** Called after a confirmed mint so the box reloads the reptile. */
    onMinted: () => void;
}

/** A quote older than this is refreshed before the mint (the server's own
 *  quote lasts about a minute). */
const QUOTE_MAX_AGE_MS = 45_000;

/** The picker's sizes, from the design preview. */
const PFP_PX = 144;
const RUNNER_PX = 48;

/** A CSS custom property in a style object (--s sizes the sprite, --v the meter). */
function cssVars(vars: Record<string, string>): React.CSSProperties {
    return vars as React.CSSProperties;
}

/** Lamports as the four-decimal SOL the terms line reads. */
function solText(lamports: number): string {
    return (lamports / 1_000_000_000).toFixed(4);
}

/** The starter traits of one layer as the picker shows them: the free ones,
 *  plus the bare None where the layer has one (Head None and Hood). */
function freeTraitsOf(layer: Layer): readonly string[] {
    const free = FREE_TRAITS[layer];
    if (free === undefined) return [];
    if (!TRAITS[layer].includes('None') || free.includes('None')) return free;
    return ['None', ...free];
}

/** The picker's starting look: the default, worn down to what is free. */
function starterLook(): Look {
    const look: Look = { ...DEFAULT_LOOK };
    for (const layer of LAYER_ORDER) {
        const free = freeTraitsOf(layer);
        if (free.length === 0) continue;
        look[layer] = free.includes(look[layer]) ? look[layer] : free[0];
    }
    return look;
}

/** The look as the mint route takes it: the five layers and the Void
 *  background (Q25 - the Solana gradient is a feat reward, never a starter). */
function mintChoice(look: Look): LookChoice {
    return { ...look, Background: 'Void' };
}

/** The plain reason under a failed status, from the error's code. */
function mintReason(error: unknown, sol: string): string {
    const code = error instanceof NftError ? error.code : 'unknown';
    switch (code) {
        case 'declined':
            return 'You declined in your wallet.';
        case 'network':
        case 'chain_unavailable':
        case 'not_confirmed':
            return 'Could not reach the network.';
        case 'goal_not_reached':
        case 'bad_proof':
        case 'expired_proof':
        case 'proof_used':
            return 'The run could not be verified.';
        case 'insufficient_funds':
            return `Your wallet needs about ${sol} SOL.`;
        default:
            return 'Something went wrong. Nothing was charged.';
    }
}

type Phase = 'form' | 'approve' | 'minting' | 'minted' | 'failed';

/** One step of the me-steps list. */
function stepClass(done: boolean, now: boolean, bad = false): string {
    return bad ? 'is-bad' : now ? 'is-now' : done ? 'is-done' : '';
}

/**
 * The mint panel, opened from the wallet box's "None found" state. Locked
 * until the wallet's best verified run reaches MINT_GOAL_DEPTH; then the
 * picker: one chip row per layer with starter traits, the 144px PFP that
 * gets minted and the 48px runner that wears the same look, both live.
 * The quote comes when the picker opens (its total fee fills the terms
 * line) and is refreshed on Mint when older than 45 s. Minting walks the
 * design's steps - Approve, Mint - and ends on "Minted. This reptile is
 * yours." with a Play button, or on a plain reason the player can read.
 * Rendered inside the wallet box, under the wallet provider.
 */
const MintPanel: React.FC<MintPanelProps> = ({ gameState, wallet, onClose, onMinted }) => {
    const { publicKey, signTransaction } = useWallet();
    const { connection } = useConnection();
    // The proofs are read when the panel opens and when the mint runs; the
    // shell's count is the signal that the list moved underneath.
    const proofsForWallet = useCallback(
        () => gameState.getPendingProofs().filter((proof) => peekProof(proof)?.wallet === wallet),
        [gameState, wallet],
    );
    const proofs = proofsForWallet();
    const best = bestVerifiedDepth(proofs, wallet);
    const unlocked = best >= MINT_GOAL_DEPTH;

    const [look, setLook] = useState<Look>(starterLook);
    const [phase, setPhase] = useState<Phase>('form');
    const [reason, setReason] = useState('');
    const [quote, setQuote] = useState<Prepared | null>(null);
    const [quoteAt, setQuoteAt] = useState(0);
    const [quoteFailed, setQuoteFailed] = useState(false);
    // A frame of the clock so the runner preview animates like the game's.
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setTick(Date.now()), 150);
        return () => clearInterval(timer);
    }, []);

    // The quote arrives once, when the picker opens; nothing is signed by
    // asking. The look and proofs it asks about are the ones of this instant
    // (refs), so changing a chip never spams the route - Mint refreshes a
    // stale quote itself.
    const lookRef = useRef(look);
    useEffect(() => { lookRef.current = look; }, [look]);
    const requestedRef = useRef(false);
    useEffect(() => {
        if (!unlocked || requestedRef.current) return;
        requestedRef.current = true;
        let cancelled = false;
        void (async () => {
            try {
                const prepared = await requestMint({
                    wallet, proofs: proofsForWallet(), look: mintChoice(lookRef.current),
                });
                if (!cancelled) { setQuote(prepared); setQuoteAt(Date.now()); }
            } catch {
                // The terms line then reads without a number, and Mint will
                // ask again - a failed quote never blocks the player.
                if (!cancelled) setQuoteFailed(true);
            }
        })();
        return () => { cancelled = true; };
    }, [unlocked, wallet, proofsForWallet]);

    const sol = quote === null ? '…' : solText(quote.fee.total);

    const mint = useCallback(async () => {
        if (publicKey === null || typeof signTransaction !== 'function') return;
        setReason('');
        setPhase('approve');
        try {
            let current = quote;
            if (current === null || Date.now() - quoteAt > QUOTE_MAX_AGE_MS) {
                current = await requestMint({ wallet, proofs: proofsForWallet(), look: mintChoice(look) });
                setQuote(current);
                setQuoteAt(Date.now());
                setQuoteFailed(false);
            }
            setPhase('minting');
            await signAndSend(current, { publicKey, signTransaction }, connection);
            setPhase('minted');
            // The reptile is real now: the box reloads it behind the panel.
            onMinted();
        } catch (error) {
            setReason(mintReason(error, sol));
            setPhase('failed');
        }
    }, [publicKey, signTransaction, connection, quote, quoteAt, wallet, proofsForWallet, look, onMinted, sol]);

    const terms = `One reptile per wallet. Minting costs about ${sol} SOL, most of it a deposit you get back if the reptile is ever burned.`;

    if (!unlocked) {
        return (
            <section className="me-panel mint-panel" aria-label="Mint a reptile, locked">
                <h2 className="me-panel-title is-sm">Mint a reptile</h2>
                <div className="me-panel-body">
                    <div className="mint-row">
                        <div className="me-stagebox">
                            <div className="me-sprite is-locked" style={cssVars({ '--s': '96px' })} role="img" aria-label="A reptile, still locked">
                                {pfpLayers(DEFAULT_LOOK).map((url) => (
                                    <img key={url} src={url} alt="" draggable={false} />
                                ))}
                            </div>
                        </div>
                        <div className="me-col">
                            <p><span className="me-tag is-locked">Locked</span></p>
                            <p className="me-display-sm">Reach depth {MINT_GOAL_DEPTH} in a verified run</p>
                            <div className="mint-meter-row">
                                <div
                                    className="me-meter is-gold"
                                    style={cssVars({ '--v': `${Math.min(100, Math.round((best / MINT_GOAL_DEPTH) * 100))}%` })}
                                    role="progressbar"
                                    aria-label="Best verified depth toward the goal"
                                    aria-valuenow={best}
                                    aria-valuemin={0}
                                    aria-valuemax={MINT_GOAL_DEPTH}
                                >
                                    <i />
                                </div>
                                <span className="me-display-sm me-gold">{best}/{MINT_GOAL_DEPTH}</span>
                            </div>
                            <p className="me-hint">{terms}</p>
                        </div>
                    </div>
                    <button type="button" className="me-btn me-btn-block" disabled>Mint locked</button>
                    <button type="button" className="me-btn me-btn-block" onClick={onClose}>Close</button>
                </div>
            </section>
        );
    }

    if (phase === 'minted') {
        return (
            <section className="me-panel mint-panel" aria-label="Minted">
                <h2 className="me-panel-title is-sm">Mint a reptile</h2>
                <div className="me-panel-body">
                    <ol className="me-steps">
                        <li className="is-done">Approve</li>
                        <li className="is-done">Mint</li>
                    </ol>
                    <div className="me-wallet-id">
                        <div className="me-sprite" style={cssVars({ '--s': '48px' })} role="img" aria-label="Your new Entangled Reptile">
                            {pfpLayers(look).map((url) => (
                                <img key={url} src={url} alt="" draggable={false} />
                            ))}
                        </div>
                        <p className="me-status is-ok" role="status">Minted. This reptile is yours.</p>
                    </div>
                    <button type="button" className="me-btn me-btn-primary me-btn-block" onClick={onClose}>Play</button>
                </div>
            </section>
        );
    }

    if (phase === 'approve' || phase === 'minting') {
        const approving = phase === 'approve';
        return (
            <section className="me-panel mint-panel" aria-label="Minting">
                <h2 className="me-panel-title is-sm">Mint a reptile</h2>
                <div className="me-panel-body">
                    <ol className="me-steps">
                        <li className={stepClass(true, approving)}>Approve</li>
                        <li className={stepClass(false, !approving)}>Mint</li>
                    </ol>
                    <p className="me-status is-busy" role="status">
                        {approving ? 'Approve in your wallet' : 'Minting your reptile'}
                    </p>
                    <button type="button" className="me-btn me-btn-block" disabled>
                        {approving ? 'Waiting for wallet' : 'Minting'}
                    </button>
                </div>
            </section>
        );
    }

    if (phase === 'failed') {
        return (
            <section className="me-panel mint-panel" aria-label="Mint failed">
                <h2 className="me-panel-title is-sm">Mint a reptile</h2>
                <div className="me-panel-body">
                    <ol className="me-steps">
                        <li className="is-done">Approve</li>
                        <li className="is-bad">Mint</li>
                    </ol>
                    <p className="me-status is-bad" role="alert">Mint failed. Nothing was charged.</p>
                    <p className="me-hint">{reason}</p>
                    <div className="me-row">
                        <button type="button" className="me-btn me-btn-sm" onClick={onClose}>Close</button>
                        <button type="button" className="me-btn me-btn-gold me-btn-sm" onClick={() => setPhase('form')}>
                            Try again
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    // The picker (ready): the live preview and the starter chips.
    return (
        <section className="me-panel mint-panel" aria-label="Mint a reptile">
            <h2 className="me-panel-title is-sm">Mint a reptile</h2>
            <div className="me-panel-body">
                <div className="mint-pick">
                    <div className="me-col mint-stage-col">
                        <div className="me-stagebox">
                            <div className="me-sprite" style={cssVars({ '--s': `${PFP_PX}px` })} role="img" aria-label="The picture that gets minted">
                                {pfpLayers(look).map((url) => (
                                    <img key={url} src={url} alt="" draggable={false} />
                                ))}
                            </div>
                        </div>
                        <span className="me-label mint-stage-label">This gets minted</span>
                        <div className="mint-runner-row">
                            <div className="me-sprite" style={cssVars({ '--s': `${RUNNER_PX}px` })} role="img" aria-label="Your runner in the maze">
                                {spriteLayers(look, frameAt(tick)).map((url) => (
                                    <img key={url} src={url} alt="" draggable={false} />
                                ))}
                            </div>
                            <span className="me-hint">In the maze</span>
                        </div>
                    </div>
                    <div className="me-col">
                        {LAYER_ORDER.filter((layer) => freeTraitsOf(layer).length > 0).map((layer) => (
                            <div key={layer}>
                                <span className="me-label">{layer}</span>
                                <div className="me-row" role="radiogroup" aria-label={layer}>
                                    {freeTraitsOf(layer).map((trait) => (
                                        <button
                                            key={trait}
                                            type="button"
                                            role="radio"
                                            aria-checked={look[layer] === trait}
                                            className={look[layer] === trait ? 'me-chip is-on' : 'me-chip'}
                                            onClick={() => setLook((current) => ({ ...current, [layer]: trait }))}
                                        >
                                            {trait}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <p className="me-hint">Everything else is found in the maze or won through feats.</p>
                <p className="me-hint">{terms}</p>
                {quoteFailed && <p className="me-hint">Could not reach the network. Mint will ask again.</p>}
                <button
                    type="button"
                    className="me-btn me-btn-gold me-btn-block"
                    onClick={() => void mint()}
                    disabled={quote === null || quoteFailed}
                >
                    Mint this reptile
                </button>
                <button type="button" className="me-btn me-btn-block" onClick={onClose}>Close</button>
            </div>
        </section>
    );
};

export default MintPanel;
