import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HOWTO, menuItems, moveFocus } from "@/game/menu";

describe("moveFocus", () => {
    it("steps and wraps around at both ends", () => {
        expect(moveFocus(0, 2, "up")).toBe(1);
        expect(moveFocus(1, 2, "down")).toBe(0);
        expect(moveFocus(1, 2, "up")).toBe(0);
        expect(moveFocus(0, 2, "down")).toBe(1);
        expect(moveFocus(0, 3, "left")).toBe(2);
        expect(moveFocus(2, 3, "right")).toBe(0);
        expect(moveFocus(1, 3, "right")).toBe(2);
    });

    it("any other action keeps the index", () => {
        expect(moveFocus(0, 2, "confirm")).toBe(0);
        expect(moveFocus(1, 2, "confirm")).toBe(1);
        expect(moveFocus(1, 3, "mute")).toBe(1);
        expect(moveFocus(2, 3, "")).toBe(2);
    });

    it("an empty menu has no focus to move: 0", () => {
        expect(moveFocus(0, 0, "up")).toBe(0);
        expect(moveFocus(2, 0, "down")).toBe(0);
        expect(moveFocus(2, 0, "confirm")).toBe(0);
    });
});

describe("menuItems", () => {
    it("starts with Play and offers the how-to", () => {
        const items = menuItems();
        expect(items.length).toBeGreaterThanOrEqual(2);
        expect(items[0].id).toBe("play");
        expect(items.map((item) => item.label)).toContain("Play");
        expect(items.map((item) => item.label)).toContain("How to play");
    });

    it("has unique ids and non-empty labels", () => {
        const items = menuItems();
        const ids = items.map((item) => item.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const item of items) {
            expect(item.id.length).toBeGreaterThan(0);
            expect(item.label.length).toBeGreaterThan(0);
        }
    });

    it("returns a fresh array each call, so callers may mutate it", () => {
        const a = menuItems();
        a.pop();
        expect(menuItems().length).toBeGreaterThan(a.length);
    });
});

describe("HOWTO", () => {
    it("explains the game in a handful of lines", () => {
        expect(HOWTO.length).toBeGreaterThanOrEqual(5);
    });

    it("every image exists on disk under public", () => {
        for (const line of HOWTO) {
            if (line.image === null) continue;
            expect(line.image.startsWith("/images/"), line.image).toBe(true);
            const path = join(process.cwd(), "public", line.image);
            expect(existsSync(path), `${line.image} on disk`).toBe(true);
        }
    });

    it("every text is a short, non-empty sentence", () => {
        for (const line of HOWTO) {
            expect(line.text.length, line.text).toBeGreaterThan(0);
            // 95: the Knot line ("... Touching it costs a little energy.")
            // is the longest the owner asked for.
            expect(line.text.length, line.text).toBeLessThanOrEqual(95);
        }
    });
});

describe("menuItems: the wardrobe entry", () => {
    it("holds a Wardrobe entry between Settings and Feats", () => {
        const items = menuItems({ have: 3, of: 12 });
        const ids = items.map((item) => item.id);
        expect(ids).toEqual(["play", "howto", "settings", "wardrobe", "feats"]);
        expect(items.find((item) => item.id === "wardrobe")?.label).toBe("Wardrobe");
    });
});

describe("menuItems: the feats entry", () => {
    it("ends with a Feats entry counting the collection", () => {
        const items = menuItems({ have: 3, of: 12 });
        expect(items[items.length - 1].id).toBe("feats");
        expect(items[items.length - 1].label).toBe("Feats (3/12)");
    });

    it("without a progress it reads 0 of all the feats", () => {
        const items = menuItems();
        const feats = items.find((item) => item.id === "feats");
        expect(feats).toBeDefined();
        expect(feats!.label).toMatch(/^Feats \(0\/\d+\)$/);
    });

    it("clamps a silly progress into the list", () => {
        expect(menuItems({ have: 20, of: 12 }).at(-1)!.label).toBe("Feats (12/12)");
        expect(menuItems({ have: -3, of: 12 }).at(-1)!.label).toBe("Feats (0/12)");
        expect(menuItems({ have: Number.NaN, of: Number.NaN }).at(-1)!.label).toBe("Feats (0/12)");
    });
});
