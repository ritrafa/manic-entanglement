import { describe, expect, it } from "vitest";
import { defaultSave, loadSave, saveSave, upgradeSave, type SaveData } from "@/game/save";

describe("upgradeSave", () => {
  it("empties best and stamps scoreRule 2 when the rule is not 2", () => {
    const old: SaveData = { best: { descent: 9 }, totals: { scoreRule: 1 } };
    expect(upgradeSave(old)).toEqual({ best: null, totals: { scoreRule: 2 } });
    const untracked: SaveData = { best: { descent: 9 }, totals: {} };
    expect(upgradeSave(untracked)).toEqual({ best: null, totals: { scoreRule: 2 } });
  });

  it("keeps everything else and does nothing when the rule is already 2", () => {
    const current: SaveData = { best: { descent: 4 }, totals: { scoreRule: 2, kills: 12 } };
    expect(upgradeSave(current)).toBe(current);
    const old: SaveData = { best: { descent: 9 }, totals: { scoreRule: 1, moves: 500 } };
    expect(upgradeSave(old)).toEqual({ best: null, totals: { scoreRule: 2, moves: 500 } });
  });
});

describe("loadSave", () => {
  it("gives the default for missing or unusable text", () => {
    const fresh = { best: null, totals: { scoreRule: 2 } };
    expect(loadSave(null)).toEqual(fresh);
    expect(loadSave(undefined)).toEqual(fresh);
    expect(loadSave("")).toEqual(fresh);
    expect(loadSave("not json")).toEqual(fresh);
    expect(loadSave("42")).toEqual(fresh);
    expect(loadSave("null")).toEqual(fresh);
  });

  it("a stored save without scoreRule loads with an empty best and scoreRule 2", () => {
    const loaded = loadSave('{"best":{"descent":9},"totals":{"moves":400}}');
    expect(loaded.best).toBeNull();
    expect(loaded.totals.scoreRule).toBe(2);
    expect(loaded.totals.moves).toBe(400); // the rest of the totals survives
  });

  it("a save already on scoreRule 2 keeps its best", () => {
    const loaded = loadSave('{"best":{"descent":7},"totals":{"scoreRule":2}}');
    expect(loaded.best).toEqual({ descent: 7 });
    expect(loaded.totals.scoreRule).toBe(2);
  });

  it("drops a best that is not a usable descent", () => {
    expect(loadSave('{"best":{"descent":"deep"},"totals":{"scoreRule":2}}').best).toBeNull();
    expect(loadSave('{"best":{"descent":null},"totals":{"scoreRule":2}}').best).toBeNull();
    expect(loadSave('{"totals":{"scoreRule":2}}').best).toBeNull();
  });
});

describe("saveSave", () => {
  it("round-trips through loadSave", () => {
    const data: SaveData = { best: { descent: 6 }, totals: { scoreRule: 2, kills: 3 } };
    expect(loadSave(saveSave(data))).toEqual(data);
    expect(loadSave(saveSave(defaultSave()))).toEqual(defaultSave());
  });
});
