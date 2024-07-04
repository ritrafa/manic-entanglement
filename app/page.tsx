"use client"; // Add this line at the top

import React, { useEffect, useState, useCallback } from 'react';
import { Player } from '../lib/types'; // Adjust the import path according to your project structure
import GameState from '../lib/GameState';
import Hud from '../components/Hud';
import MobileSwiper from '../components/mobile-swiper';
import '../styles/globals.css';

interface SwipeEvent {
    deltaX: number;
    deltaY: number;
}

const Page: React.FC = () => {
    const [player, setPlayer] = useState<Player | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);

    const handleSwipe = useCallback(({ deltaX, deltaY }: SwipeEvent) => {
        if (!gameState) return;

        if (deltaX == 0 && deltaY == 0 && !gameState.active) {
            gameState.startGame()
        }

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) {
                gameState.movePlayer(1, 0);
            } else {
                gameState.movePlayer(-1, 0);
            }
        } else {
            if (deltaY > 0) {
                gameState.movePlayer(0, 1);
            } else {
                gameState.movePlayer(0, -1);
            }
        }
    }, [gameState]);

    useEffect(() => {
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
        <MobileSwiper onSwipe={handleSwipe}>
        <div className="game-container">
            
            <div id="maze-container">
                <div id="maze"/>
                <img 
                    src="/images/title.png" 
                    alt="Title Screen" 
                    id="title-screen" 
                    onClick={() => gameState?.startGame()}
                />
                <div id="level-complete-animation"></div>
            </div>
            
            <Hud player={player} />
        </div>
        </MobileSwiper>
    );
};

export default Page;
