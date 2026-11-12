// The player's settings as pure data: the shape, the defaults, a sanitizer that
// never throws, the motion resolution, the rows the settings screen draws, and
// the HUD announcements that matter. Pure: no DOM, no matchMedia, no storage —
// lib/GameState.ts loads these through sanitizeSettings and applies them.

import { DEFAULT_KEYS, sanitizeKeys, type KeyMap } from "./keys";
import type { HudModel } from "./hud";
import type { Screen } from "./screens";

/** How much motion the player asked for; "system" follows the OS's own ask. */
export type MotionSetting = "system" | "full" | "reduced";

/** Everything the settings screen owns, one validated field at a time. */
export interface Settings {
    /** The music bus volume, 0 to 1. */
    musicVol: number;
    /** The effects bus volume, 0 to 1. */
    sfxVol: number;
    /** True silences every sound the shell owns. */
    muted: boolean;
    /** The motion ask; "system" follows prefers-reduced-motion. */
    motion: MotionSetting;
    /** True draws the high-contrast "clear shapes" look. */
    contrast: boolean;
    /** The HUD and panel text scale. */
    textScale: 1 | 1.25 | 1.5;
    /** True lets the board shake. */
    shake: boolean;
    /** The keyboard mapping the Controls screen edits (game/keys.ts). */
    keys: KeyMap;
}

/** The starting point: heard but gentle, calm by default, shake on. */
export const DEFAULT_SETTINGS: Settings = {
    musicVol: 0.5,
    sfxVol: 0.7,
    muted: false,
    motion: "system",
    contrast: false,
    textScale: 1,
    shake: true,
    keys: DEFAULT_KEYS,
};

/** The accepted motion settings, in the order the screen offers them. */
const MOTION_VALUES: readonly MotionSetting[] = ["system", "full", "reduced"];

/** The accepted text scales, in the order the screen offers them. */
const TEXT_SCALES: readonly (1 | 1.25 | 1.5)[] = [1, 1.25, 1.5];

/** True for a JSON object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pin a finite number into [0, 1]. */
function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** A volume, clamped to 0..1; anything that is not a finite number is the default. */
function readVolume(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return clamp01(value);
}

/** A real boolean, or the default. */
function readBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

/**
 * Every stored object becomes a complete, valid Settings: each field is checked
 * and defaulted on its own, so one broken field never drops the others. Volumes
 * clamp to 0..1, motion and textScale only keep accepted values, and unknown
 * extra fields are kept untouched (later cards add fields to the same object).
 */
export function sanitizeSettings(value: unknown): Settings {
    const source: Record<string, unknown> = isRecord(value) ? { ...value } : {};
    const checked: Settings = {
        musicVol: readVolume(source.musicVol, DEFAULT_SETTINGS.musicVol),
        sfxVol: readVolume(source.sfxVol, DEFAULT_SETTINGS.sfxVol),
        muted: readBoolean(source.muted, DEFAULT_SETTINGS.muted),
        motion: MOTION_VALUES.includes(source.motion as MotionSetting)
            ? (source.motion as MotionSetting)
            : DEFAULT_SETTINGS.motion,
        contrast: readBoolean(source.contrast, DEFAULT_SETTINGS.contrast),
        textScale: TEXT_SCALES.includes(source.textScale as 1 | 1.25 | 1.5)
            ? (source.textScale as 1 | 1.25 | 1.5)
            : DEFAULT_SETTINGS.textScale,
        shake: readBoolean(source.shake, DEFAULT_SETTINGS.shake),
        keys: sanitizeKeys(source.keys),
    };
    // The extras first, the checked fields over them: unknown keys survive.
    return { ...source, ...checked } as Settings;
}

/**
 * What the motion setting asks for right now: "full" and "reduced" are taken
 * at their word, and "system" follows the operating system's own ask.
 */
export function resolveMotion(setting: MotionSetting, systemReduced: boolean): "full" | "reduced" {
    if (setting === "full") return "full";
    if (setting === "reduced") return "reduced";
    return systemReduced ? "reduced" : "full";
}

/** One radio option of a choice row. */
export interface SettingChoice {
    /** The value handed back to setSetting, as text (the row's field validates it). */
    value: string;
    label: string;
}

/** One row of the settings screen: the component is a loop over these. */
export interface SettingRow {
    /** The Settings field the row edits. */
    id: keyof Settings;
    label: string;
    kind: "slider" | "toggle" | "choice";
    /** The options a choice row offers as a radio group; absent otherwise. */
    choices?: SettingChoice[];
}

/** The rows the settings screen shows, top to bottom. */
export const SETTING_ROWS: readonly SettingRow[] = [
    { id: "musicVol", label: "Music volume", kind: "slider" },
    { id: "sfxVol", label: "Effects volume", kind: "slider" },
    { id: "muted", label: "Mute sound", kind: "toggle" },
    {
        id: "motion",
        label: "Motion",
        kind: "choice",
        choices: [
            { value: "system", label: "Follow system" },
            { value: "full", label: "Full" },
            { value: "reduced", label: "Reduced" },
        ],
    },
    { id: "contrast", label: "Clear shapes", kind: "toggle" },
    {
        id: "textScale",
        label: "Text size",
        kind: "choice",
        choices: [
            { value: "1", label: "Normal" },
            { value: "1.25", label: "Large" },
            { value: "1.5", label: "Largest" },
        ],
    },
    { id: "shake", label: "Screen shake", kind: "toggle" },
];

/** The two snapshots announcement compares: the whole HUD model plus the screen. */
export type HudSnapshot = HudModel & { screen: Screen };

/** The energy percentage the low call crosses on its way down. */
const LOW_ENERGY_PCT = 25;

/**
 * What the screen reader should hear between two HUD snapshots, or null when
 * nothing worth saying happened: "Energy low" the moment the energy crosses
 * below 25% (not again while it stays low), "Level N" when the level changes,
 * and "Paused" / "Game over" when the shell moves onto those screens.
 */
export function announcement(prev: HudSnapshot, next: HudSnapshot): string | null {
    if (next.screen !== prev.screen) {
        if (next.screen === "paused") return "Paused";
        if (next.screen === "over") return "Game over";
    }
    if (next.level !== prev.level) {
        const level = Number(next.level);
        return `Level ${Number.isFinite(level) ? level : next.level}`;
    }
    if (prev.energyPct >= LOW_ENERGY_PCT && next.energyPct < LOW_ENERGY_PCT) {
        return "Energy low";
    }
    return null;
}
