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
 * The title screen and the title art (design/components/MenuList).
 *
 * On "title" the whole title block takes the board's place in the page's
 * top-aligned column (app/page.tsx): the painting band at its own aspect
 * ratio with the whole lettering, then the mode picker, the buttons and the
 * best line at their natural height, at the content width (up to 720 px
 * inside the 16 px gutters). Nothing inside it scrolls by itself; where the
 * block is taller than the screen the page itself scrolls.
 *
 * On "howto" and "countdown" only the art shows, as an overlay on the board
 * area (dimmed while the countdown runs over it); the buttons belong to the
 * title alone.
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

    const showsButtons = model.screen === 'title';

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
    // painting's own band, and focusing Play must never scroll the page down
    // (and with it the painting) on its own.
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

    if (model.screen === 'howto' || model.screen === 'countdown') {
        // The art alone over the board area, dimmed while the countdown runs.
        return (
            <div className={model.screen === 'countdown' ? 'title-menu dimmed' : 'title-menu'}>
                <img src="/images/title.png" alt="Manic Entanglement" className="title-art" draggable={false} />
            </div>
        );
    }

    if (model.screen !== 'title') return null;

    return (
        <div className="title-screen">
            <img src="/images/title.png" alt="Manic Entanglement" className="title-art" draggable={false} />
            <div className="me-menu" onKeyDown={handleKeyDown} role="menu" aria-label="Main menu">
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
            </div>
        </div>
    );
};

export default Menu;
