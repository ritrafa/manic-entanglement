import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOK,
  LAYER_ORDER,
  TRAITS,
  frameAt,
  sanitizeLook,
  spriteLayers,
  type Look,
} from "@/game/sprite";

describe("spriteLayers", () => {
  it("draws the default look as green body with regular eyes", () => {
    expect(spriteLayers(DEFAULT_LOOK, 1)).toEqual([
      "/images/nft/Body/Green1.png",
      "/images/nft/Eye/Regular1.png",
    ]);
  });

  it("skips None traits and keeps draw order", () => {
    const look: Look = { Back: "Wings", Body: "Gold", Clothes: "Robe", Eye: "Asleep", Head: "Crown" };
    expect(spriteLayers(look, 3)).toEqual([
      "/images/nft/Back/Wings3.png",
      "/images/nft/Body/Gold3.png",
      "/images/nft/Clothes/Robe3.png",
      "/images/nft/Eye/Asleep3.png",
      "/images/nft/Head/Crown3.png",
    ]);
    const noneLook: Look = { Back: "None", Body: "Green", Clothes: "None", Eye: "Regular", Head: "None" };
    expect(spriteLayers(noneLook, 2)).toEqual([
      "/images/nft/Body/Green2.png",
      "/images/nft/Eye/Regular2.png",
    ]);
    // "None" is not a valid Eye trait, so it falls back to the default (Regular).
    const eyeNoneLook: Look = { Back: "None", Body: "Green", Clothes: "None", Eye: "None", Head: "None" };
    expect(spriteLayers(eyeNoneLook, 2)).toEqual(spriteLayers(DEFAULT_LOOK, 2));
  });

  it("never lets unknown traits reach a URL", () => {
    const evil = { Back: "../../x", Body: "Green", Clothes: "a<b>", Eye: "Regular", Head: {} } as unknown as Look;
    expect(spriteLayers(evil, 1)).toEqual([
      "/images/nft/Body/Green1.png",
      "/images/nft/Eye/Regular1.png",
    ]);
  });

  it("has all four frame files on disk for every non-None trait", () => {
    for (const layer of LAYER_ORDER) {
      for (const trait of TRAITS[layer]) {
        if (trait === "None") continue;
        for (let frame = 1; frame <= 4; frame++) {
          const file = join(process.cwd(), "public", "images", "nft", layer, `${trait}${frame}.png`);
          expect(existsSync(file), `missing ${file}`).toBe(true);
        }
      }
    }
  });
});

describe("sanitizeLook", () => {
  it("replaces missing or unknown traits with the defaults", () => {
    expect(sanitizeLook({ Body: "../../x", Head: 5 })).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook(undefined)).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook("Green")).toEqual(DEFAULT_LOOK);
    expect(sanitizeLook({ Body: "Blue" })).toEqual({ ...DEFAULT_LOOK, Body: "Blue" });
  });

  it("keeps a fully valid look", () => {
    const look: Look = { Back: "Jetpack", Body: "Pink", Clothes: "Tank", Eye: "Scanner", Head: "Hood" };
    expect(sanitizeLook(look)).toEqual(look);
  });
});

describe("frameAt", () => {
  it("advances one frame every 150 ms and loops", () => {
    expect(frameAt(0)).toBe(1);
    expect(frameAt(149)).toBe(1);
    expect(frameAt(150)).toBe(2);
    expect(frameAt(450)).toBe(4);
    expect(frameAt(600)).toBe(1);
    expect(frameAt(750)).toBe(2);
  });
});
