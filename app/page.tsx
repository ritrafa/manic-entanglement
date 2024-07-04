"use client"; // Add this line at the top

import React, { useEffect, useState } from 'react';
import { Player } from '../lib/types'; // Adjust the import path according to your project structure
import GameState from '../lib/GameState';
import Hud from '../components/Hud';
import '../styles/globals.css';

const Page: React.FC = () => {
    const [player, setPlayer] = useState<Player | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);

    useEffect(() => {
        console.log('page:15');
        const newGameState = new GameState();
        setGameState(newGameState);
        setPlayer(newGameState.player);

        const handleKeyPress = (event: KeyboardEvent) => newGameState.handleKeyPress(event);
        window.addEventListener('keydown', handleKeyPress);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
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
        <div className="game-container">
            <div id="maze-container">
                <div id="maze"/>
                <img src="/images/title.png" alt="Title Screen" id="title-screen" onClick={() => gameState?.startGame()}/>
                <div id="level-complete-animation"></div>
            </div>
            <Hud player={player} />
        </div>
    );
};

export default Page;
