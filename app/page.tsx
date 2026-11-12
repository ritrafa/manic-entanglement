"use client"; // Add this line at the top

import React, { useEffect, useState, useCallback } from 'react';
import Player from '../lib/player';
import GameState from '../lib/GameState';
import Hud from '../components/Hud';
import TouchLayer from '../components/TouchLayer';
import Overlay from '../components/Overlay';
import Menu from '../components/Menu';
import HowTo from '../components/HowTo';
import '../styles/globals.css';
import { Analytics } from "@vercel/analytics/react"

const Page: React.FC = () => {
    const [player, setPlayer] = useState<Player | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);

    // One recognised swipe is one step, pressed and released at once so touches
    // share the keyboard's cadence; taps never come here — the browser's own
    // click drives the title and the game-over panel.
    const handleSwipe = useCallback((dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
        if (!gameState) return;
        gameState.tapMove(dx, dy);
    }, [gameState]);

    useEffect(() => {
        const newGameState = new GameState();
        setGameState(newGameState);
        setPlayer(newGameState.player);

        const handleKeyPress = (event: KeyboardEvent) => newGameState.handleKeyPress(event);
        const handleKeyRelease = (event: KeyboardEvent) => newGameState.handleKeyRelease(event);
        window.addEventListener('keydown', handleKeyPress);
        window.addEventListener('keyup', handleKeyRelease);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
            window.removeEventListener('keyup', handleKeyRelease);
            // Release every timer, listener and sound the shell owns.
            newGameState.dispose();
        };
    }, []);

    useEffect(() => {
        const updateMazeContainerSize = () => gameState?.handleResize();

        window.addEventListener('resize', updateMazeContainerSize);
        updateMazeContainerSize();

        return () => {
            window.removeEventListener('resize', updateMazeContainerSize);
        };
    }, [gameState]);

    if (!player) {
        return <div>Loading...</div>;
    }

    return (
        <>
        <TouchLayer onSwipe={handleSwipe}>
        <div className="game-container">
            
            <div id="maze-container">
                <div id="maze"/>
                {/* The title art, the menu buttons and the how-to come from the
                    shell's screen: the art shows on title, howto and countdown. */}
                {gameState && <Menu gameState={gameState} />}
                {gameState && <HowTo gameState={gameState} />}
                <div id="level-complete-animation"></div>
                {gameState && <Overlay gameState={gameState} />}
            </div>
            
            {gameState && (<Hud player={player} gameState={gameState} />)}
        </div>
        </TouchLayer>
        <Analytics/>
        </>
    );
};

export default Page;
