import { describe, expect, it } from "vitest";
import {
    DEFAULT_SETTINGS,
    SETTING_ROWS,
    announcement,
    resolveMotion,
    sanitizeSettings,
    type HudSnapshot,
    type Settings,
} from "@/game/settings";

/** A whole HUD snapshot on the playing screen, with anything overridable. */
function snapshotAt(over: Partial<HudSnapshot> = {}): HudSnapshot {
    return {
        energyText: "Energy: 100",
        energyPct: 100,
        scoreText: "Score: 0",
        bestPct: 0,
        level: "1.0",
        attack: "1.0",
        defense: "1.0",
        clockPct: 100,
        stepPct: 10,
        screen: "playing",
        ...over,
    };
}

describe("sanitizeSettings", () => {
    it("anything that is not a settings object gives the defaults", () => {
        for (const value of [undefined, null, "x", {}]) {
            expect(sanitizeSettings(value)).toEqual(DEFAULT_SETTINGS);
        }
    });

    it("every field is checked and defaulted on its own", () => {
        const fixed = sanitizeSettings({
            musicVol: 7,
            sfxVol: -1,
            motion: "wild",
            textScale: 3,
            muted: "yes",
        });
        expect(fixed.musicVol).toBe(1);
        expect(fixed.sfxVol).toBe(0);
        expect(fixed.motion).toBe("system");
        expect(fixed.textScale).toBe(1);
        expect(fixed.muted).toBe(false);
        // The fields that were absent still get their own defaults.
        expect(fixed.contrast).toBe(DEFAULT_SETTINGS.contrast);
        expect(fixed.shake).toBe(DEFAULT_SETTINGS.shake);
    });

    it("broken volumes land on the edges, broken numbers on the defaults", () => {
        expect(sanitizeSettings({ musicVol: 1.5 }).musicVol).toBe(1);
        expect(sanitizeSettings({ musicVol: -0.2 }).musicVol).toBe(0);
        expect(sanitizeSettings({ musicVol: Number.NaN }).musicVol).toBe(DEFAULT_SETTINGS.musicVol);
        expect(sanitizeSettings({ musicVol: "0.5" }).musicVol).toBe(DEFAULT_SETTINGS.musicVol);
        expect(sanitizeSettings({ sfxVol: Infinity }).sfxVol).toBe(DEFAULT_SETTINGS.sfxVol);
    });

    it("a whole valid settings object passes through untouched", () => {
        const good: Settings = {
            musicVol: 0.2,
            sfxVol: 0.9,
            muted: true,
            motion: "reduced",
            contrast: true,
            textScale: 1.5,
            shake: false,
            touch: "dpad",
            haptics: false,
            keys: { ...DEFAULT_SETTINGS.keys, up: ["KeyI", "ArrowUp"] },
        };
        expect(sanitizeSettings(good)).toEqual(good);
    });

    it("unknown extra fields survive sanitizing", () => {
        const kept = sanitizeSettings({ theme: "midnight", musicVol: 0.25 });
        expect(kept.musicVol).toBe(0.25);
        expect((kept as unknown as Record<string, unknown>).theme).toBe("midnight");
        expect(kept).toEqual({ ...DEFAULT_SETTINGS, musicVol: 0.25, theme: "midnight" });
    });

    it("touch and haptics keep valid values and default on broken ones", () => {
        expect(sanitizeSettings({ touch: "dpad" }).touch).toBe("dpad");
        expect(sanitizeSettings({ touch: "swipe" }).touch).toBe("swipe");
        expect(sanitizeSettings({ touch: "joystick" }).touch).toBe(DEFAULT_SETTINGS.touch);
        expect(sanitizeSettings({ touch: 1 }).touch).toBe(DEFAULT_SETTINGS.touch);
        expect(sanitizeSettings({ haptics: false }).haptics).toBe(false);
        expect(sanitizeSettings({ haptics: "yes" }).haptics).toBe(DEFAULT_SETTINGS.haptics);
        // The defaults: swipe-and-hold is the way, and the device rumbles (Q15).
        expect(sanitizeSettings({}).touch).toBe("swipe");
        expect(sanitizeSettings({}).haptics).toBe(true);
    });

    it("the keys field goes through sanitizeKeys: broken maps fall back to the defaults", () => {
        expect(sanitizeSettings({ keys: null }).keys).toEqual(DEFAULT_SETTINGS.keys);
        expect(sanitizeSettings({ keys: { up: ["KeyW"] } }).keys).toEqual(DEFAULT_SETTINGS.keys);
        // A whole, valid custom map is kept as it is.
        const custom = { ...DEFAULT_SETTINGS.keys, mute: ["KeyN"] };
        expect(sanitizeSettings({ keys: custom }).keys).toEqual(custom);
    });
});

describe("resolveMotion", () => {
    it("system follows the operating system's ask", () => {
        expect(resolveMotion("system", true)).toBe("reduced");
        expect(resolveMotion("system", false)).toBe("full");
    });

    it("full and reduced are taken at their word", () => {
        expect(resolveMotion("full", true)).toBe("full");
        expect(resolveMotion("reduced", false)).toBe("reduced");
    });
});

describe("SETTING_ROWS", () => {
    it("ids are unique and each is a key of Settings", () => {
        const ids = SETTING_ROWS.map((row) => row.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id in DEFAULT_SETTINGS, String(id)).toBe(true);
        }
    });

    it("every row has a label, a kind, and choices exactly when it is a choice row", () => {
        for (const row of SETTING_ROWS) {
            expect(row.label.length, row.id).toBeGreaterThan(0);
            expect(["slider", "toggle", "choice"]).toContain(row.kind);
            if (row.kind === "choice") {
                expect((row.choices ?? []).length, row.id).toBeGreaterThan(1);
                for (const choice of row.choices ?? []) {
                    expect(choice.value.length, row.id).toBeGreaterThan(0);
                    expect(choice.label.length, row.id).toBeGreaterThan(0);
                }
            } else {
                expect(row.choices, row.id).toBeUndefined();
            }
        }
    });
});

describe("announcement", () => {
    it("says Energy low when the energy crosses below 25%", () => {
        expect(announcement(snapshotAt({ energyPct: 30 }), snapshotAt({ energyPct: 24 }))).toBe("Energy low");
    });

    it("says it once per crossing, not again while the energy stays low", () => {
        expect(announcement(snapshotAt({ energyPct: 24 }), snapshotAt({ energyPct: 20 }))).toBeNull();
        // And a fall from exactly 25% is a crossing too.
        expect(announcement(snapshotAt({ energyPct: 25 }), snapshotAt({ energyPct: 24.9 }))).toBe("Energy low");
    });

    it("names the new level when the level changes", () => {
        expect(announcement(snapshotAt({ level: "2.0" }), snapshotAt({ level: "3.0" }))).toBe("Level 3");
        expect(announcement(snapshotAt({ level: "3.0" }), snapshotAt({ level: "3.5" }))).toBe("Level 3.5");
    });

    it("announces Paused and Game over on those screens", () => {
        expect(announcement(snapshotAt(), snapshotAt({ screen: "paused" }))).toBe("Paused");
        expect(announcement(snapshotAt(), snapshotAt({ screen: "over" }))).toBe("Game over");
    });

    it("unchanged snapshots give null", () => {
        const same = snapshotAt();
        expect(announcement(same, same)).toBeNull();
        expect(announcement(snapshotAt({ energyPct: 60 }), snapshotAt({ energyPct: 55 }))).toBeNull();
    });
});
