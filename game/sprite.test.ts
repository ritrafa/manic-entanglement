import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOK,
  LAYER_ORDER,
  TRAITS,
  frameAt,
  pfpLayers,
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

  it("has all six files on disk for every non-None trait", () => {
    // <Trait>1..4.png, <Trait>pfp.png and <Trait>.png under
    // public/images/nft/<Layer>/, read straight from the filesystem.
    for (const layer of LAYER_ORDER) {
      for (const trait of TRAITS[layer]) {
        if (trait === "None") continue;
        for (const suffix of ["1", "2", "3", "4", "pfp", ""]) {
          const file = join(process.cwd(), "public", "images", "nft", layer, `${trait}${suffix}.png`);
          expect(existsSync(file), `missing ${file}`).toBe(true);
        }
      }
    }
  });
});

describe("pfpLayers", () => {
  it("stacks all five layers in draw order", () => {
    const look: Look = { Back: "Wings", Body: "Gold", Clothes: "Robe", Eye: "Asleep", Head: "Crown" };
    expect(pfpLayers(look)).toEqual([
      "/images/nft/Back/Wingspfp.png",
      "/images/nft/Body/Goldpfp.png",
      "/images/nft/Clothes/Robepfp.png",
      "/images/nft/Eye/Asleeppfp.png",
      "/images/nft/Head/Crownpfp.png",
    ]);
  });

  it("skips None traits and keeps draw order", () => {
    expect(pfpLayers(DEFAULT_LOOK)).toEqual([
      "/images/nft/Body/Greenpfp.png",
      "/images/nft/Eye/Regularpfp.png",
    ]);
    const noHead: Look = { Back: "Jetpack", Body: "Pink", Clothes: "None", Eye: "Scanner", Head: "None" };
    expect(pfpLayers(noHead)).toEqual([
      "/images/nft/Back/Jetpackpfp.png",
      "/images/nft/Body/Pinkpfp.png",
      "/images/nft/Eye/Scannerpfp.png",
    ]);
  });

  it("falls back like the runner when a trait is unknown", () => {
    const evil = { Back: "../../x", Body: "Green", Clothes: "a<b>", Eye: "Regular", Head: {} } as unknown as Look;
    expect(pfpLayers(evil)).toEqual(pfpLayers(DEFAULT_LOOK));
    expect(pfpLayers(null as unknown as Look)).toEqual(pfpLayers(DEFAULT_LOOK));
  });

  it("has the pfp file on disk for every non-None trait", () => {
    for (const layer of LAYER_ORDER) {
      for (const trait of TRAITS[layer]) {
        if (trait === "None") continue;
        const file = join(process.cwd(), "public", "images", "nft", layer, `${trait}pfp.png`);
        expect(existsSync(file), `missing ${file}`).toBe(true);
      }
    }
  });

  it("keeps the two shared names apart by layer", () => {
    // Circuit (Body and Clothes) and Crystal (Back and Clothes) are separate
    // traits: each only ever reaches a URL under its own layer's folder.
    const circuit: Look = { Back: "None", Body: "Circuit", Clothes: "Circuit", Eye: "Regular", Head: "None" };
    expect(spriteLayers(circuit, 1)).toEqual([
      "/images/nft/Body/Circuit1.png",
      "/images/nft/Clothes/Circuit1.png",
      "/images/nft/Eye/Regular1.png",
    ]);
    const crystal: Look = { Back: "Crystal", Body: "Green", Clothes: "Crystal", Eye: "Regular", Head: "None" };
    expect(pfpLayers(crystal)).toEqual([
      "/images/nft/Back/Crystalpfp.png",
      "/images/nft/Body/Greenpfp.png",
      "/images/nft/Clothes/Crystalpfp.png",
      "/images/nft/Eye/Regularpfp.png",
    ]);
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
