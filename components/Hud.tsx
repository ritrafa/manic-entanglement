import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { rpcUrl } from '@/lib/reptile';
import { pfpLayers } from '@/game/sprite';
import GameState from '@/lib/GameState';
import ToolBar from './ToolBar';
import { TOOL_IDS } from '@/game/tools';
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
 *
 * E65: the bar renders on every screen, the title included, always in the same
 * place under the fixed stage. Before a run the meters show their starting
 * values (the fresh run's model, game/hud.ts) and the tool buttons are
 * disabled; they wake the moment the shell is playing.
 */
const Hud: React.FC<HudProps> = ({ gameState }) => {
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);

    // E65: the HUD shows on every screen, the title included, so the tool
    // buttons must answer outside a run too: they are disabled whenever the
    // shell is not playing (ToolBar's own rule only knows the charges). The
    // buttons are ToolBar's own; this walks them in TOOL_IDS order after every
    // render whose screen or charges changed, applying charge AND play state,
    // so a stale enabled button can never survive into the title.
    const playing = model.screen === 'playing';
    const hudRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const root = hudRef.current;
        if (!root) return;
        const buttons = root.querySelectorAll<HTMLButtonElement>('.me-tools .me-tool');
        buttons.forEach((button, index) => {
            const id = TOOL_IDS[index];
            if (id === undefined) return;
            button.disabled = !playing || model.tools[id] <= 0;
        });
    }, [playing, model.tools]);

    // No RPC endpoint configured: no wallet box at all (no button, no hook
    // that would miss its context). WalletGate holds the wallet hooks behind
    // a dynamic import so they are never called conditionally here and the
    // wallet code stays off the first load until the button is clicked.
    const hasWallet = rpcUrl() !== null && model.settings.wallet;

    return (
        <div id="hud" className="me-hud" ref={hudRef}>
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
            {/* The trait held since the last exit (E58): its PFP icon rides
                beside the carried marker — the same story, reach the exit or
                lose it (game/run.ts). */}
            {model.heldTrait !== null && (
                <span className="me-held-trait" title="Reach the exit to keep it">
                    <img
                        className="me-held-trait-icon"
                        src={`/images/nft/${model.heldTrait.layer}/${model.heldTrait.trait}pfp.png`}
                        alt=""
                    />
                    {model.heldTrait.trait}
                </span>
            )}
            {/* A verified run (E70): the seed came from the server and its
                log will be replayed there for a signed proof. The small mark
                rides row 1 so the player can tell, at a glance, that this
                run counts for the NFT. */}
            {model.verified && (
                <span className="me-verified" role="status" title="Server-seeded run: it counts toward minting and saving">
                    Verified
                </span>
            )}
            {/* Every run that is not verified says so for as long as it
                lasts (E76), in the Verified mark's place: its progress will
                not reach a reptile. Hidden when Settings turned the wallet off. */}
            {!model.verified && hasWallet && (playing || model.screen === 'paused') && (
                <span
                    className="me-verified is-off"
                    role="status"
                    title={model.walletLinked
                        ? 'This run is not verified: its progress will not be saved to your reptile.'
                        : 'No wallet connected: this run will not be saved. Connect a wallet before a run to save it.'}
                >
                    Not saved
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
