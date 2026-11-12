"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { menuItems, moveFocus } from '@/game/menu';

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
 * gradient over its lower half (so the painted START is covered), the menu's
 * real-text buttons stacked on it, and the current best under them when there
 * is one. It draws while the shell is on "title", "howto" or "countdown" — the
 * buttons only on "title", the art dimmed while the countdown runs over it.
 *
 * Arrow keys move the focus between the buttons through the pure moveFocus,
 * Enter or Space activates the focused one (the global confirm stays off a
 * focused button — see game/keys.ts — so one Enter starts exactly one run),
 * and the first button is focused when the menu appears. Mouse and touch tap
 * the buttons directly.
 */
const Menu: React.FC<MenuProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const items = menuItems();
    const [focusIndex, setFocusIndex] = useState(0);
    const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const showsArt = model.screen === 'title' || model.screen === 'howto' || model.screen === 'countdown';
    const showsButtons = model.screen === 'title';

    // The menu appearing (first show or a return to the title) starts at the top.
    useEffect(() => {
        if (showsButtons) setFocusIndex(0);
    }, [showsButtons]);

    // The first button takes focus when the menu appears, and the focused button
    // follows the index the arrow keys move.
    useEffect(() => {
        if (showsButtons) buttonRefs.current[focusIndex]?.focus();
    }, [focusIndex, showsButtons]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const action = focusActionOf(event.key);
        if (action === null) return;
        // The menu owns the arrows while it shows: no page scroll, no game step
        // (the shell only steps while a run is live).
        event.preventDefault();
        event.stopPropagation();
        setFocusIndex((index) => moveFocus(index, items.length, action));
    };

    if (!showsArt) return null;

    return (
        <div className={model.screen === 'countdown' ? 'title-menu dimmed' : 'title-menu'}>
            <img src="/images/title.png" alt="Manic Entanglement" className="title-art" draggable={false} />
            <div className="title-gradient" aria-hidden="true" />
            {showsButtons && (
                <div className="menu-buttons" onKeyDown={handleKeyDown} role="menu" aria-label="Main menu">
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
                                else gameState.openHowTo();
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                    {model.best > 0 && <p className="menu-best">Best: {model.best}</p>}
                </div>
            )}
        </div>
    );
};

export default Menu;
