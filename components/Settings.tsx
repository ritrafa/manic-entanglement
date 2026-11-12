"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { SETTING_ROWS, type SettingRow } from '@/game/settings';

interface SettingsProps {
    gameState: GameState;
}

/**
 * The settings screen: one row per SETTING_ROWS entry, built by a loop and
 * nothing else — sliders for the volumes (a native range input with the value
 * printed next to it), checkboxes for the switches and radio groups for the
 * choices, every control inside a real <label>. Opened from the title menu or
 * the pause panel; the Back button (and Esc, which the shell maps to "back")
 * returns where the visit started. The first control takes focus when the
 * panel appears, and typing in these fields never reaches the game (see the
 * targetTag rule in game/keys.ts).
 */
const SettingsPanel: React.FC<SettingsProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const firstControlRef = useRef<HTMLInputElement>(null);
    const open = model.screen === 'settings';
    // Wiping progress asks once more: the first press only arms the button.
    const [confirmReset, setConfirmReset] = useState(false);

    // The panel is modal while it shows: focus the first control when it appears,
    // and a half-armed reset never survives a visit.
    useEffect(() => {
        if (open) firstControlRef.current?.focus();
        setConfirmReset(false);
    }, [open]);

    if (!open) return null;

    // Esc closes the panel from anywhere inside it. A focused form control
    // keeps its keys from the global handler (game/keys.ts leaves INPUT and
    // friends to the page), so the panel listens itself and sends "back".
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        gameState.closeSettings();
    };

    return (
        <div className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings" onKeyDown={handleKeyDown}>
            <p className="overlay-title">Settings</p>
            <div className="settings-rows">
                {SETTING_ROWS.map((row: SettingRow, index: number) => {
                    const controlId = `setting-${row.id}`;
                    if (row.kind === 'slider') {
                        const value = model.settings[row.id] as number;
                        return (
                            <div className="settings-row" key={row.id}>
                                <label htmlFor={controlId}>{row.label}</label>
                                <input
                                    id={controlId}
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={value}
                                    ref={index === 0 ? firstControlRef : undefined}
                                    onChange={(event) => gameState.setSetting(row.id, Number(event.target.value))}
                                />
                                <span className="settings-value">{Math.round(value * 100)}%</span>
                            </div>
                        );
                    }
                    if (row.kind === 'toggle') {
                        const checked = model.settings[row.id] as boolean;
                        return (
                            <div className="settings-row" key={row.id}>
                                <label className="settings-toggle">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => gameState.setSetting(row.id, event.target.checked)}
                                    />
                                    {row.label}
                                </label>
                            </div>
                        );
                    }
                    const current = String(model.settings[row.id]);
                    return (
                        <fieldset className="settings-row settings-choice" key={row.id}>
                            <legend>{row.label}</legend>
                            {(row.choices ?? []).map((choice) => (
                                <label className="settings-radio" key={choice.value} htmlFor={`${controlId}-${choice.value}`}>
                                    <input
                                        id={`${controlId}-${choice.value}`}
                                        type="radio"
                                        name={row.id}
                                        value={choice.value}
                                        checked={current === choice.value}
                                        onChange={() => gameState.setSetting(row.id, choice.value)}
                                    />
                                    {choice.label}
                                </label>
                            ))}
                        </fieldset>
                    );
                })}
            </div>
            <div className="overlay-buttons">
                <button onClick={() => gameState.openControls()}>Controls</button>
                <button
                    className="settings-reset"
                    onClick={() => {
                        if (confirmReset) {
                            setConfirmReset(false);
                            gameState.resetProgress();
                        } else {
                            setConfirmReset(true);
                        }
                    }}
                >
                    {confirmReset ? 'Really reset everything?' : 'Reset progress'}
                </button>
                <button onClick={() => gameState.closeSettings()}>Back</button>
            </div>
        </div>
    );
};

export default SettingsPanel;
