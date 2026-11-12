// The title menu and the how-to-play lines as pure data: which entries the
// menu has, how the focus moves over them, and what the how-to explains.
// Pure: no DOM, no images loaded — the components render from these.

/** One entry of the title menu. */
export interface MenuItem {
    id: string;
    label: string;
}

/**
 * The title menu's entries, top to bottom. The first is always Play, so the
 * menu opens focused on starting a run; later cards add entries after these.
 */
export function menuItems(): MenuItem[] {
    return [
        { id: "play", label: "Play" },
        { id: "howto", label: "How to play" },
        { id: "settings", label: "Settings" },
    ];
}

/**
 * The menu index an action moves the focus to: up/left step back and
 * down/right step forward, both wrapping around; anything else (confirm,
 * unknown keys) keeps the index. A count of 0 has no focus to move: 0.
 */
export function moveFocus(index: number, count: number, action: string): number {
    if (!(count > 0)) return 0;
    switch (action) {
        case "up":
        case "left":
            return (index - 1 + count) % count;
        case "down":
        case "right":
            return (index + 1) % count;
        default:
            return index;
    }
}

/** One line of the how-to-play screen: a sentence and the sprite that shows it. */
export interface HowToLine {
    text: string;
    /** A path under /images/, or null when no sprite belongs to the line. */
    image: string | null;
}

/**
 * How to play, as the game actually is: one short sentence per line (never
 * over 90 characters, so each fits one row), each with the sprite that shows
 * it or null. The components print the text; it is never painted into an image.
 */
export const HOWTO: HowToLine[] = [
    { text: "Reach the exit to descend to the next level.", image: "/images/exit.gif" },
    { text: "Energy drains all the time and with every step; run out and the run ends.", image: "/images/energy.gif" },
    { text: "The maze rewires itself around the Knot each time you move.", image: null },
    { text: "Dashed marks will open, hatched marks will seal.", image: null },
    { text: "Enemies charge the toll shown on them.", image: "/images/enemy.gif" },
    { text: "Gear makes you stronger and is kept when you reach the exit; dying loses it.", image: "/images/gloves.gif" },
    { text: "Boots make each step cheaper and speed slows the energy clock.", image: "/images/boots.gif" },
    { text: "A backpack carries more energy.", image: "/images/backpack.gif" },
    { text: "Anchor freezes the maze for six moves; Twist rerolls the forecast. Keys 1 and 2.", image: "/images/tools/anchor.svg" },
    { text: "Arrows or WASD to move, hold to run; on touch, swipe.", image: null },
    { text: "Esc pauses the run, M mutes the sound.", image: null },
];
