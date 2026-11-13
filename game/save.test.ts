import { describe, expect, it } from "vitest";
import {
  MAX_PENDING_PROOFS,
  PENDING_PROOF_MAX_AGE_MS,
  SEEN_INIT,
  SAVE_KEY,
  addPendingProof,
  defaultSave,
  hasSeenMarkers,
  loadSave,
  proofIssuedAt,
  resetProgress,
  seedSeenOnce,
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
      pickedUp: [],
      pendingProofs: [],
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
    expect(loaded.pickedUp).toEqual([]);
    expect(loaded.seen).toEqual({});
  });

  it("loads an old save without pickedUp as an empty list", () => {
    const loaded = loadSave(storageWith('{ "v": 1, "feats": ["first-exit"] }'));
    expect(loaded.pickedUp).toEqual([]);
  });

  it("keeps a stored pickedUp list and drops malformed entries", () => {
    const loaded = loadSave(
      storageWith(
        '{ "v": 1, "pickedUp": [ { "layer": "Head", "trait": "Miner" }, { "layer": "Back", "trait": "Panel" }, { "layer": 7, "trait": "X" }, { "trait": "Chrome" }, "Miner", null ] }',
      ),
    );
    expect(loaded.pickedUp).toEqual([
      { layer: "Head", trait: "Miner" },
      { layer: "Back", trait: "Panel" },
    ]);
  });

  it("replaces a pickedUp that is not an array with the empty list", () => {
    expect(loadSave(storageWith('{ "v": 1, "pickedUp": "Miner" }')).pickedUp).toEqual([]);
    expect(loadSave(storageWith('{ "v": 1, "pickedUp": { "Head": "Miner" } }')).pickedUp).toEqual([]);
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
      pickedUp: [{ layer: "Head", trait: "Halo" }],
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
      pickedUp: [{ layer: "Head", trait: "Miner" }],
      pendingProofs: [],
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
    expect(reset.pickedUp).toEqual([{ layer: "Head", trait: "Miner" }]);
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
  it("loads the seen record exactly as stored, seeding nothing on read", () => {
    // loadSave is pure: a save written before the wardrobe kept "new"
    // markers comes back with no trait keys. The one-time seed is a separate
    // step (seedSeenOnce), applied and written at load, so a marker-less
    // save is not re-read as "everything seen" on every reload.
    const old = loadSave(storageWith('{ "v": 1, "best": { "descent": 12 }, "feats": ["first-exit"] }'));
    expect(old.seen).toEqual({});
    expect(old.best.descent).toBe(12);
    expect(old.feats).toEqual(["first-exit"]);
    expect(hasSeenMarkers(old)).toBe(false);
  });

  it("seeds an unmarked save once: its feats' traits and the init key", () => {
    const old = loadSave(storageWith('{ "v": 1, "feats": ["first-exit"] }'));
    const seeded = seedSeenOnce(old);
    expect(seeded).not.toBe(old);
    expect(seeded.seen).toEqual({ "trait:Body:Pink": true, [SEEN_INIT]: true });
    expect(hasSeenMarkers(seeded)).toBe(true);
    // A save with only the old messages keeps them and gains the init key.
    const messages = seedSeenOnce(loadSave(storageWith('{ "v": 1, "seen": { "howto": true } }')));
    expect(messages.seen).toEqual({ howto: true, [SEEN_INIT]: true });
    // A fresh save with no feats gains only the init key: the seed has run,
    // so the first feat earned later will still wear its "New" tags.
    expect(seedSeenOnce(loadSave(storageWith('{ "v": 1 }'))).seen).toEqual({ [SEEN_INIT]: true });
  });

  it("seeds every trait the stored feats unlock, and only those", () => {
    // Free traits (Body Green, Eye Regular, Head Hood and the like) are in
    // no UNLOCKS entry, so they never appear; every feat trait does.
    const seeded = seedSeenOnce(loadSave(storageWith(
      '{ "v": 1, "feats": ["first-exit", "collector"] }',
    )));
    expect(seeded.seen).toEqual({
      "trait:Body:Pink": true,
      "trait:Back:Billhook": true,
      "trait:Head:Crown": true,
      [SEEN_INIT]: true,
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
    expect(hasSeenMarkers(loaded)).toBe(true);
    expect(seedSeenOnce(loaded)).toBe(loaded);
  });

  it("seeds once for good: a feat earned after the seed stays new", () => {
    // The bug E49 fixes: a save that never stored a marker used to read as
    // everything seen on every reload, so a feat earned before the wardrobe
    // was first opened never showed "New". The seeded save is written at
    // load, so the seed is not redone: a feat earned later stays unseen.
    const storage = storageWith('{ "v": 1, "feats": ["first-exit"] }');
    const seeded = seedSeenOnce(loadSave(storage));
    expect(writeSave(storage, seeded)).toBe(true);
    // The player earns depth-5 (Eye One) without opening the wardrobe.
    const later = { ...seeded, feats: [...seeded.feats, "depth-5"] };
    expect(writeSave(storage, later)).toBe(true);
    const reloaded = loadSave(storage);
    expect(reloaded.seen).toEqual({ "trait:Body:Pink": true, [SEEN_INIT]: true });
    expect(seedSeenOnce(reloaded)).toBe(reloaded);
    expect(reloaded.seen["trait:Eye:One"]).toBeUndefined();
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
    // A trait key survived, so the save counts as marked and seeds nothing.
    expect(hasSeenMarkers(loaded)).toBe(true);
    expect(seedSeenOnce(loaded)).toBe(loaded);
  });
});

/** A proof text the save's pruning can read: base64url(json).base64url(mac).
 *  The signature is not checked here - that is lib/server/runToken.ts. */
function proofText(issuedAt: number): string {
  const body = Buffer.from(JSON.stringify({ issuedAt, mode: "descent" }), "utf8").toString("base64url");
  return `${body}.${"A".repeat(40)}`;
}

describe("pendingProofs (E70)", () => {
  it("a fresh save starts with an empty list", () => {
    expect(defaultSave().pendingProofs).toEqual([]);
  });

  it("an old save without the field loads with an empty list", () => {
    const loaded = loadSave(storageWith('{ "v": 1, "best": { "descent": 12 } }'));
    expect(loaded.pendingProofs).toEqual([]);
  });

  it("keeps only strings from a stored list", () => {
    const loaded = loadSave(storageWith('{ "v": 1, "pendingProofs": ["a.b", 5, null, "c.d"] }'));
    expect(loaded.pendingProofs).toEqual(["a.b", "c.d"]);
  });

  it("round-trips through storage", () => {
    const save = defaultSave();
    save.pendingProofs = [proofText(1000)];
    const storage = fakeStorage();
    expect(writeSave(storage, save)).toBe(true);
    expect(loadSave(storage).pendingProofs).toEqual([proofText(1000)]);
  });

  it("adds a proof at the end", () => {
    const save = defaultSave();
    const next = addPendingProof(save, proofText(1000), 2000);
    expect(next.pendingProofs).toEqual([proofText(1000)]);
    expect(save.pendingProofs).toEqual([]);
  });

  it("refuses a text that is not shaped like a proof", () => {
    const save = { ...defaultSave(), pendingProofs: [proofText(1000)] };
    for (const junk of ["", "no-dot", "a.b.c", "not-json.sig", "e30.x"]) {
      expect(addPendingProof(save, junk, 2000).pendingProofs).toEqual(save.pendingProofs);
    }
  });

  it("drops proofs older than thirty days", () => {
    const old = proofText(0);
    const fresh = proofText(20_000);
    const save = { ...defaultSave(), pendingProofs: [old, fresh] };
    const now = PENDING_PROOF_MAX_AGE_MS + 20_000; // the old one is past the line
    const next = addPendingProof(save, proofText(now), now);
    expect(next.pendingProofs).toEqual([fresh, proofText(now)]);
  });

  it("keeps the newest fifty", () => {
    const many = Array.from({ length: 60 }, (_, i) => proofText(i));
    const save = { ...defaultSave(), pendingProofs: many };
    const next = addPendingProof(save, proofText(100), 200);
    expect(next.pendingProofs).toHaveLength(MAX_PENDING_PROOFS);
    expect(next.pendingProofs[0]).toBe(proofText(11));
    expect(next.pendingProofs[MAX_PENDING_PROOFS - 1]).toBe(proofText(100));
  });

  it("reads the issuedAt out of a proof, and null out of anything else", () => {
    expect(proofIssuedAt(proofText(12345))).toBe(12345);
    expect(proofIssuedAt("junk")).toBeNull();
    expect(proofIssuedAt("e30.x")).toBeNull(); // {} carries no issuedAt
    expect(proofIssuedAt(null)).toBeNull();
  });
});
