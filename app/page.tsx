"use client"; // Add this line at the top

import React, { useEffect, useState, useCallback } from 'react';
import Player from '../lib/player';
import GameState from '../lib/GameState';
import Hud from '../components/Hud';
import TouchLayer from '../components/TouchLayer';
import '../styles/globals.css';
import { Analytics } from "@vercel/analytics/react"

const Page: React.FC = () => {
    const [player, setPlayer] = useState<Player | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);

    // One recognised swipe is one move; taps never come here — the browser's
    // own click drives the title and the game-over panel.
    const handleSwipe = useCallback((dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
        if (!gameState) return;
        gameState.movePlayer(dx, dy);
    }, [gameState]);

    useEffect(() => {
        const newGameState = new GameState();
        setGameState(newGameState);
        setPlayer(newGameState.player);

        const handleKeyPress = (event: KeyboardEvent) => newGameState.handleKeyPress(event);
        window.addEventListener('keydown', handleKeyPress);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
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
                <img 
                    src="/images/title.png" 
                    alt="Title Screen" 
                    id="title-screen" 
                    onClick={() => gameState?.confirm()}
                />
                <div id="level-complete-animation"></div>
            </div>
            
            {gameState && (<Hud player={player} gameState={gameState} />)}
        </div>
        </TouchLayer>
        <Analytics/>
        </>
    );
};

export default Page;
