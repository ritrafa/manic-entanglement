"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { LAYER_ORDER, TRAITS, frameAt, spriteLayers, type Layer, type Look } from '@/game/sprite';
import { availableTraits, cycleTrait } from '@/game/wardrobe';

interface WardrobeProps {
    gameState: GameState;
}

/** The preview is the 48 px art blown up to about 192 px, pixelated. */
const PREVIEW_PX = 192;
/** The preview repaints on this beat; frameAt picks the frame from the clock. */
const PREVIEW_TICK_MS = 150;

/** How many non-None traits exist across all layers (22 with the shipped art). */
const TOTAL_TRAITS = LAYER_ORDER.reduce(
    (total, layer) => total + TRAITS[layer].filter((trait) => trait !== 'None').length,
    0,
);

/**
 * The wardrobe: the reptile dressed from the trait art in the repo. A large
 * animated preview (the layers of spriteLayers stacked and drawn pixelated)
 * and one row per layer — the layer's name, a previous button, the current
 * trait's name and a next button, all driven by cycleTrait so only the traits
 * the player's feats unlocked can ever be worn. Under the rows: how many of
 * the 22 traits are unlocked and a line saying feats unlock more. Arrow keys
 * work on the focused row (Left steps back, Right forward); Esc and the Back
 * button close it. Opened from the title menu through GameState.
 */
const WardrobePanel: React.FC<WardrobeProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const firstButtonRef = useRef<HTMLButtonElement>(null);
    const open = model.screen === 'wardrobe';
    // A plain clock tick: frameAt(ms) alone decides which frame shows, so the
    // animation stays in step with the sprite in the game.
    const [now, setNow] = useState(() => Date.now());

    // The panel is modal while it shows: focus its Back button when it appears
    // and beat the preview to a new frame every 150 ms.
    useEffect(() => {
        if (!open) return;
        firstButtonRef.current?.focus();
        const timer = setInterval(() => setNow(Date.now()), PREVIEW_TICK_MS);
        return () => clearInterval(timer);
    }, [open]);

    if (!open) return null;

    const look: Look = model.look;
    const feats = model.feats;
    const urls = spriteLayers(look, frameAt(now));
    const unlockedCount = LAYER_ORDER.reduce(
        (total, layer) => total + availableTraits(layer, feats).filter((trait) => trait !== 'None').length,
        0,
    );

    // Esc closes the wardrobe from anywhere inside it, the way the feats panel does.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        gameState.closeWardrobe();
    };

    // Arrow keys on the focused row cycle that layer through its available traits.
    const handleRowKeyDown = (layer: Layer) => (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        gameState.setWardrobeLook(cycleTrait(look, layer, event.key === 'ArrowRight' ? 1 : -1, feats));
    };

    return (
        <div className="wardrobe-panel" role="dialog" aria-modal="true" aria-label="Wardrobe" onKeyDown={handleKeyDown}>
            <p className="overlay-title">Wardrobe</p>
            <div className="wardrobe-preview" style={{ width: PREVIEW_PX, height: PREVIEW_PX }} aria-hidden="true">
                {urls.map((url) => (
                    <img key={url} src={url} alt="" width={PREVIEW_PX} height={PREVIEW_PX} draggable={false} />
                ))}
            </div>
            <div className="wardrobe-rows">
                {LAYER_ORDER.map((layer) => (
                    <div
                        className="wardrobe-row"
                        key={layer}
                        role="group"
                        aria-label={`${layer}: ${look[layer]}`}
                        tabIndex={0}
                        onKeyDown={handleRowKeyDown(layer)}
                    >
                        <span className="wardrobe-layer">{layer}</span>
                        <button
                            type="button"
                            aria-label={`Previous ${layer} trait`}
                            onClick={() => gameState.setWardrobeLook(cycleTrait(look, layer, -1, feats))}
                        >
                            &#9664;
                        </button>
                        <span className="wardrobe-trait">{look[layer]}</span>
                        <button
                            type="button"
                            aria-label={`Next ${layer} trait`}
                            onClick={() => gameState.setWardrobeLook(cycleTrait(look, layer, 1, feats))}
                        >
                            &#9654;
                        </button>
                    </div>
                ))}
            </div>
            <p className="wardrobe-count">{unlockedCount} of {TOTAL_TRAITS} traits unlocked</p>
            <p className="wardrobe-hint">Earn feats to unlock more looks.</p>
            <div className="overlay-buttons">
                <button ref={firstButtonRef} onClick={() => gameState.closeWardrobe()}>Back</button>
            </div>
        </div>
    );
};

export default WardrobePanel;
