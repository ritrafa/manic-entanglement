import { describe, expect, it } from "vitest";
import { SAVE_KEY, defaultSave, loadSave, writeSave } from "@/game/save";
import type { SaveData, StorageLike } from "@/game/save";

/** A plain object standing in for Web Storage, with the backing map exposed. */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = { ...initial };
  const storage = {
    store,
    getItem: (key: string): string | null => (key in store ? store[key] : null),
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
  };
  return storage as unknown as StorageLike & { store: Record<string, string> };
}

function throwingGetItem(): StorageLike {
  return {
    getItem: (): string => {
      throw new Error("storage blocked");
    },
    setItem: (): void => undefined,
  };
}

function throwingSetItem(): StorageLike {
  return {
    getItem: (): string | null => null,
    setItem: (): void => {
      throw new Error("quota exceeded");
    },
  };
}

describe("defaultSave", () => {
  it("returns a fresh object every call", () => {
    const a = defaultSave();
    const b = defaultSave();
    expect(a).not.toBe(b);
    expect(a.best).not.toBe(b.best);
    expect(a.feats).not.toBe(b.feats);
    a.best.descent = 99;
    a.feats.push("speedster");
    expect(b.best).toEqual({});
    expect(b.feats).toEqual([]);
  });

  it("has the v:1 shape with empty collections and a null look", () => {
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
});

describe("loadSave", () => {
  it("gives defaults for null storage or a missing key", () => {
    expect(loadSave(null)).toEqual(defaultSave());
    expect(loadSave(fakeStorage())).toEqual(defaultSave());
    expect(loadSave(fakeStorage({ other: "{}" }))).toEqual(defaultSave());
  });

  it("gives defaults for broken JSON, null, an array or a wrong version", () => {
    const broken = ["{not json", '"null"', "[]", '{ "v": 2 }', "42", '"a string"'];
    for (const text of broken) {
      expect(loadSave(fakeStorage({ [SAVE_KEY]: text }))).toEqual(defaultSave());
    }
  });

  it("fills every missing top-level field from defaults", () => {
    const storage = fakeStorage({ [SAVE_KEY]: '{ "v": 1, "best": { "descent": 40 } }' });
    const save = loadSave(storage);
    expect(save.best.descent).toBe(40);
    expect(save).toEqual({ ...defaultSave(), best: { descent: 40 } });
  });

  it("drops numbers in best that are not finite and non-negative", () => {
    const storage = fakeStorage({ [SAVE_KEY]: '{ "v": 1, "best": { "descent": "x", "sprint": -5, "zen": 12 } }' });
    const save = loadSave(storage);
    expect(save.best).toEqual({ zen: 12 });
  });

  it("replaces wrongly typed top-level fields from defaults", () => {
    const storage = fakeStorage({
      [SAVE_KEY]: '{ "v": 1, "best": 3, "settings": [], "gear": "none", "totals": 7, "feats": "fast", "look": 5, "seen": true }',
    });
    expect(loadSave(storage)).toEqual(defaultSave());
  });

  it("keeps unknown extra fields a newer version may have written", () => {
    const storage = fakeStorage({ [SAVE_KEY]: '{ "v": 1, "best": { "descent": 5 }, "pet": "iguana" }' });
    const save = loadSave(storage) as SaveData & { pet?: string };
    expect(save.pet).toBe("iguana");
    expect(save.best).toEqual({ descent: 5 });
  });

  it("returns defaults when getItem throws", () => {
    expect(loadSave(throwingGetItem())).toEqual(defaultSave());
  });
});

describe("writeSave", () => {
  it("round trips: write then load gives the same data", () => {
    const storage = fakeStorage();
    const data = defaultSave();
    data.best.descent = 1234;
    data.feats = ["survivor"];
    data.look = { Body: "Gold" };
    data.seen = { level1: true };
    expect(writeSave(storage, data)).toBe(true);
    expect(loadSave(storage)).toEqual(data);
  });

  it("writes under the single save key", () => {
    const storage = fakeStorage();
    writeSave(storage, defaultSave());
    expect(Object.keys(storage.store)).toEqual([SAVE_KEY]);
  });

  it("returns false for null storage or a throwing setItem", () => {
    expect(writeSave(null, defaultSave())).toBe(false);
    expect(writeSave(throwingSetItem(), defaultSave())).toBe(false);
  });
});
