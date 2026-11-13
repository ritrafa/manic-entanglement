"use client";

import React, { Fragment, useEffect, useRef, useSyncExternalStore } from 'react';
import GameState, { type GameSnapshot } from '@/lib/GameState';
import type { SummaryLine } from '@/game/screens';
import WardrobePanel from './Wardrobe';

interface OverlayProps {
    gameState: GameState;
}

/** The one panel on the scrim (design/components/Panel), centred and scrolling
 *  inside. `panelClass` adds a modifier for a panel that tightens its own
 *  spacing in styles/globals.css (the pause panel, E52). */
function Panel(props: { label: string; title: string; panelClass?: string; children: React.ReactNode }): React.ReactElement {
    return (
        <div className="me-scrim">
            <section className={props.panelClass ? `me-panel ${props.panelClass}` : 'me-panel'} role="dialog" aria-modal="true" aria-label={props.label}>
                <h2 className="me-panel-title">{props.title}</h2>
                <div className="me-panel-body">{props.children}</div>
            </section>
        </div>
    );
}

/**
 * The pause and game-over panels, rendered from the shell's snapshot and nothing
 * else: while the game plays this draws nothing, "paused" gets a panel with
 * Resume, Restart and Quit to title, and "over" shows the run summary with Retry
 * and Menu. Each is one me-panel on the scrim; the first button takes focus
 * when a panel appears, so Enter acts on it at once (actionFor keeps Enter off
 * the global confirm while a button is focused). Real <button> elements, so
 * keyboard, mouse and touch all work.
 */
const Overlay: React.FC<OverlayProps> = ({ gameState }) => {
    const model: GameSnapshot = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    const firstButtonRef = useRef<HTMLButtonElement>(null);
    const open = model.screen === 'paused' || model.screen === 'over';

    // The panel is modal while it shows: focus its first button when it appears.
    useEffect(() => {
        if (open) firstButtonRef.current?.focus();
    }, [open, model.screen]);

    // The wardrobe is the shell's other modal panel; it lives in its own
    // component and comes along so the shell mounts one dialog owner.
    if (model.screen === 'wardrobe') return <WardrobePanel gameState={gameState} />;

    if (!open) return null;

    if (model.screen === 'paused') {
        return (
            <Panel label="Paused" title="Paused" panelClass="pause-panel">
                <div className="me-panel-actions">
                    <button className="me-btn me-btn-primary" ref={firstButtonRef} onClick={() => gameState.resume()}>Resume</button>
                    <button className="me-btn" onClick={() => gameState.restart()}>Restart</button>
                    <button className="me-btn" onClick={() => gameState.openSettings()}>Settings</button>
                    <button className="me-btn" onClick={() => gameState.quit()}>Quit to title</button>
                </div>
            </Panel>
        );
    }

    return (
        <Panel label={model.finished ? 'Run finished' : 'Game over'} title={model.finished ? 'Run complete' : 'Game over'}>
            <dl className="me-summary">
                {(model.summary ?? []).map((line: SummaryLine, index: number) => (
                    // Two "New feat" rows can share a label, so the key is the row.
                    <Fragment key={`${line.label}-${index}`}>
                        <dt>{line.label}</dt>
                        {/* A value is coloured only when it is a result: the cause
                            of the run in danger, the earned best in gold. */}
                        <dd className={line.value === 'New best!' ? 'me-gold' : line.label === 'Cause' ? 'me-danger' : undefined}>
                            {line.value}
                        </dd>
                    </Fragment>
                ))}
            </dl>
            <hr className="me-divider" />
            <div className="me-panel-actions">
                <button className="me-btn me-btn-primary" ref={firstButtonRef} onClick={() => gameState.confirm()}>Retry</button>
                <button className="me-btn" onClick={() => gameState.quit()}>Menu</button>
            </div>
        </Panel>
    );
};

export default Overlay;
