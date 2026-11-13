"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { LAYER_ORDER, TRAITS, frameAt, pfpLayers, spriteLayers, type Layer, type Look } from '@/game/sprite';
import { availableTraits, isUnlocked, unlockedBy } from '@/game/wardrobe';
import { featById } from '@/game/feats';

interface WardrobeProps {
    gameState: GameState;
}

/** The stage shows both renditions of the current look at this size
 *  (design/components/Wardrobe: 16 px PFP art at 9x; the runner matches it). */
const STAGE_PX = 144;
/** The card art: the trait's PFP layer at 6x the 16 px masters. */
const CARD_PX = 96;
/** The preview repaints on this beat; frameAt picks the frame from the clock. */
const PREVIEW_TICK_MS = 150;

/** How many non-None traits exist across all layers (22 with the shipped art). */
const TOTAL_TRAITS = LAYER_ORDER.reduce(
    (total, layer) => total + TRAITS[layer].filter((trait) => trait !== 'None').length,
    0,
);

/** The save key (game/save.ts `seen`) that marks one trait card as seen. */
function traitSeenKey(layer: Layer, trait: string): string {
    return `trait:${layer}:${trait}`;
}

/** A CSS custom property in a style object (--s sizes the sprite, --v the meter). */
function cssVars(vars: Record<string, string>): React.CSSProperties {
    return vars as React.CSSProperties;
}

/** The PFP url of one trait, or null for a bare (None) trait. */
function pfpUrl(layer: Layer, trait: string): string | null {
    if (trait === 'None') return null;
    return `/images/nft/${layer}/${trait}pfp.png`;
}

/** What a card shows for its trait: the equipped one, an available one, and
 *  the locked ones with the feat that unlocks them. */
type CardState = 'equipped' | 'available' | 'locked';

function cardState(layer: Layer, trait: string, look: Look, feats: readonly string[]): CardState {
    if (look[layer] === trait) return 'equipped';
    return isUnlocked(layer, trait, feats) ? 'available' : 'locked';
}

/** The three rarity pips (design/README, Colour): feat-unlocked traits are
 *  "Feat only", everything else that can be worn reads as "Found". */
function RarityPips({ layer, trait }: { layer: Layer; trait: string }): React.ReactElement | null {
    if (trait === 'None') return null;
    const featOnly = unlockedBy(layer, trait) !== null;
    const cls = featOnly ? 'me-pips is-feat' : 'me-pips is-found';
    const label = featOnly ? 'Feat only' : 'Found';
    return (
        <span className={cls} aria-label={label}>
            <i /><i /><i />
        </span>
    );
}

/**
 * The wardrobe is the design's grid of TraitCards (design/components/Wardrobe
 * and TraitCard): one tab per layer, one card per trait of the open layer —
 * its PFP layer over a ghost of the body, its name, its state (On, New,
 * Locked with the feat that unlocks it) and its rarity pips. Choosing an
 * available card equips it; locked cards never change the stage. Above the
 * grid the current look shows in both renditions side by side: the PFP as
 * "Your NFT" and the animated runner as "In the maze".
 *
 * A trait unlocked since the wardrobe was last closed carries the New tag;
 * the markers live in the save's `seen` record (game/save.ts) through
 * the snapshot's newTraits (GameState.openWardrobe) and markTraitsSeen, and
 * old saves without them load as they are. Every card is reachable by Tab, locked ones included, and Esc or
 * the Back button closes the panel. The rules of game/wardrobe.ts decide what
 * may be worn; nothing here changes them.
 */
const WardrobePanel: React.FC<WardrobeProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const firstButtonRef = useRef<HTMLButtonElement>(null);
    const open = model.screen === 'wardrobe';
    // A plain clock tick: frameAt(ms) alone decides which frame shows, so the
    // animation stays in step with the sprite in the game.
    const [now, setNow] = useState(() => Date.now());
    const [layer, setLayer] = useState<Layer>('Body');
    const look: Look = model.look;
    const feats = model.feats;
    // The cards that were new when the panel opened, as the shell captured
    // them (GameState.openWardrobe): the New tags stay put while it is open
    // and the cards are marked seen when it closes.
    const newKeys = new Set(model.newTraits);

    // The panel is modal while it shows: focus its Back button when it appears
    // and beat the preview to a new frame every 150 ms.
    useEffect(() => {
        if (!open) return;
        firstButtonRef.current?.focus();
        const timer = setInterval(() => setNow(Date.now()), PREVIEW_TICK_MS);
        return () => clearInterval(timer);
    }, [open]);

    if (!open) return null;

    const urls = spriteLayers(look, frameAt(now));
    const unlockedCount = LAYER_ORDER.reduce(
        (total, cardLayer) => total + availableTraits(cardLayer, feats).filter((trait) => trait !== 'None').length,
        0,
    );
    const unlockedPct = TOTAL_TRAITS === 0 ? 0 : Math.round((unlockedCount / TOTAL_TRAITS) * 100);

    // Closing marks every wearable card seen, so its New tag shows until the
    // wardrobe is next opened (design/components/TraitCard).
    const closeWardrobe = (): void => {
        const keys: string[] = [];
        for (const cardLayer of LAYER_ORDER) {
            for (const trait of availableTraits(cardLayer, feats)) {
                if (trait !== 'None') keys.push(traitSeenKey(cardLayer, trait));
            }
        }
        gameState.markTraitsSeen(keys);
        gameState.closeWardrobe();
    };

    // Esc closes the wardrobe from anywhere inside it, the way the feats panel does.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closeWardrobe();
    };

    // Equipped first, then available, then locked — TRAITS order within each
    // group (design/components/Wardrobe: "equipped first, then unlocked, then locked").
    const rank: Record<CardState, number> = { equipped: 0, available: 1, locked: 2 };
    const cards = TRAITS[layer]
        .map((trait) => ({ trait, state: cardState(layer, trait, look, feats) }))
        .sort((a, b) => rank[a.state] - rank[b.state]);

    const bodyGhost = layer !== 'Body' ? pfpUrl('Body', look.Body) : null;
    const newCount = [...newKeys].length;

    return (
        <div className="me-scrim" onKeyDown={handleKeyDown}>
            <section className="me-panel wardrobe-panel" role="dialog" aria-modal="true" aria-label="Wardrobe">
                <h2 className="me-panel-title">Wardrobe</h2>
                <div className="me-panel-body">
                    <div className="wardrobe-layout">
                        <div className="me-col wardrobe-stage">
                            <div className="me-stagebox">
                                <div className="me-duo">
                                    <figure className="me-fig wardrobe-pfp">
                                        <div
                                            className="me-sprite"
                                            style={cssVars({ '--s': `${STAGE_PX}px` })}
                                            role="img"
                                            aria-label={`Your NFT picture: ${LAYER_ORDER.map((name) => `${look[name]} ${name}`).join(', ')}`}
                                        >
                                            {pfpLayers(look).map((url) => (
                                                <img key={url} src={url} alt="" width={STAGE_PX} height={STAGE_PX} draggable={false} />
                                            ))}
                                        </div>
                                        <figcaption className="me-label">Your NFT</figcaption>
                                    </figure>
                                    <figure className="me-fig wardrobe-runner">
                                        <div
                                            className="me-sprite"
                                            style={cssVars({ '--s': `${STAGE_PX}px` })}
                                            role="img"
                                            aria-label="Your runner in the maze"
                                        >
                                            {urls.map((url) => (
                                                <img key={url} src={url} alt="" width={STAGE_PX} height={STAGE_PX} draggable={false} />
                                            ))}
                                        </div>
                                        <figcaption className="me-label">In the maze</figcaption>
                                    </figure>
                                </div>
                            </div>
                            <p className="me-display-sm" style={{ textAlign: 'center' }}>{unlockedCount} of {TOTAL_TRAITS} traits</p>
                            <div className="me-meter is-gold" role="presentation">
                                <i style={cssVars({ '--v': `${unlockedPct}%` })} />
                            </div>
                        </div>
                        <div className="me-col">
                            <div className="me-tabs" role="tablist" aria-label="Trait layers">
                                {LAYER_ORDER.map((name) => (
                                    <button
                                        key={name}
                                        type="button"
                                        role="tab"
                                        aria-selected={name === layer}
                                        className={name === layer ? 'me-tab is-on' : 'me-tab'}
                                        onClick={() => setLayer(name)}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                            <div className="me-grid wardrobe-grid" role="tabpanel" aria-label={`${layer} traits`}>
                                {cards.map(({ trait, state }) => {
                                    const isNew = state === 'available' && newKeys.has(traitSeenKey(layer, trait));
                                    const traitUrl = pfpUrl(layer, trait);
                                    const cardClass = `me-trait me-notch${
                                        state === 'equipped' ? ' is-equipped' : isNew ? ' is-new' : state === 'locked' ? ' is-locked' : ''
                                    }`;
                                    const art = (
                                        <>
                                            {bodyGhost !== null && state !== 'locked' && <img className="is-ghost" src={bodyGhost} alt="" draggable={false} />}
                                            {traitUrl !== null && <img src={traitUrl} alt="" draggable={false} />}
                                            {bodyGhost !== null && state === 'locked' && <img src={bodyGhost} alt="" draggable={false} />}
                                        </>
                                    );
                                    const featId = unlockedBy(layer, trait);
                                    const feat = featId === null ? null : featById(featId);
                                    const meta = (
                                        <span className="me-trait-meta">
                                            {state === 'equipped' && <span className="me-tag is-equipped">On</span>}
                                            {isNew && <span className="me-tag is-new">New</span>}
                                            {state === 'available' && !isNew && <span className="me-label">{layer}</span>}
                                            {state === 'locked' && <span className="me-tag is-locked">Locked</span>}
                                            <RarityPips layer={layer} trait={trait} />
                                        </span>
                                    );
                                    if (state === 'locked') {
                                        // Not a button (design/components/TraitCard) but still
                                        // reachable by Tab, so the hint can be read.
                                        return (
                                            <div key={trait} className={cardClass} aria-disabled="true" tabIndex={0}>
                                                <div className="me-sprite is-locked" style={cssVars({ '--s': `${CARD_PX}px` })} aria-hidden="true">
                                                    {art}
                                                </div>
                                                <span className="me-trait-name">{trait}</span>
                                                {meta}
                                                <span className="me-hint">
                                                    {feat !== null ? `Feat: ${feat.name}` : 'Find it in the maze'}
                                                </span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <button
                                            key={trait}
                                            type="button"
                                            className={cardClass}
                                            aria-pressed={state === 'equipped'}
                                            onClick={() => gameState.setWardrobeLook({ ...look, [layer]: trait })}
                                        >
                                            <div className="me-sprite" style={cssVars({ '--s': `${CARD_PX}px` })} aria-hidden="true">
                                                {art}
                                            </div>
                                            <span className="me-trait-name">{trait}</span>
                                            {meta}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <p className="me-hint" style={{ textAlign: 'center' }}>
                        {newCount > 0
                            ? `${newCount} new ${newCount === 1 ? 'trait' : 'traits'} since you last looked. Earn feats to unlock more.`
                            : 'Earn feats to unlock more looks.'}
                    </p>
                    <div className="me-panel-actions">
                        <button className="me-btn me-btn-primary" ref={firstButtonRef} onClick={closeWardrobe}>Back</button>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default WardrobePanel;
