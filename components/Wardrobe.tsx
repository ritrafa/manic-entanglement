"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { LAYER_ORDER, TRAITS, frameAt, pfpLayers, spriteLayers, type Layer, type Look } from '@/game/sprite';
import { availableTraits, isUnlocked, pickupRarity, unlockedBy } from '@/game/wardrobe';
import { featById } from '@/game/feats';
import { cardsOnPage, clampPage, pageForIndex, pageCount } from '@/game/pages';
import { classifyTouch } from '@/game/swipe';

// The save-to-NFT panel (E72, design/components/SaveToNft), pulled in only
// when the button opens it: it carries the wallet code, which must stay out
// of the first-load bundle (the same rule as components/WalletGate.tsx).
const SavePanelLazy = dynamic({
    loader: () => import('./SavePanel').then((module) => ({ default: module.SavePanelWithProvider })),
    ssr: false,
});

interface WardrobeProps {
    gameState: GameState;
}

/** The stage shows both renditions of the current look at this size
 *  (design/components/Wardrobe: 16 px PFP art at 9x; the runner matches it). */
const STAGE_PX = 144;
/** The card art: the trait's PFP layer at 6x the 16 px masters. The
 *  stylesheet shrinks the box to 80 px (5x) on both layouts (E67) so a page
 *  holds six cards on a phone and twelve on the desktop. */
const CARD_PX = 96;
/** The preview repaints on this beat; frameAt picks the frame from the clock. */
const PREVIEW_TICK_MS = 150;

/** The card list of a panel that is not open. */
const NO_CARDS: readonly WardrobeCard[] = [];

/** How many non-None traits exist across all layers (104 with the shipped art). */
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

/** One card of the open layer's list: its trait and what it shows. */
interface WardrobeCard {
    trait: string;
    state: CardState;
}

function cardState(
    layer: Layer,
    trait: string,
    look: Look,
    feats: readonly string[],
    pickedUp: readonly { layer: string; trait: string }[],
): CardState {
    if (look[layer] === trait) return 'equipped';
    return isUnlocked(layer, trait, feats, pickedUp) ? 'available' : 'locked';
}

/** Equipped first, then available, then locked — TRAITS order within each
 *  group (design/components/Wardrobe: "equipped first, then unlocked, then
 *  locked"). The list is sorted once when the panel opens or the tab
 *  changes, never after an equip, so cards never move between pages while
 *  the panel is open (E64). */
function sortCards(
    layer: Layer,
    look: Look,
    feats: readonly string[],
    pickedUp: readonly { layer: string; trait: string }[],
): WardrobeCard[] {
    const rank: Record<CardState, number> = { equipped: 0, available: 1, locked: 2 };
    return TRAITS[layer]
        .map((trait) => ({ trait, state: cardState(layer, trait, look, feats, pickedUp) }))
        .sort((a, b) => rank[a.state] - rank[b.state]);
}

/** The three rarity pips (design/README, Colour): feat-unlocked traits are
 *  "Feat only" (3), maze pickups read "Found" (1) or "Rare" (2) by their
 *  slot in game/wardrobe.ts PICKUP_TRAITS. */
function RarityPips({ layer, trait }: { layer: Layer; trait: string }): React.ReactElement | null {
    if (trait === 'None') return null;
    const rarity = pickupRarity(layer, trait);
    const featOnly = unlockedBy(layer, trait) !== null;
    const cls = rarity === 'rare' ? 'me-pips is-rare' : rarity === 'found' ? 'me-pips is-found' : featOnly ? 'me-pips is-feat' : 'me-pips is-found';
    const label = rarity === 'rare' ? 'Rare' : rarity === 'found' ? 'Found' : featOnly ? 'Feat only' : 'Found';
    return (
        <span className={cls} aria-label={label}>
            <i /><i /><i />
        </span>
    );
}

/**
 * The wardrobe is the design's grid of TraitCards (design/components/Wardrobe
 * and TraitCard): one tab per layer, a multi-column grid of cards for the
 * open layer —
 * its PFP layer over a ghost of the body, its name, its state (On, New,
 * Locked with the feat that unlocks it) and its rarity pips. Choosing an
 * available card equips it; locked cards never change the stage. Above the
 * grid the current look shows in both renditions side by side: the PFP as
 * "Your NFT" and the animated runner as "In the maze".
 *
 * A trait a feat unlocked since the wardrobe was last closed carries the New
 * tag; free traits never do. The markers live in the save's `seen` record
 * (game/save.ts) through the snapshot's newTraits (GameState.openWardrobe)
 * and markTraitsSeen, and an old save that never carried markers loads with
 * everything already seen. Every card is reachable by Tab, locked ones
 * included, and Esc or the Back button closes the panel. The rules of
 * game/wardrobe.ts decide what may be worn; nothing here changes them.
 *
 * The panel never runs past the screen (E64): it stays between the safe-area
 * insets inside the scrim's gutters and nothing in it scrolls. Instead the
 * cards turn in pages: the grid measures its own box with a ResizeObserver
 * (a hidden copy of the whole list gives the card size) and shows as many
 * whole cards as fit — columns x rows, at least one — and the rest wait on
 * further pages under Prev / "Page 2 of 4" / Next buttons (game/pages.ts
 * holds the arithmetic). PageUp / PageDown and [ / ] turn pages, a horizontal
 * swipe on the grid turns them too, switching tabs opens the page that holds
 * the equipped trait, and equipping a card keeps the current page.
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
    const pickedUp = model.pickedUp;
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

    // The paging (E64): the grid shows cols x rows whole cards measured from
    // its own box, and the rest of the layer waits on further pages.
    const gridRef = useRef<HTMLDivElement>(null);
    // A hidden copy of the whole list, laid out like the grid, that gives the
    // card size the measurement divides the grid's box by.
    const measureRef = useRef<HTMLDivElement>(null);
    const [gridShape, setGridShape] = useState({ cols: 1, rows: 1 });
    const [page, setPage] = useState(0);
    // The layer's cards, sorted once when the panel opens or the tab changes
    // so an equip cannot move cards between pages (E64). The key is the
    // opening and the tab the sort was taken for.
    const [sorted, setSorted] = useState<{ key: string; cards: WardrobeCard[] } | null>(null);
    // Set when the panel opens or a tab is picked (the effect below): the
    // next measurement opens the page that holds the equipped trait.
    const jumpRef = useRef(false);
    // One touch on the grid, for the swipe that turns pages.
    const touchRef = useRef<{ x: number; y: number; ms: number } | null>(null);
    // The save-to-NFT panel (E72), opened from the wardrobe when the wallet's
    // reptile is loaded.
    const [saveOpen, setSaveOpen] = useState(false);

    // The card list is frozen per opening and per tab: the key carries both,
    // and an equip (which changes neither) never re-sorts it. Closing drops
    // the list, so the next opening sorts afresh. Adjusting the state during
    // this render (React's own pattern) so the first painted frame already
    // shows the equipped trait's page, not the page the last tab left.
    const viewKey = `${open}:${layer}`;
    if (!open && sorted !== null) {
        setSorted(null);
    }
    if (open && sorted?.key !== viewKey) {
        const fresh = sortCards(layer, look, feats, pickedUp);
        const size = Math.max(1, gridShape.cols * gridShape.rows);
        const equipped = fresh.findIndex((card) => card.state === 'equipped');
        setSorted({ key: viewKey, cards: fresh });
        setPage(pageForIndex(Math.max(0, equipped), size));
    }

    const cards = sorted !== null && sorted.key === viewKey ? sorted.cards : NO_CARDS;

    // The grid's box over the card's box: as many whole cards as fit,
    // at least one. The hidden copy of the whole list measures the card, so
    // locked cards (taller by their hint) on a later page count too.
    const measure = useCallback((): void => {
        const grid = gridRef.current;
        const measured = measureRef.current;
        if (grid === null || measured === null) return;
        const style = window.getComputedStyle(grid);
        const gapX = Number.parseFloat(style.columnGap) || 0;
        const gapY = Number.parseFloat(style.rowGap) || 0;
        let cardW = 0;
        let cardH = 0;
        for (const child of Array.from(measured.children)) {
            const el = child as HTMLElement;
            cardW = Math.max(cardW, el.offsetWidth);
            cardH = Math.max(cardH, el.offsetHeight);
        }
        const w = grid.clientWidth;
        const h = grid.clientHeight;
        let cols = 1;
        let rows = 1;
        if (cardW > 0 && cardH > 0 && w > 0 && h > 0) {
            cols = Math.max(1, Math.floor((w + gapX) / (cardW + gapX)));
            rows = Math.max(1, Math.floor((h + gapY) / (cardH + gapY)));
        }
        setGridShape((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
        const size = Math.max(1, cols * rows);
        const total = cards.length;
        if (jumpRef.current) {
            jumpRef.current = false;
            const equipped = cards.findIndex((card) => card.state === 'equipped');
            setPage(pageForIndex(Math.max(0, equipped), size));
        } else {
            // The size changed under the player: stay on a page that exists.
            setPage((p) => clampPage(p, total, size));
        }
    }, [cards]);

    // Measure when the panel opens, when the tab (and with it the cards)
    // changes, and whenever the grid's box changes (ResizeObserver).
    useEffect(() => {
        if (!open) return;
        // A fresh opening or tab opens on the equipped trait's page; the
        // measurement below is what knows how many cards a page holds.
        jumpRef.current = true;
        measure();
        const grid = gridRef.current;
        if (grid === null || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => measure());
        observer.observe(grid);
        return () => observer.disconnect();
    }, [open, layer, measure]);

    if (!open) return null;

    const urls = spriteLayers(look, frameAt(now));
    const unlockedCount = LAYER_ORDER.reduce(
        (total, cardLayer) => total + availableTraits(cardLayer, feats, pickedUp).filter((trait) => trait !== 'None').length,
        0,
    );
    const unlockedPct = TOTAL_TRAITS === 0 ? 0 : Math.round((unlockedCount / TOTAL_TRAITS) * 100);

    // Closing marks every wearable card seen, so its New tag shows until the
    // wardrobe is next opened (design/components/TraitCard).
    const closeWardrobe = (): void => {
        const keys: string[] = [];
        for (const cardLayer of LAYER_ORDER) {
            for (const trait of availableTraits(cardLayer, feats, pickedUp)) {
                if (trait !== 'None') keys.push(traitSeenKey(cardLayer, trait));
            }
        }
        gameState.markTraitsSeen(keys);
        gameState.closeWardrobe();
    };

    const pageSize = Math.max(1, gridShape.cols * gridShape.rows);
    const pages = pageCount(cards.length, pageSize);
    const safePage = clampPage(page, cards.length, pageSize);
    const visible = cardsOnPage(cards, safePage, pageSize);

    const turnPage = (delta: number): void => {
        setPage((p) => clampPage(clampPage(p, cards.length, pageSize) + delta, cards.length, pageSize));
    };

    // Esc closes the wardrobe from anywhere inside it, the way the feats
    // panel does; PageUp / PageDown and [ / ] turn the cards' pages (E64).
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeWardrobe();
            return;
        }
        if (event.key === 'PageUp' || event.key === '[') {
            event.preventDefault();
            event.stopPropagation();
            turnPage(-1);
            return;
        }
        if (event.key === 'PageDown' || event.key === ']') {
            event.preventDefault();
            event.stopPropagation();
            turnPage(1);
        }
    };

    // A horizontal swipe on the grid turns the pages (E64); game/swipe.ts
    // classifies the touch, so a tap stays a tap.
    const handleGridTouchStart = (event: React.TouchEvent<HTMLDivElement>): void => {
        const touch = event.touches[0];
        touchRef.current = touch !== undefined ? { x: touch.clientX, y: touch.clientY, ms: Date.now() } : null;
    };
    const handleGridTouchEnd = (event: React.TouchEvent<HTMLDivElement>): void => {
        const start = touchRef.current;
        touchRef.current = null;
        const touch = event.changedTouches[0];
        if (start === null || touch === undefined) return;
        const result = classifyTouch(touch.clientX - start.x, touch.clientY - start.y, Date.now() - start.ms);
        if (result.kind === 'swipe' && result.dx !== 0) turnPage(result.dx < 0 ? 1 : -1);
    };

    const bodyGhost = layer !== 'Body' ? pfpUrl('Body', look.Body) : null;
    const newCount = [...newKeys].length;

    // One card of the grid, shared by the visible page and the hidden
    // measurement copy so both lay out identically.
    const renderCard = ({ trait, state }: WardrobeCard): React.ReactElement => {
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
                        {feat !== null
                            ? `Feat: ${feat.name}`
                            : pickupRarity(layer, trait) !== null
                                ? 'Found in the maze'
                                : 'Find it in the maze'}
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
    };

    return (
        <div className="me-scrim wardrobe-scrim" onKeyDown={handleKeyDown}>
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
                            {/* The trait count and its bar share one line
                                (E67), so the compact phone preview costs the
                                card grid one line, not two. */}
                            <div className="wardrobe-count-row">
                                <p className="me-display-sm" style={{ textAlign: 'center' }}>{unlockedCount} of {TOTAL_TRAITS} traits</p>
                                <div className="me-meter is-gold" role="presentation">
                                    <i style={cssVars({ '--v': `${unlockedPct}%` })} />
                                </div>
                            </div>
                        </div>
                        <div className="me-col wardrobe-grid-col">
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
                            <div className="wardrobe-grid-wrap">
                                <div
                                    ref={gridRef}
                                    className="me-grid wardrobe-grid"
                                    role="tabpanel"
                                    aria-label={`${layer} traits, page ${safePage + 1} of ${pages}`}
                                    onTouchStart={handleGridTouchStart}
                                    onTouchEnd={handleGridTouchEnd}
                                    onTouchCancel={() => {
                                        touchRef.current = null;
                                    }}
                                >
                                    {visible.map(renderCard)}
                                </div>
                                {/* The hidden whole list: same classes, same
                                    width, so its cards give the size the grid's
                                    box is divided by (E64). */}
                                <div ref={measureRef} className="me-grid wardrobe-grid wardrobe-grid-measure" aria-hidden="true">
                                    {cards.map(renderCard)}
                                </div>
                            </div>
                            {/* The page controls (E64): 48 px buttons at the
                                ends, the page of the whole in between. */}
                            <div className="wardrobe-pager">
                                <button
                                    type="button"
                                    className="me-btn wardrobe-prev"
                                    onClick={() => turnPage(-1)}
                                    disabled={safePage === 0}
                                >
                                    Prev
                                </button>
                                <span className="me-label wardrobe-page-label" role="status" aria-live="polite">
                                    Page {safePage + 1} of {pages}
                                </span>
                                <button
                                    type="button"
                                    className="me-btn wardrobe-next"
                                    onClick={() => turnPage(1)}
                                    disabled={safePage >= pages - 1}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                        {/* E62 (the E61 review): the hint and the Back button
                            are part of the layout now. On the desktop the
                            grid column spans the panel's whole height beside
                            them and they sit under the preview, in the left
                            column that used to stay empty below it; on a
                            phone the one-column layout drops them after the
                            grid, where they were. */}
                        <p className="me-hint wardrobe-hint" style={{ textAlign: 'center' }}>
                            {newCount > 0
                                ? `${newCount} new ${newCount === 1 ? 'trait' : 'traits'} since you last looked. Earn feats to unlock more.`
                                : 'Earn feats to unlock more looks.'}
                        </p>
                        <div className="me-panel-actions wardrobe-actions">
                            <button className="me-btn me-btn-primary" ref={firstButtonRef} onClick={closeWardrobe}>Back</button>
                            {model.hasReptile && (
                                <button
                                    type="button"
                                    className="me-btn me-btn-gold"
                                    onClick={() => setSaveOpen(true)}
                                    disabled={!(model.lookPickedSinceLoad || model.pendingProofs > 0)}
                                    title={model.lookPickedSinceLoad || model.pendingProofs > 0
                                        ? 'Write the loadout and the verified stats to the reptile'
                                        : 'Nothing new to save'}
                                >
                                    Save to NFT
                                </button>
                            )}
                        </div>
                        {saveOpen && (
                            <div className="wardrobe-save-wrap">
                                <SavePanelLazy gameState={gameState} onClose={() => setSaveOpen(false)} />
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default WardrobePanel;
