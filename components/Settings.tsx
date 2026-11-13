"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import { SETTING_ROWS, type SettingRow } from '@/game/settings';

interface SettingsProps {
    gameState: GameState;
}

/**
 * The settings panel (design/components/Panel and Settings): one row per
 * SETTING_ROWS entry, built by a loop and nothing else — me-range sliders for
 * the volumes (a native range input with the value printed next to it),
 * me-check checkboxes for the switches and me-radio groups for the choices
 * inside a me-fieldset, every control inside a real <label>. Opened from the
 * title menu or the pause panel; the Back button (and Esc, which the shell
 * maps to "back") returns where the visit started. The first control takes
 * focus when the panel appears, and typing in these fields never reaches the
 * game (see the targetTag rule in game/keys.ts).
 */
const SettingsPanel: React.FC<SettingsProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const firstControlRef = useRef<HTMLInputElement>(null);
    const open = model.screen === 'settings';
    // Wiping progress asks once more: the first press only arms the button.
    const [confirmReset, setConfirmReset] = useState(false);

    // The panel is modal while it shows: focus the first control when it appears.
    useEffect(() => {
        if (open) firstControlRef.current?.focus();
    }, [open]);

    // A half-armed reset never survives a visit: the arming is dropped by a
    // render-time state adjustment whenever the open flag changes.
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        setConfirmReset(false);
    }

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
        <div className="me-scrim" onKeyDown={handleKeyDown}>
            <section className="me-panel" role="dialog" aria-modal="true" aria-label="Settings">
                <h2 className="me-panel-title">Settings</h2>
                <div className="me-panel-body">
                    {SETTING_ROWS.map((row: SettingRow, index: number) => {
                        const controlId = `setting-${row.id}`;
                        if (row.kind === 'slider') {
                            const value = model.settings[row.id] as number;
                            return (
                                <label className="me-field" key={row.id} htmlFor={controlId}>
                                    <span className="settings-label">{row.label}</span>
                                    <input
                                        id={controlId}
                                        className="me-range"
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={value}
                                        ref={index === 0 ? firstControlRef : undefined}
                                        onChange={(event) => gameState.setSetting(row.id, Number(event.target.value))}
                                    />
                                    <span className="me-value">{Math.round(value * 100)}%</span>
                                </label>
                            );
                        }
                        if (row.kind === 'toggle') {
                            const checked = model.settings[row.id] as boolean;
                            return (
                                <label className="me-field" key={row.id}>
                                    <input
                                        className="me-check"
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => gameState.setSetting(row.id, event.target.checked)}
                                    />
                                    {row.label}
                                </label>
                            );
                        }
                        const current = String(model.settings[row.id]);
                        return (
                            <fieldset className="me-fieldset" key={row.id}>
                                <legend className="me-label">{row.label}</legend>
                                {(row.choices ?? []).map((choice) => (
                                    <label className="me-field" key={choice.value} htmlFor={`${controlId}-${choice.value}`}>
                                        <input
                                            id={`${controlId}-${choice.value}`}
                                            className="me-radio"
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
                    <div className="me-panel-actions">
                        <button className="me-btn" onClick={() => gameState.openControls()}>Controls</button>
                        <button
                            className="me-btn me-btn-danger"
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
                        <button className="me-btn me-btn-primary" onClick={() => gameState.closeSettings()}>Back</button>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default SettingsPanel;
