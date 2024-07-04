"use client"; // Add this line at the top

import React, { useEffect, useState } from 'react';
import { Player } from '../lib/types'; // Adjust the import path according to your project structure
import GameState from '../lib/GameState';
import Hud from '../components/Hud';
import Maze from '../components/Maze';
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
        console.log('page:29');
        const mazeContainer = document.getElementById('maze-container');
        const mazeElement = document.getElementById('maze');

        const updateMazeContainerSize = () => {
            const containerSize = Math.min(window.innerWidth, window.innerHeight) * 0.8;
            if (mazeContainer) {
                mazeContainer.style.width = `${containerSize}px`;
                mazeContainer.style.height = `${containerSize}px`;
            }
            if (mazeElement && gameState) {
                mazeElement.style.gridTemplateColumns = `repeat(${gameState.maze.width * 2 + 1}, 1fr)`;
                mazeElement.style.gridTemplateRows = `repeat(${gameState.maze.height * 2 + 1}, 1fr)`;
            }
            gameState?.handleResize();
        };

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
                <div id="maze">
                    <Maze player={player} setPlayer={setPlayer} />
                </div>
                <img src="/images/title.png" alt="Title Screen" id="title-screen" onClick={() => gameState?.startGame()}/>
            </div>
            <Hud player={player} />
        </div>
    );
};

export default Page;
