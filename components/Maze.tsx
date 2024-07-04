"use client";

import React, { useEffect, useRef } from 'react';
import { Player } from '../lib/types'; // Adjust the import path according to your project structure
import GameState from '../lib/GameState';
import '../styles/Maze.module.css';

interface MazeProps {
    player: Player;
    setPlayer: React.Dispatch<React.SetStateAction<Player>>;
}

const Maze: React.FC<MazeProps> = ({ player, setPlayer }) => {
    const mazeRef = useRef<HTMLDivElement>(null);
    const gameStateRef = useRef<GameState | null>(null);

    useEffect(() => {
        if (mazeRef.current) {
            // Initialize the game and set the player state
            const newGameState = new GameState();
            gameStateRef.current = newGameState;
            setPlayer(newGameState.player);

            // Add event listener for key presses
            const handleKeyPress = (event: KeyboardEvent) => newGameState.handleKeyPress(event);
            window.addEventListener('keydown', handleKeyPress);

            return () => {
                // Clean up event listener
                window.removeEventListener('keydown', handleKeyPress);
            };
        }
    }, [setPlayer]);

    return <div id="maze" ref={mazeRef}></div>;
};

export default Maze;