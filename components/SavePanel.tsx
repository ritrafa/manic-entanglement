'use client';

// Save to NFT (E72, design/components/SaveToNft): one action that writes the
// loadout and the verified stats together, always through a review first.
// The review shows the two 96px PFP stages - "On chain now" and "After
// saving" - and the me-changes rows the server's quote summary lists. No
// fee amounts anywhere in this flow (the spec's rule): the hint only says
// the wallet pays the network fee. The look rides only what the wardrobe
// actually picked since the reptile loaded - an old holder's Crown, Purple
// or Clothes White can never be stripped by the local fitLook - and after a
// confirmed save the proofs that were sent leave the save and the box
// reloads the reptile.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

import GameState from '@/lib/GameState';
import { NftError, requestSave, signAndSend, type LookChoice, type Prepared, type SaveSummary } from '@/lib/nft/client';
import { peekProof } from '@/lib/nft/proofPeek';
import { LAYER_ORDER, pfpLayers, type Look } from '@/game/sprite';
import type { NftLook } from '@/game/nftProgress';
import type { Layer } from '@/game/sprite';
import WalletContextProvider from './WalletContextProvider';

interface SavePanelProps {
    gameState: GameState;
    onClose: () => void;
    /** Called after a confirmed save so the opener reloads the reptile. */
    onSaved?: () => void;
}

/** A quote older than this is refreshed before the save (the server's own
 *  quote lasts about a minute). */
const QUOTE_MAX_AGE_MS = 45_000;

/** The two review stages, from the design preview. */
const STAGE_PX = 96;

/** A CSS custom property in a style object (--s sizes the sprite). */
function cssVars(vars: Record<string, string>): React.CSSProperties {
    return vars as React.CSSProperties;
}

/** The plain reason under a failed status, from the error's code. */
function saveReason(error: unknown): string {
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
        default:
            return 'Something went wrong. Nothing changed.';
    }
}

/** The look a save writes: the on-chain layers with only the traits the
 *  wardrobe picked since the load written over them, and the reptile's own
 *  background. Null when nothing was picked - the reptile then keeps its
 *  look exactly as it is, which is the rule for old holders whose traits
 *  the local unlock tables do not know. */
function saveChoice(onChain: NftLook, picks: Partial<Record<Layer, string>>): LookChoice | null {
    if (Object.keys(picks).length === 0) return null;
    const look: Look = { ...onChain };
    for (const layer of LAYER_ORDER) {
        const picked = picks[layer];
        if (picked !== undefined) look[layer] = picked;
    }
    return { ...look, Background: onChain.Background };
}

/** The look the "After saving" stage shows: the same merge, as a plain Look. */
function afterLook(onChain: NftLook, picks: Partial<Record<Layer, string>>): Look {
    const look: Look = { ...onChain };
    for (const layer of LAYER_ORDER) {
        const picked = picks[layer];
        if (picked !== undefined) look[layer] = picked;
    }
    return look;
}

/** The stage's aria text: the layers a look wears, read out. */
function lookText(look: Look): string {
    return LAYER_ORDER.map((layer) => `${look[layer]} ${layer}`).join(', ');
}

type Phase = 'connect' | 'verify' | 'ready' | 'nothing' | 'approve' | 'saving' | 'saved' | 'failed';

function stepClass(done: boolean, now: boolean, bad = false): string {
    return bad ? 'is-bad' : now ? 'is-now' : done ? 'is-done' : '';
}

/** The save flow, review first, one state at a time. Rendered by the wallet
 *  box (inside its provider) and by the wardrobe (through
 *  SavePanelWithProvider, which brings its own provider and stays out of
 *  the first-load bundle behind next/dynamic). */
export const SavePanel: React.FC<SavePanelProps> = ({ gameState, onClose, onSaved }) => {
    const { publicKey, signTransaction } = useWallet();
    const { connection } = useConnection();
    const wallet = publicKey === null ? null : publicKey.toBase58();

    // The review is about the moment the panel opens: the loaded reptile and
    // the wardrobe's picks are read once, so a reload behind the panel can
    // never move the target mid-flow.
    const [review] = useState(() => {
        const reptile = gameState.getReptile();
        const picks = gameState.getLookPicks();
        const onChain = reptile?.look ?? null;
        return {
            asset: reptile?.asset ?? null,
            onChain,
            sentLook: onChain === null ? null : saveChoice(onChain, picks),
            after: onChain === null ? null : afterLook(onChain, picks),
        };
    });

    const [phase, setPhase] = useState<Phase>('verify');
    const [quote, setQuote] = useState<Prepared | null>(null);
    const [quoteAt, setQuoteAt] = useState(0);
    const [reason, setReason] = useState('');
    const requestedRef = useRef(false);
    // The proofs the quote was asked about and the save will send: read once,
    // dropped from the save only after a confirmation.
    const proofsRef = useRef<string[]>([]);

    // The review's quote: asking changes nothing on chain. A refusal of
    // "nothing to save" is the honest ready state, not a failure. The wallet
    // may arrive a moment after the panel opens (autoConnect) - the quote
    // goes out as soon as it is here.
    useEffect(() => {
        if (wallet === null) return;
        if (requestedRef.current) return;
        requestedRef.current = true;
        const proofs = gameState.getPendingProofs().filter((proof) => peekProof(proof)?.wallet === wallet);
        proofsRef.current = proofs;
        const asset = review.asset;
        const sentLook = review.sentLook;
        let cancelled = false;
        void (async () => {
            if (asset === null || review.onChain === null) {
                // The box loaded a reptile the RPC gave no id or attributes
                // for: there is nothing to write to, and saying so beats
                // spinning on a quote that can never be asked.
                if (!cancelled) { setReason('Something went wrong. Nothing changed.'); setPhase('failed'); }
                return;
            }
            try {
                const prepared = await requestSave({ wallet, asset, proofs, look: sentLook });
                if (!cancelled) { setQuote(prepared); setQuoteAt(Date.now()); setPhase('ready'); }
            } catch (error) {
                if (cancelled) return;
                if (error instanceof NftError && error.code === 'nothing_to_save') setPhase('nothing');
                else { setReason(saveReason(error)); setPhase('failed'); }
            }
        })();
        return () => { cancelled = true; };
    }, [wallet, review, gameState]);

    const save = async (): Promise<void> => {
        if (publicKey === null || typeof signTransaction !== 'function' || review.asset === null) return;
        setReason('');
        setPhase('approve');
        try {
            let current = quote;
            if (current === null || Date.now() - quoteAt > QUOTE_MAX_AGE_MS) {
                current = await requestSave({
                    wallet: publicKey.toBase58(),
                    asset: review.asset,
                    proofs: proofsRef.current,
                    look: review.sentLook,
                });
                setQuote(current);
                setQuoteAt(Date.now());
            }
            setPhase('saving');
            await signAndSend(current, { publicKey, signTransaction }, connection);
            setPhase('saved');
            // The proofs that landed are spent; the box reloads the reptile.
            gameState.removePendingProofs(proofsRef.current);
            onSaved?.();
        } catch (error) {
            setReason(saveReason(error));
            setPhase('failed');
        }
    };

    const view: Phase = wallet === null ? 'connect' : phase;

    const close = useCallback(() => { onClose(); }, [onClose]);

    const summary = quote?.summary as SaveSummary | undefined;
    const changes = summary !== undefined && summary.kind === 'save' ? summary.changes : [];

    // One panel, one step list, whichever phase we are in.
    const verifyDone = phase !== 'verify' && phase !== 'connect';
    const verifyBad = view === 'failed' && reason === 'The run could not be verified.';
    const approveDone = view === 'saving' || view === 'saved';
    const approveBad = view === 'failed' && reason === 'You declined in your wallet.';
    const saveDone = view === 'saved';
    const saveBad = view === 'failed' && !approveBad && !verifyBad;

    return (
        <section className="me-panel save-panel" role="dialog" aria-label="Save progress to my NFT">
            <h2 className="me-panel-title is-sm">Save progress to my NFT</h2>
            <div className="me-panel-body">
                {view === 'connect' && (
                    <>
                        <p className="me-status" role="status">Connect your wallet to save</p>
                        <div className="me-wallet-connect"><WalletMultiButton /></div>
                        <div className="me-panel-actions">
                            <button type="button" className="me-btn" onClick={close}>Not now</button>
                        </div>
                    </>
                )}
                {(view === 'verify' || view === 'approve' || view === 'saving') && (
                    <>
                        <ol className="me-steps">
                            <li className={stepClass(approveDone, view === 'approve', approveBad)}>Approve</li>
                            <li className={stepClass(verifyDone, view === 'verify', verifyBad)}>Verify</li>
                            <li className={stepClass(saveDone, view === 'saving', saveBad)}>Save</li>
                        </ol>
                        <p className="me-status is-busy" role="status">
                            {view === 'verify' ? 'Verifying your run'
                                : view === 'approve' ? 'Approve in your wallet'
                                    : 'Saving to your NFT'}
                        </p>
                        <button type="button" className="me-btn me-btn-block" disabled>
                            {view === 'verify' ? 'Verifying' : view === 'approve' ? 'Waiting for wallet' : 'Saving'}
                        </button>
                    </>
                )}
                {(view === 'ready' || view === 'nothing') && (
                    <>
                        <div className="save-looks">
                            <div className="me-col save-stage-col">
                                <div className="me-stagebox">
                                    <div
                                        className="me-sprite"
                                        style={cssVars({ '--s': `${STAGE_PX}px` })}
                                        role="img"
                                        aria-label={review.onChain === null ? 'On chain now: unknown' : `On chain now: ${lookText(review.onChain)}`}
                                    >
                                        {review.onChain !== null && pfpLayers(review.onChain).map((url) => (
                                            <img key={url} src={url} alt="" draggable={false} />
                                        ))}
                                    </div>
                                </div>
                                <span className="me-label">On chain now</span>
                            </div>
                            <i className="me-arrow me-gold" aria-hidden="true" />
                            <div className="me-col save-stage-col">
                                <div className="me-stagebox is-gold-edge">
                                    {review.after !== null && (
                                        <div
                                            className="me-sprite"
                                            style={cssVars({ '--s': `${STAGE_PX}px` })}
                                            role="img"
                                            aria-label={`After saving: ${lookText(review.after)}`}
                                        >
                                            {pfpLayers(review.after).map((url) => (
                                                <img key={url} src={url} alt="" draggable={false} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <span className="me-label me-gold">After saving</span>
                            </div>
                        </div>
                        {changes.length > 0 && (
                            <dl className="me-changes">
                                {changes.map((change) => (
                                    <React.Fragment key={change.key}>
                                        <dt>{change.key}</dt>
                                        <dd className="is-old">{change.from ?? '—'}</dd>
                                        <i className="me-arrow me-gold" aria-hidden="true" />
                                        <dd className="is-new">{change.to}</dd>
                                    </React.Fragment>
                                ))}
                                {changes.length <= 3 && (
                                    <>
                                        <dt>Everything else</dt>
                                        <dd className="is-same">No change</dd>
                                        <span aria-hidden="true" />
                                        <dd className="is-same">Stays as it is</dd>
                                    </>
                                )}
                            </dl>
                        )}
                        <p className="me-hint">
                            {view === 'nothing'
                                ? 'Nothing new to save.'
                                : 'Writes your loadout and stats together. Your wallet pays the network fee.'}
                        </p>
                        <div className="me-panel-actions">
                            <button type="button" className="me-btn" onClick={close}>Not now</button>
                            <button
                                type="button"
                                className="me-btn me-btn-gold"
                                onClick={() => void save()}
                                disabled={view === 'nothing' || quote === null}
                            >
                                Save to my NFT
                            </button>
                        </div>
                    </>
                )}
                {view === 'saved' && (
                    <>
                        <ol className="me-steps">
                            <li className="is-done">Approve</li>
                            <li className="is-done">Verify</li>
                            <li className="is-done">Save</li>
                        </ol>
                        <p className="me-status is-ok" role="status">Saved. Your reptile carries this progress.</p>
                        <div className="me-panel-actions">
                            <button type="button" className="me-btn me-btn-primary" onClick={close}>Done</button>
                        </div>
                    </>
                )}
                {view === 'failed' && (
                    <>
                        <ol className="me-steps">
                            <li className={stepClass(approveDone, false, approveBad)}>Approve</li>
                            <li className={stepClass(verifyDone, false, verifyBad)}>Verify</li>
                            <li className={stepClass(false, false, saveBad)}>Save</li>
                        </ol>
                        <p className="me-status is-bad" role="alert">Save failed. Nothing changed.</p>
                        <p className="me-hint">{reason}</p>
                        <div className="me-row">
                            <button type="button" className="me-btn me-btn-sm" onClick={close}>Close</button>
                            <button
                                type="button"
                                className="me-btn me-btn-gold me-btn-sm"
                                onClick={() => { setReason(''); setPhase('ready'); }}
                            >
                                Try again
                            </button>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

/** The panel with its own wallet provider, for the wardrobe - the entry that
 *  lives outside the wallet box. The wardrobe pulls this in with
 *  next/dynamic, so the wallet code stays out of the first-load bundle. */
export const SavePanelWithProvider: React.FC<SavePanelProps> = (props) => (
    <WalletContextProvider>
        <SavePanel {...props} />
    </WalletContextProvider>
);

export default SavePanel;
