import React, { useSyncExternalStore } from 'react';
import GameState from '@/lib/GameState';
import { TOOL_IDS, TOOL_INFO, type ToolId } from '@/game/tools';
import { keyLabel, type Action } from '@/game/keys';

/** Which key action spends which tool's charges (game/keys.ts). */
const TOOL_ACTION: Record<ToolId, Action> = { anchor: 'tool1', twist: 'tool2' };

interface ToolBarProps {
    gameState: GameState;
}

/**
 * The two tool buttons in the HUD: each shows its icon, name, key hint and
 * charge count, sits disabled at 0 charges, and spends one charge on a click
 * or tap — the same path the tool1/tool2 keys take through the shell.
 */
const ToolBar: React.FC<ToolBarProps> = ({ gameState }) => {
    const model = useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot);
    return (
        <div className="toolbar" role="toolbar" aria-label="Tools">
            {TOOL_IDS.map((id) => {
                const charges = model.tools[id];
                const key = model.settings.keys[TOOL_ACTION[id]]?.[0];
                return (
                    <button
                        key={id}
                        type="button"
                        className={`tool-button tool-${id}`}
                        onClick={() => gameState.useTool(id)}
                        disabled={charges <= 0}
                        aria-label={`${TOOL_INFO[id].name}: ${TOOL_INFO[id].hint}. ${charges} charge${charges === 1 ? '' : 's'}. Key ${key ? keyLabel(key) : 'unbound'}.`}
                    >
                        <img src={`/images/tools/${id}.svg`} alt="" className="tool-icon" aria-hidden="true" />
                        <span className="tool-name">{TOOL_INFO[id].name}</span>
                        <span className="tool-key" aria-hidden="true">{key ? keyLabel(key) : ''}</span>
                        <span className="tool-count" aria-hidden="true">{charges}</span>
                    </button>
                );
            })}
            {model.anchored > 0 && (
                <span className="tool-anchored" aria-hidden="true">Anchored: {model.anchored}</span>
            )}
        </div>
    );
};

export default ToolBar;
