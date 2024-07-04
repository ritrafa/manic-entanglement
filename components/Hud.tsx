"use client";

import React from 'react';
import { Player } from '../lib/types'; // Adjust the import path according to your project structure

interface HudProps {
    player: Player;
}

const Hud: React.FC<HudProps> = ({ player }) => {
    const progress = (player.points / player.high_score) * 100;

    return (
        <div className="hud">
            <div className="energy-bar">
                <div className="energy-bar-inner" style={{ width: `${player.energy}%` }}></div>
            </div>
            <div className="points">Points: {player.points}</div>

            <div className="progress-bar">
                <div className="progress-bar-inner" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="high-score">High Score: {player.high_score}</div>
        </div>
    );
};

export default Hud;
