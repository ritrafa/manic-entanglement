"use client";

import React from 'react';
import { Player } from '../lib/types'; // Adjust the import path according to your project structure

interface HudProps {
    player: Player;
}

const Hud: React.FC<HudProps> = ({ player }) => {
    const progress = (player.points / player.high_score) * 100;

    return (
        <div id="hud">
            <div id="energy-bar">
                <div id="energy-bar-inner" style={{ width: `${player.energy}%` }}></div>
            </div>
            <div id="status">Points: {player.points}</div>

            <div id="progress-bar">
                <div id="progress-bar-inner" style={{ width: `${progress}%` }}></div>
            </div>
            <div id="high-score">High Score: {player.high_score}</div>
        </div>
    );
};

export default Hud;
