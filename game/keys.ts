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

/** The whole mapping as data: one or two `KeyboardEvent.code` values per action. */
export type KeyMap = Record<Action, string[]>;

/** The words the Controls screen puts in front of each action. */
export const ACTION_LABELS: Record<Action, string> = {
    up: "Move up",
    down: "Move down",
    left: "Move left",
    right: "Move right",
    confirm: "Confirm",
    mute: "Mute",
    pause: "Pause",
};

/** Every action, in the order the Controls screen lists them. */
export const ACTIONS: readonly Action[] = ["up", "down", "left", "right", "confirm", "mute", "pause"];

/**
 * Put `code` in `action`'s slot, returning a brand-new map (the input is never
 * touched). Escape is reserved: it cannot be assigned to anything and cannot be
 * taken away from `pause`, so such a request returns the map unchanged. When
 * another action already holds the code the two bindings swap — the other
 * action receives whatever this slot held; with this slot empty the other
 * action simply loses the code, unless that would leave it with nothing at all,
 * in which case the map is returned unchanged. Binding a code to the slot it
 * already occupies changes nothing.
 */
export function rebind(keys: KeyMap, action: Action, slot: 0 | 1, code: string): KeyMap {
    if (typeof code !== "string" || code === "") return keys;
    // Escape belongs to pause, always and only.
    if (code === "Escape") return keys;
    const own = keys[action];
    if (action === "pause" && own[slot] === "Escape") return keys;
    // Already exactly what was asked: nothing to do.
    if (own[slot] === code) return keys;

    // The code may live on another action (the map keeps every code unique).
    const owner = ACTIONS.find((other) => other !== action && keys[other].includes(code));

    // The code already sits on this action, just in the other slot: move it.
    if (owner === undefined && own.includes(code)) {
        const without = own.filter((candidate) => candidate !== code);
        const moved = [...without];
        moved.splice(slot, 0, code);
        return { ...keys, [action]: moved.slice(0, 2) };
    }

    const displaced = own[slot];
    const placed = [...own];
    placed[slot] = code;
    if (owner === undefined) {
        return { ...keys, [action]: placed };
    }
    if (displaced === undefined) {
        // An empty slot: the other action just gives the code up — unless that
        // would empty it entirely, which no binding may do.
        const ownerLeft = keys[owner].filter((candidate) => candidate !== code);
        if (ownerLeft.length === 0) return keys;
        return { ...keys, [action]: placed, [owner]: ownerLeft };
    }
    // The swap: the other action takes over the slot's old code in place.
    const ownerCodes = keys[owner].map((candidate) => (candidate === code ? displaced : candidate));
    return { ...keys, [action]: placed, [owner]: ownerCodes };
}

/**
 * Every stored value becomes a usable KeyMap: a JSON object holding exactly the
 * seven actions, each as one or two unique, non-empty strings, with `pause`
 * still holding Escape. Anything else — null, an array, a missing or extra
 * action, a non-string code, three codes, a duplicated code, a pause without
 * Escape — gives the defaults whole, never a half-repaired map.
 */
export function sanitizeKeys(value: unknown): KeyMap {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_KEYS;
    const source = value as Record<string, unknown>;
    const candidate = {} as KeyMap;
    const seen = new Set<string>();
    for (const action of ACTIONS) {
        const codes = source[action];
        if (!Array.isArray(codes) || codes.length < 1 || codes.length > 2) return DEFAULT_KEYS;
        for (const code of codes) {
            if (typeof code !== "string" || code === "" || seen.has(code)) return DEFAULT_KEYS;
            seen.add(code);
        }
        candidate[action] = [...codes] as string[];
    }
    // Unknown extra actions would smuggle codes past the uniqueness check.
    if (Object.keys(source).length !== ACTIONS.length) return DEFAULT_KEYS;
    if (!candidate.pause.includes("Escape")) return DEFAULT_KEYS;
    return candidate;
}

/** The code as a player reads it: KeyW to W, Digit1 to 1, ArrowUp to "Up arrow". */
export function keyLabel(code: string): string {
    const letter = /^Key([A-Z])$/.exec(code);
    if (letter) return letter[1];
    const digit = /^Digit(\d)$/.exec(code);
    if (digit) return digit[1];
    switch (code) {
        case "ArrowUp":
            return "Up arrow";
        case "ArrowDown":
            return "Down arrow";
        case "ArrowLeft":
            return "Left arrow";
        case "ArrowRight":
            return "Right arrow";
        case "Space":
            return "Space";
        default:
            return code;
    }
}
