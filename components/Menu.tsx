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
 * The title menu: the title art as the background of the board area with a dark
 * gradient over its lower half (so the painted START is covered), the mode row
 * and the menu's real-text buttons stacked on it. It draws while the shell is
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

    // The menu appearing (first show or a return to the title) starts at the top.
    useEffect(() => {
        if (showsButtons) setFocusIndex(0);
    }, [showsButtons]);

    // The first button takes focus when the menu appears, and the focused entry
    // follows the index the arrow keys move; the last slot is the mode row.
    useEffect(() => {
        if (!showsButtons) return;
        if (focusIndex === modeSlot) modeRowRef.current?.focus();
        else buttonRefs.current[focusIndex]?.focus();
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
        <div className={model.screen === 'countdown' ? 'title-menu dimmed' : 'title-menu'}>
            <img src="/images/title.png" alt="Manic Entanglement" className="title-art" draggable={false} />
            <div className="title-gradient" aria-hidden="true" />
            {showsButtons && (
                <div className="menu-buttons" onKeyDown={handleKeyDown} role="menu" aria-label="Main menu">
                    <div
                        className="mode-row"
                        role="menuitem"
                        tabIndex={0}
                        aria-label={`Mode: ${model.modeName}. ${model.modeBlurb} Best: ${model.modeBestText}`}
                        ref={modeRowRef}
                    >
                        <div className="mode-picker">
                            <button
                                type="button"
                                aria-label="Previous mode"
                                onClick={() => gameState.setMode(cycleMode(model.mode, -1))}
                            >
                                &#9664;
                            </button>
                            <span className="mode-name">{model.modeName}</span>
                            <button
                                type="button"
                                aria-label="Next mode"
                                onClick={() => gameState.setMode(cycleMode(model.mode, 1))}
                            >
                                &#9654;
                            </button>
                        </div>
                        <p className="mode-blurb">{model.modeBlurb}</p>
                        <p className="mode-best">Best: {model.modeBestText}</p>
                    </div>
                    {items.map((item, index) => (
                        <button
                            key={item.id}
                            role="menuitem"
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
            )}
        </div>
    );
};

export default Menu;
