// The keyboard mapping as pure data: a keydown becomes a game action or nothing.
// Matching on KeyboardEvent.code (the physical key) keeps WASD working with
// Caps Lock, Shift or any layout. Pure: no DOM, no listeners.

/** Everything the shell can do in response to a key. */
export type Action = "up" | "down" | "left" | "right" | "confirm" | "mute" | "pause";

/** The plain facts from a keydown the mapping needs, so `game/` never touches the DOM. */
export interface KeyEventLike {
    code: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    targetTag?: string;
}

/** The default binding, one or more `KeyboardEvent.code` values per action. */
export const DEFAULT_KEYS: Record<Action, string[]> = {
    up: ["ArrowUp", "KeyW"],
    down: ["ArrowDown", "KeyS"],
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    confirm: ["Enter", "Space"],
    mute: ["KeyM"],
    pause: ["Escape", "KeyP"],
};

/** Tags whose typing belongs to the page, never to the game. */
const TEXT_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

/**
 * The action a keydown carries, or null when it belongs to the browser or the page:
 * Ctrl/Alt/Meta chords (Ctrl+W, Ctrl+S, ...) stay with the browser, and typing in a
 * form field or a focused button (Enter/Space activate it themselves) stays with the page.
 */
export function actionFor(
    event: KeyEventLike,
    keys: Record<Action, string[]> = DEFAULT_KEYS,
): Action | null {
    if (event.ctrlKey || event.altKey || event.metaKey) return null;
    const tag = (event.targetTag ?? "").toUpperCase();
    if (TEXT_TAGS.includes(tag)) return null;
    for (const action of Object.keys(keys) as Action[]) {
        if (keys[action].includes(event.code)) {
            // A focused button must keep Enter/Space for its own click.
            if (action === "confirm" && tag === "BUTTON") return null;
            return action;
        }
    }
    return null;
}

/** The movement a direction action stands for; null for the non-directional actions. */
export function dirOf(action: Action): { dx: number; dy: number } | null {
    switch (action) {
        case "up":
            return { dx: 0, dy: -1 };
        case "down":
            return { dx: 0, dy: 1 };
        case "left":
            return { dx: -1, dy: 0 };
        case "right":
            return { dx: 1, dy: 0 };
        default:
            return null;
    }
}
