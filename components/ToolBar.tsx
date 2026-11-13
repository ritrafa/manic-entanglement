import React, { useSyncExternalStore } from 'react';
import GameState from '@/lib/GameState';
import { TOOL_IDS, TOOL_INFO, type ToolId } from '@/game/tools';
import { keyLabel, type Action } from '@/game/keys';

/** Which key action spends which tool's charges (game/keys.ts). */
const TOOL_ACTION: Record<ToolId, Action> = { anchor: 'tool1', twist: 'tool2', cut: 'tool3' };

/** The tool's 24 px pixel icon (public/images/tools/, drawn pixelated). */
const TOOL_ICON: Record<ToolId, string> = {
    anchor: '/images/tools/anchor.png',
    twist: '/images/tools/twist.png',
    cut: '/images/tools/cut.png',
};

interface ToolBarProps {
    gameState: GameState;
}

/**
 * The tool buttons in the HUD (design/components/Button, the me-tools row):
 * each shows its 24 px pixel icon (public/images/tools/<name>.png, drawn
 * pixelated) beside its name, key hint and charge count, sits disabled at 0
 * charges, and spends one charge on a click or tap — the same path the
 * tool1/tool2 keys take through the shell. Cut needs a direction, so its button only arms it: while the snapshot
 * says the board is waiting for that direction, the button carries the pressed
 * look and the hint "Choose a direction".
 */
const ToolBar: React.FC<ToolBarProps> = ({ gameState }) => {
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    return (
        <div className="me-tools" role="toolbar" aria-label="Tools">
            {TOOL_IDS.map((id) => {
                const charges = model.tools[id];
                const armed = model.armed === id;
                const key = model.settings.keys[TOOL_ACTION[id]]?.[0];
                return (
                    <button
                        key={id}
                        type="button"
                        className={`me-btn me-tool${armed ? ' is-pressed' : ''}`}
                        onClick={() => gameState.useTool(id)}
                        disabled={charges <= 0}
                        aria-pressed={id === 'cut' ? armed : undefined}
                        aria-label={`${TOOL_INFO[id].name}: ${armed ? 'Choose a direction' : TOOL_INFO[id].hint}. ${charges} charge${charges === 1 ? '' : 's'}. Key ${key ? keyLabel(key) : 'unbound'}.`}
                    >
                        <img className="me-tool-icon" src={TOOL_ICON[id]} alt="" width={24} height={24} draggable={false} />
                        <span>{TOOL_INFO[id].name}</span>
                        {armed && <span className="me-hint me-gold">Choose a direction</span>}
                        <span className="me-key me-tool-key" aria-hidden="true">{key ? keyLabel(key) : ''}</span>
                        <span className="me-count" aria-hidden="true">{charges}</span>
                    </button>
                );
            })}
            {model.anchored > 0 && (
                <span className="me-hint" aria-hidden="true">Anchored: {model.anchored}</span>
            )}
        </div>
    );
};

export default ToolBar;
