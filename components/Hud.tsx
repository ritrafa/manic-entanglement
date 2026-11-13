import React, { useSyncExternalStore } from 'react';
import { rpcUrl } from '@/lib/reptile';
import { pfpLayers } from '@/game/sprite';
import GameState from '@/lib/GameState';
import ToolBar from './ToolBar';
import WalletGate from './WalletGate';

interface HudProps {
    gameState: GameState;
}

/** A CSS custom property in a style object (--s sizes the sprite, --v the meter). */
function cssVars(vars: Record<string, string>): React.CSSProperties {
    return vars as React.CSSProperties;
}

/**
 * The HUD is the design's HudBar (design/components/HudBar), widened to fit:
 * two me-hud-row rows inside #hud, whose width styles/globals.css sets to the
 * larger of the board's width and 720px, never past the viewport minus the
 * 16px gutters, centred under the board. Row 1 carries the player's PFP
 * portrait, the wallet's button, the energy and score meters and the carried
 * marker; row 2 the four gear-sprite stats and the tool buttons — no emoji
 * anywhere. On a phone the bar takes the full width inside the gutters and
 * each row wraps as needed, so nothing runs off the edge.
 *
 * The portrait is built locally from the current loadout (game/sprite.ts
 * pfpLayers), never from the NFT's image address, so it matches the loadout at
 * every moment — including right after the wallet box loads a reptile, whose
 * look the shell applies to the same snapshot.
 *
 * The whole model comes from the shell's store: one source, no getElementById,
 * and a React re-render (e.g. a wallet connecting) can never put stale text back.
 */
const Hud: React.FC<HudProps> = ({ gameState }) => {
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);

    // No RPC endpoint configured: no wallet box at all (no button, no hook
    // that would miss its context). WalletGate holds the wallet hooks behind
    // a dynamic import so they are never called conditionally here and the
    // wallet code stays off the first load until the button is clicked.
    const hasWallet = rpcUrl() !== null;

    return (
        <div id="hud" className="me-hud">
        <div className="me-hud-row">
            {/* The reptile's PFP: the 16-grid portrait layers of the current
                look stacked at 48px on well — never the runner here. */}
            <div className="me-portrait">
                <div className="me-sprite" style={cssVars({ '--s': '48px' })} role="img" aria-label="Your reptile">
                    {pfpLayers(model.look).map((url) => (
                        <img key={url} src={url} alt="" />
                    ))}
                </div>
            </div>
            {hasWallet && <WalletGate gameState={gameState} />}
            <div className="me-hud-meters">
                {/* Low energy lives here, on the bar itself: the meter takes
                    is-low, the label and number turn to danger and the label
                    says "Energy low" — colour plus words, never colour alone. */}
                <span className={`me-label${model.energyLow ? ' me-danger' : ''}`}>
                    {model.energyLow ? 'Energy low' : 'Energy'}
                </span>
                <span className={`me-num ${model.energyLow ? 'me-danger' : 'me-energy'}`}>
                    {model.energyText}
                </span>
                <div
                    className={`me-meter${model.energyLow ? ' is-low' : ''}`}
                    style={cssVars({ '--v': `${model.energyPct}%` })}
                    role="progressbar"
                    aria-label="Energy"
                    aria-valuenow={Math.round(model.energyPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <i />
                </div>
                <span className="me-label">Score</span>
                <span className="me-num me-gold">{model.scoreText}</span>
                <div
                    className="me-meter is-gold"
                    style={cssVars({ '--v': `${model.bestPct}%` })}
                    role="progressbar"
                    aria-label="Progress toward best score"
                    aria-valuenow={Math.round(model.bestPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <i />
                </div>
            </div>
            {/* Gear picked up since the last exit: kept by reaching it, lost
                on death (game/run.ts). The marker shows only while something
                is carried, and rides row 1 so row 2 stays stats and tools. */}
            {model.carried > 0 && (
                <span className="me-carried" title="Reach the exit to keep it">
                    Carried {model.carried}
                </span>
            )}
        </div>
        <div className="me-hud-row">
            {/* Each stat carries the gear sprite that changes it (design/README.md,
                Iconography): gloves attack, shield defense, speed clock, boots
                step cost — 24px pixels, no emoji. The labels are always the
                short set (E52): Atk, Def, Clock and Step fit every width, so
                no stat is ever cut off at 1280 or anywhere else. */}
            <div className="me-stats">
                <div className="me-stat">
                    <img className="me-icon" src="/images/gloves.gif" alt="" />
                    <span className="me-label">Atk</span>
                    <b>{model.attack}</b>
                </div>
                <div className="me-stat">
                    <img className="me-icon" src="/images/shield.gif" alt="" />
                    <span className="me-label">Def</span>
                    <b>{model.defense}</b>
                </div>
                <div className="me-stat">
                    <img className="me-icon" src="/images/speed.gif" alt="" />
                    <span className="me-label">Clock</span>
                    <b>{model.clockPct}%</b>
                </div>
                <div className="me-stat">
                    <img className="me-icon" src="/images/boots.gif" alt="" />
                    <span className="me-label">Step</span>
                    <b>{model.stepPct}%</b>
                </div>
            </div>
            {/* The two tool buttons: Anchor and Twist, spent by click, tap or keys 1 and 2. */}
            <ToolBar gameState={gameState} />
        </div>
            {/* Spoken by assistive technology when the shell has something to
                say (game/settings.ts announcement): Energy low, Level N,
                Paused, Game over. Invisible on screen, polite in the reader. */}
            <div className="visually-hidden" aria-live="polite" role="status">
                {model.announcement}
            </div>
        </div>
    );
};

export default Hud;
