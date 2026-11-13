import { describe, expect, it } from "vitest";
import {
  SAVE_KEY,
  defaultSave,
  loadSave,
  resetProgress,
  writeSave,
  type SaveData,
  type StorageLike,
} from "@/game/save";

/** A storage backed by a plain object; optionally fail on read or write. */
function fakeStorage(
  initial: Record<string, string> = {},
  opts: { throwOnGet?: boolean; throwOnSet?: boolean } = {},
): StorageLike & { stored: Record<string, string> } {
  const stored = { ...initial };
  const storage = {
    stored,
    getItem(key: string): string | null {
      if (opts.throwOnGet) throw new Error("storage is blocked");
      return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null;
    },
    setItem(key: string, value: string): void {
      if (opts.throwOnSet) throw new Error("quota exceeded");
      stored[key] = value;
    },
  };
  return storage;
}

/** A storage holding one JSON value under the save key. */
function storageWith(json: string): StorageLike & { stored: Record<string, string> } {
  return fakeStorage({ [SAVE_KEY]: json });
}

describe("defaultSave", () => {
  it("is empty on every field", () => {
    expect(defaultSave()).toEqual({
      v: 1,
      best: {},
      settings: {},
      gear: {},
      totals: {},
      feats: [],
      look: null,
      seen: {},
    });
  });

  it("returns a different object each call", () => {
    const a = defaultSave();
    const b = defaultSave();
    expect(a).not.toBe(b);
    a.best.descent = 99;
    a.feats.push("dash");
    expect(b.best).toEqual({});
    expect(b.feats).toEqual([]);
  });
});

describe("loadSave", () => {
  it("gives the default for a null storage or a missing key", () => {
    expect(loadSave(null)).toEqual(defaultSave());
    expect(loadSave(fakeStorage())).toEqual(defaultSave());
  });

  it("gives the default for broken JSON, null, an array or another version", () => {
    expect(loadSave(storageWith("{ not json"))).toEqual(defaultSave());
    expect(loadSave(storageWith("null"))).toEqual(defaultSave());
    expect(loadSave(storageWith("[1,2,3]"))).toEqual(defaultSave());
    expect(loadSave(storageWith('{ "v": 2 }'))).toEqual(defaultSave());
    expect(loadSave(storageWith('"a string"'))).toEqual(defaultSave());
  });

  it("loads a stored best and fills in every missing field", () => {
    const loaded = loadSave(storageWith('{ "v": 1, "best": { "descent": 40 } }'));
    expect(loaded.best.descent).toBe(40);
    expect(loaded.v).toBe(1);
    expect(loaded.settings).toEqual({});
    expect(loaded.gear).toEqual({});
    expect(loaded.totals).toEqual({});
    expect(loaded.feats).toEqual([]);
    expect(loaded.look).toBeNull();
    expect(loaded.seen).toEqual({});
  });

  it("drops numbers in best that are not finite and non-negative", () => {
    const loaded = loadSave(
      storageWith('{ "v": 1, "best": { "descent": "x", "sprint": -5, "zen": 12 } }'),
    );
    expect(loaded.best).toEqual({ zen: 12 });
    expect(loadSave(storageWith('{ "v": 1, "best": { "descent": null } }')).best).toEqual({});
    expect(
      loadSave(storageWith('{ "v": 1, "best": { "descent": Infinity } }')).best,
    ).toEqual({});
    expect(loadSave(storageWith('{ "v": 1, "best": 7 }')).best).toEqual({});
  });

  it("replaces wrongly typed top-level fields from the default", () => {
    const loaded = loadSave(
      storageWith(
        '{ "v": 1, "best": [], "settings": 5, "gear": "none", "totals": null, "feats": "dash", "look": 3, "seen": true }',
      ),
    );
    expect(loaded).toEqual(defaultSave());
  });

  it("keeps unknown extra fields a newer game may have written", () => {
    const loaded = loadSave(
      storageWith('{ "v": 1, "best": { "descent": 3 }, "trophy": "gold", "unlocked": [1, 2] }'),
    );
    expect(loaded.best).toEqual({ descent: 3 });
    expect((loaded as unknown as Record<string, unknown>).trophy).toBe("gold");
    expect((loaded as unknown as Record<string, unknown>).unlocked).toEqual([1, 2]);
  });

  it("never throws when getItem itself throws", () => {
    expect(loadSave(fakeStorage({}, { throwOnGet: true }))).toEqual(defaultSave());
  });
});

describe("writeSave", () => {
  it("round-trips: write then load gives the same data", () => {
    const data: SaveData = {
      ...defaultSave(),
      best: { descent: 42 },
      totals: { runs: 7 },
      feats: ["dash"],
      look: { Head: "cap" },
      seen: { intro: true },
    };
    const storage = fakeStorage();
    expect(writeSave(storage, data)).toBe(true);
    expect(loadSave(storage)).toEqual(data);
  });

  it("writes under the one save key", () => {
    const storage = fakeStorage();
    writeSave(storage, defaultSave());
    expect(Object.keys(storage.stored)).toEqual([SAVE_KEY]);
    expect(SAVE_KEY).toBe("manic-entanglement.save");
  });

  it("returns false without throwing when storage is null or setItem throws", () => {
    expect(writeSave(null, defaultSave())).toBe(false);
    const storage = fakeStorage({}, { throwOnSet: true });
    expect(writeSave(storage, defaultSave())).toBe(false);
  });
});

describe("resetProgress", () => {
  it("empties gear, bests, totals and feats and keeps settings, look and seen", () => {
    const save: SaveData = {
      v: 1,
      best: { descent: 90 },
      settings: { motion: "reduced" },
      gear: { gloves: 4, boots: 26 },
      totals: { runs: 5 },
      feats: ["dash"],
      look: { Body: "Blue" },
      seen: { howto: true },
    };
    const reset = resetProgress(save);
    expect(reset).not.toBe(save);
    expect(reset.best).toEqual({});
    expect(reset.gear).toEqual({});
    expect(reset.totals).toEqual({});
    expect(reset.feats).toEqual([]);
    expect(reset.settings).toEqual({ motion: "reduced" });
    expect(reset.look).toEqual({ Body: "Blue" });
    expect(reset.seen).toEqual({ howto: true });
    expect(reset.v).toBe(1);
    // The stored save itself is untouched.
    expect(save.best).toEqual({ descent: 90 });
    expect(save.gear).toEqual({ gloves: 4, boots: 26 });
  });

  it("keeps a scoreRule and any other field a newer version wrote", () => {
    const save = { ...defaultSave(), scoreRule: "zen", trophy: "gold" } as SaveData & {
      scoreRule: string;
      trophy: string;
    };
    const reset = resetProgress(save) as SaveData & { scoreRule: string; trophy: string };
    expect(reset.scoreRule).toBe("zen");
    expect(reset.trophy).toBe("gold");
  });

  it("on a fresh save gives the fresh save back", () => {
    expect(resetProgress(defaultSave())).toEqual(defaultSave());
  });

  it("survives a round trip: the wiped save loads back wiped", () => {
    const save: SaveData = {
      ...defaultSave(),
      best: { descent: 12 },
      gear: { speed: 21 },
      settings: { muted: true },
    };
    const storage = fakeStorage();
    expect(writeSave(storage, resetProgress(save))).toBe(true);
    const loaded = loadSave(storage);
    expect(loaded.gear).toEqual({});
    expect(loaded.best).toEqual({});
    expect(loaded.settings).toEqual({ muted: true });
  });
});

describe("the wardrobe's trait-seen markers", () => {
  it("treats an old save without any trait marker as already seen", () => {
    // A save written before the wardrobe kept "new" markers: no seen field
    // at all, and one with only the old messages, must both keep loading —
    // and what its feats already unlocked reads as seen, so an old save
    // never wakes up with "New" tags on traits earned long ago.
    const old = loadSave(storageWith('{ "v": 1, "best": { "descent": 12 }, "feats": ["first-exit"] }'));
    expect(old.seen).toEqual({ "trait:Body:Pink": true });
    expect(old.best.descent).toBe(12);
    expect(old.feats).toEqual(["first-exit"]);
    const messages = loadSave(storageWith('{ "v": 1, "seen": { "howto": true } }'));
    expect(messages.seen).toEqual({ howto: true });
    // A fresh save with no feats gains no markers from the seed.
    expect(loadSave(storageWith('{ "v": 1 }')).seen).toEqual({});
  });

  it("seeds every trait the stored feats unlock, and only those", () => {
    // Free traits (Body Green, Eye Regular, Head Hood and the like) are in
    // no UNLOCKS entry, so they never appear; every feat trait does.
    const loaded = loadSave(storageWith(
      '{ "v": 1, "feats": ["first-exit", "collector"] }',
    ));
    expect(loaded.seen).toEqual({
      "trait:Body:Pink": true,
      "trait:Back:Billhook": true,
      "trait:Head:Crown": true,
    });
  });

  it("leaves a marked save alone, so an unseen feat trait stays new", () => {
    // A save that already carries markers is exactly the current version's:
    // a feat trait missing from it was earned since the wardrobe last closed
    // and must still read as new, not be silently seeded as seen.
    const loaded = loadSave(storageWith(
      '{ "v": 1, "feats": ["first-exit", "depth-5"], "seen": { "howto": true, "trait:Body:Pink": true } }',
    ));
    expect(loaded.seen).toEqual({ howto: true, "trait:Body:Pink": true });
  });

  it("keeps trait markers through a write and a load", () => {
    const data: SaveData = {
      ...defaultSave(),
      seen: { howto: true, "trait:Head:Crown": true, "trait:Back:Wings": true },
    };
    const storage = fakeStorage();
    expect(writeSave(storage, data)).toBe(true);
    expect(loadSave(storage)).toEqual(data);
  });

  it("drops non-boolean entries and keeps the rest", () => {
    const loaded = loadSave(storageWith(
      '{ "v": 1, "seen": { "trait:Body:Gold": true, "bogus": "yes", "count": 3 } }',
    ));
    expect(loaded.seen).toEqual({ "trait:Body:Gold": true });
  });
});
