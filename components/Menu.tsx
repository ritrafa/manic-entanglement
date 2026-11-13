"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { menuItems, moveFocus } from '@/game/menu';
import { featProgress } from '@/game/feats';
import { cycleMode } from '@/game/modes';

interface MenuProps {
    gameState: GameState;
}

/** The arrow key a menu action stands for, or null for any other key. */
function focusActionOf(key: string): 'up' | 'down' | 'left' | 'right' | null {
    switch (key) {
        case 'ArrowUp': return 'up';
        case 'ArrowDown': return 'down';
        case 'ArrowLeft': return 'left';
        case 'ArrowRight': return 'right';
        default: return null;
    }
}

/**
 * The title menu (design/components/MenuList): the title painting keeps its
 * own band at the top, shown whole at its own aspect ratio so the lettering
 * is never cut, with a line under it, and the MenuList sits below the band
 * on void — nothing overlaps the painting and no gradient covers it. It draws while the shell is
 * on "title", "howto" or "countdown" — the buttons only on "title", the art
 * dimmed while the countdown runs over it.
 *
 * The mode row (game/modes.ts) shows the chosen mode's name between two arrow
 * buttons, its blurb and its best underneath; while the row is focused, Left
 * and Right cycle the mode through cycleMode, and the arrow buttons work by
 * click and tap too.
 *
 * Arrow keys move the focus between the row and the buttons through the pure
 * moveFocus, Enter or Space activates the focused one (the global confirm stays
 * off a focused button — see game/keys.ts — so one Enter starts exactly one
 * run), and the first button is focused when the menu appears. Mouse and touch
 * tap the buttons directly.
 *
 * The buttons sit in two columns (styles/globals.css) so the whole menu fits
 * below the painting without hidden scrolling at 1280x800. Where the board is
 * small enough that the menu still must scroll, a "More" hint shows as the
 * menu's own last row — inside the menu's bottom edge, in its flow, so it
 * never covers other text (a phone's best line included) — until the player
 * has scrolled to the last entry.
 */
const Menu: React.FC<MenuProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const items = menuItems(featProgress(model.feats));
    // One extra slot behind the buttons belongs to the mode row.
    const slots = items.length + 1;
    const modeSlot = items.length;
    const [focusIndex, setFocusIndex] = useState(0);
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const modeRowRef = useRef<HTMLDivElement | null>(null);

    const showsArt = model.screen === 'title' || model.screen === 'howto' || model.screen === 'countdown';
    const showsButtons = model.screen === 'title';

    // The "More" hint: true while the menu scrolls and the bottom entries are
    // out of view. The scroll container is the .title-menu box itself
    // (styles/globals.css hides the bar and scrolls the menu inside), but the
    // overflow is measured from the .me-menu box — the painting's band sits
    // above it, and the hint, being the menu's own last row, must never add
    // an overflow of its own by appearing. Recomputed on scroll, on resize
    // and whenever the menu (or the mode blurb's length, or the hint itself)
    // re-renders; the effect is harmless on a menu that fits, where the hint
    // simply never shows.
    const menuBoxRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [moreBelow, setMoreBelow] = useState(false);
    useEffect(() => {
        if (!showsButtons) return;
        const box = menuBoxRef.current;
        const menu = menuRef.current;
        if (!box || !menu) return;
        const update = () => {
            // The menu's own extent inside the scroll box: rows below its
            // bottom edge are out of view while it reaches past the client
            // height, and they stay out of view until the scroll nears it.
            const hidden = menu.offsetTop + menu.offsetHeight - box.clientHeight;
            setMoreBelow(hidden > 4 && box.scrollTop < hidden - 4);
        };
        update();
        box.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        // The display font arrives after the first paint: a size observer on
        // the menu re-measures when the loaded face changes the row heights.
        const observe = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
        observe?.observe(menu);
        return () => {
            box.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            observe?.disconnect();
        };
    }, [showsButtons, model.mode, model.modeBlurb, model.modeBestText, moreBelow]);

    // The menu appearing (first show or a return to the title) starts at the
    // top: the reset is a render-time state adjustment, not an effect, so the
    // menu never paints once with a stale focus and re-renders.
    const [wasShowingButtons, setWasShowingButtons] = useState(showsButtons);
    if (showsButtons !== wasShowingButtons) {
        setWasShowingButtons(showsButtons);
        if (showsButtons) setFocusIndex(0);
    }

    // The first button takes focus when the menu appears, and the focused entry
    // follows the index the arrow keys move; the last slot is the mode row.
    // preventScroll keeps the page at the top: the menu sits below the title
    // painting's own band, and focusing Play must never scroll the taller menu
    // (and with it the painting) out of view.
    useEffect(() => {
        if (!showsButtons) return;
        if (focusIndex === modeSlot) modeRowRef.current?.focus({ preventScroll: true });
        else buttonRefs.current[focusIndex]?.focus({ preventScroll: true });
    }, [focusIndex, showsButtons, modeSlot]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const action = focusActionOf(event.key);
        if (action === null) return;
        // The menu owns the arrows while it shows: no page scroll, no game step
        // (the shell only steps while a run is live).
        event.preventDefault();
        event.stopPropagation();
        // While the mode row is focused, Left and Right change the mode itself;
        // Up and Down still walk back to the buttons.
        if (focusIndex === modeSlot && (action === 'left' || action === 'right')) {
            gameState.setMode(cycleMode(model.mode, action === 'right' ? 1 : -1));
            return;
        }
        setFocusIndex((index) => moveFocus(index, slots, action));
    };

    if (!showsArt) return null;

    return (
        <div
            className={model.screen === 'countdown' ? 'title-menu dimmed' : 'title-menu'}
            ref={menuBoxRef}
        >
            <img src="/images/title.png" alt="Manic Entanglement" className="title-art" draggable={false} />
            {showsButtons && (
                <div className="me-menu" ref={menuRef} onKeyDown={handleKeyDown} role="menu" aria-label="Main menu">
                    <div
                        className="me-mode"
                        role="menuitem"
                        tabIndex={0}
                        aria-label={`Mode: ${model.modeName}. ${model.modeBlurb} Best ${model.modeBestText}`}
                        ref={modeRowRef}
                    >
                        <button
                            type="button"
                            className="me-btn me-btn-icon"
                            aria-label="Previous mode"
                            onClick={() => gameState.setMode(cycleMode(model.mode, -1))}
                        >
                            <i className="me-arrow is-left" aria-hidden="true" />
                        </button>
                        <p className="me-display-md">{model.modeName}</p>
                        <button
                            type="button"
                            className="me-btn me-btn-icon"
                            aria-label="Next mode"
                            onClick={() => gameState.setMode(cycleMode(model.mode, 1))}
                        >
                            <i className="me-arrow" aria-hidden="true" />
                        </button>
                        <p className="me-hint">{model.modeBlurb}</p>
                        <p className="me-best">Best {model.modeBestText}</p>
                    </div>
                    {items.map((item, index) => (
                        <button
                            key={item.id}
                            role="menuitem"
                            className={item.id === 'play' ? 'me-btn me-btn-primary me-menu-wide' : 'me-btn'}
                            ref={(element) => {
                                buttonRefs.current[index] = element;
                            }}
                            onClick={() => {
                                if (item.id === 'play') gameState.play();
                                else if (item.id === 'settings') gameState.openSettings();
                                else if (item.id === 'feats') gameState.openFeats();
                                else if (item.id === 'wardrobe') gameState.openWardrobe();
                                else gameState.openHowTo();
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                    {/* The scroll hint: words plus a chevron as the menu's
                        own last row, inside its bottom edge — part of the
                        flow, so it never covers other text, and never in the
                        way of a tap. Never an emoji. */}
                    {moreBelow && (
                        <div className="menu-more-hint" aria-hidden="true">
                            More
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Menu;
