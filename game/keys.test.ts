import { describe, expect, it } from "vitest";
import { Action, DEFAULT_KEYS, actionFor, dirOf } from "@/game/keys";

const ACTIONS: Action[] = ["up", "down", "left", "right", "confirm", "mute", "pause", "tool1", "tool2"];

describe("actionFor", () => {
  it("maps KeyW to up", () => {
    expect(actionFor({ code: "KeyW" })).toBe("up");
  });

  it("maps ArrowUp to up", () => {
    expect(actionFor({ code: "ArrowUp" })).toBe("up");
  });

  it("maps KeyA to left", () => {
    expect(actionFor({ code: "KeyA" })).toBe("left");
  });

  it("maps KeyS to down and KeyD to right", () => {
    expect(actionFor({ code: "KeyS" })).toBe("down");
    expect(actionFor({ code: "KeyD" })).toBe("right");
  });

  it("gives null for an unknown code", () => {
    expect(actionFor({ code: "KeyQ" })).toBeNull();
    expect(actionFor({ code: "" })).toBeNull();
  });

  it("gives null when Ctrl is held, so browser chords stay with the browser", () => {
    expect(actionFor({ code: "KeyW", ctrlKey: true })).toBeNull();
    expect(actionFor({ code: "KeyS", ctrlKey: true })).toBeNull();
    expect(actionFor({ code: "KeyD", ctrlKey: true })).toBeNull();
  });

  it("gives null when Alt or Meta is held", () => {
    expect(actionFor({ code: "ArrowUp", altKey: true })).toBeNull();
    expect(actionFor({ code: "Enter", metaKey: true })).toBeNull();
  });

  it("gives null for every code while typing in INPUT, TEXTAREA or SELECT", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      for (const codes of Object.values(DEFAULT_KEYS)) {
        for (const code of codes) {
          expect(actionFor({ code, targetTag: tag })).toBeNull();
        }
      }
    }
  });

  it("maps Space and Enter to confirm", () => {
    expect(actionFor({ code: "Space" })).toBe("confirm");
    expect(actionFor({ code: "Enter" })).toBe("confirm");
  });

  it("gives null for confirm while a BUTTON is focused, but keeps the directions", () => {
    expect(actionFor({ code: "Space", targetTag: "BUTTON" })).toBeNull();
    expect(actionFor({ code: "Enter", targetTag: "BUTTON" })).toBeNull();
    expect(actionFor({ code: "KeyW", targetTag: "BUTTON" })).toBe("up");
    expect(actionFor({ code: "ArrowUp", targetTag: "BUTTON" })).toBe("up");
  });

  it("maps KeyM to mute and Escape/KeyP to pause", () => {
    expect(actionFor({ code: "KeyM" })).toBe("mute");
    expect(actionFor({ code: "Escape" })).toBe("pause");
    expect(actionFor({ code: "KeyP" })).toBe("pause");
  });

  it("accepts a custom keys mapping in place of the defaults", () => {
    const keys: Record<Action, string[]> = {
      up: ["KeyI"],
      down: ["KeyK"],
      left: ["KeyJ"],
      right: ["KeyL"],
      confirm: ["KeyY"],
      mute: ["KeyN"],
      pause: ["KeyO"],
      tool1: ["Digit1"],
      tool2: ["Digit2"],
    };
    expect(actionFor({ code: "KeyI" }, keys)).toBe("up");
    expect(actionFor({ code: "KeyY" }, keys)).toBe("confirm");
    expect(actionFor({ code: "KeyO" }, keys)).toBe("pause");
    // The defaults no longer apply.
    expect(actionFor({ code: "KeyW" }, keys)).toBeNull();
    expect(actionFor({ code: "ArrowUp" }, keys)).toBeNull();
    expect(actionFor({ code: "Enter" }, keys)).toBeNull();
  });
});

describe("DEFAULT_KEYS", () => {
  it("gives every action at least one code", () => {
    for (const action of ACTIONS) {
      expect(DEFAULT_KEYS[action].length).toBeGreaterThan(0);
    }
  });

  it("lists no code for two actions", () => {
    const seen = new Set<string>();
    for (const action of ACTIONS) {
      for (const code of DEFAULT_KEYS[action]) {
        expect(seen.has(code)).toBe(false);
        seen.add(code);
      }
    }
  });
});

describe("dirOf", () => {
  it("gives the vector of each direction", () => {
    expect(dirOf("up")).toEqual({ dx: 0, dy: -1 });
    expect(dirOf("down")).toEqual({ dx: 0, dy: 1 });
    expect(dirOf("left")).toEqual({ dx: -1, dy: 0 });
    expect(dirOf("right")).toEqual({ dx: 1, dy: 0 });
  });

  it("gives null for the non-directional actions", () => {
    expect(dirOf("confirm")).toBeNull();
    expect(dirOf("mute")).toBeNull();
    expect(dirOf("pause")).toBeNull();
  });
});

import { createRng } from "@/game/rng";
import { ACTION_LABELS, keyLabel, rebind, sanitizeKeys, type KeyMap } from "@/game/keys";

/** A deep copy, so a test can prove rebind never touches the map it was given. */
function copyOf(keys: KeyMap): KeyMap {
    const copy = {} as KeyMap;
    for (const action of ACTIONS) copy[action] = [...keys[action]];
    return copy;
}

describe("rebind", () => {
  it("binding KeyI to up slot 1 replaces KeyW", () => {
    const map = rebind(DEFAULT_KEYS, "up", 1, "KeyI");
    expect(map.up).toEqual(["ArrowUp", "KeyI"]);
    expect(actionFor({ code: "KeyI" }, map)).toBe("up");
    expect(actionFor({ code: "KeyW" }, map)).toBeNull();
  });

  it("binding KeyA (left's) to up slot 1 swaps: left takes KeyW in that slot", () => {
    const map = rebind(DEFAULT_KEYS, "up", 1, "KeyA");
    expect(map.up).toEqual(["ArrowUp", "KeyA"]);
    expect(map.left).toEqual(["ArrowLeft", "KeyW"]);
    expect(actionFor({ code: "KeyA" }, map)).toBe("up");
    expect(actionFor({ code: "KeyW" }, map)).toBe("left");
  });

  it("binding to an empty slot gives the code away without a swap, when the owner keeps one", () => {
    // A map where up holds only one code (slot 1 empty) and right holds two.
    const base: KeyMap = { ...copyOf(DEFAULT_KEYS), up: ["ArrowUp"] };
    const map = rebind(base, "up", 1, "KeyD");
    expect(map.up).toEqual(["ArrowUp", "KeyD"]);
    // right simply lost KeyD and keeps its other code — nothing was swapped in.
    expect(map.right).toEqual(["ArrowRight"]);
    expect(actionFor({ code: "KeyD" }, map)).toBe("up");
  });

  it("refuses to empty an action through an empty slot", () => {
    // up's slot 1 is empty and left holds KeyA alone: taking KeyA would leave
    // left with nothing, so the map comes back unchanged.
    const base: KeyMap = { ...copyOf(DEFAULT_KEYS), up: ["ArrowUp"], left: ["KeyA"] };
    expect(rebind(base, "up", 1, "KeyA")).toBe(base);
  });

  it("Escape cannot be assigned to anything", () => {
    expect(rebind(DEFAULT_KEYS, "up", 0, "Escape")).toBe(DEFAULT_KEYS);
    expect(rebind(DEFAULT_KEYS, "mute", 1, "Escape")).toBe(DEFAULT_KEYS);
  });

  it("Escape cannot be removed from pause", () => {
    expect(rebind(DEFAULT_KEYS, "pause", 0, "KeyK")).toBe(DEFAULT_KEYS);
    // The other pause slot is still editable: Escape stays.
    const map = rebind(DEFAULT_KEYS, "pause", 1, "KeyK");
    expect(map.pause).toEqual(["Escape", "KeyK"]);
  });

  it("binding a code to the slot it already occupies changes nothing", () => {
    expect(rebind(DEFAULT_KEYS, "up", 0, "ArrowUp")).toBe(DEFAULT_KEYS);
    expect(rebind(DEFAULT_KEYS, "up", 1, "KeyW")).toBe(DEFAULT_KEYS);
  });

  it("never mutates the map it was given", () => {
    const before = copyOf(DEFAULT_KEYS);
    rebind(DEFAULT_KEYS, "up", 1, "KeyA");
    rebind(DEFAULT_KEYS, "pause", 1, "KeyK");
    rebind(DEFAULT_KEYS, "mute", 0, "KeyM");
    expect(DEFAULT_KEYS).toEqual(before);
  });

  it("returns a new map object, not the input", () => {
    const map = rebind(DEFAULT_KEYS, "up", 1, "KeyI");
    expect(map).not.toBe(DEFAULT_KEYS);
    expect(map.down).toEqual(DEFAULT_KEYS.down);
  });

  it("200 seeded random rebinds keep every invariant", () => {
    const rng = createRng(20240607);
    const codes = [
      "KeyI", "KeyJ", "KeyK", "KeyL", "KeyA", "KeyW", "KeyS", "KeyD", "KeyQ", "KeyZ",
      "KeyM", "KeyN", "KeyP", "KeyO", "Digit1", "Digit2", "Space", "Enter", "Escape",
      "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Slash",
    ];
    let map: KeyMap = copyOf(DEFAULT_KEYS);
    for (let step = 0; step < 200; step += 1) {
      const action = rng.pick(ACTIONS);
      const slot = rng.pick([0, 1] as const);
      const code = rng.pick(codes);
      map = rebind(map, action, slot, code);
      // No code belongs to two actions.
      const seen = new Set<string>();
      for (const action2 of ACTIONS) {
        for (const held of map[action2]) {
          expect(seen.has(held)).toBe(false);
          seen.add(held);
        }
      }
      // Every action has at least one code, pause still holds Escape, and no
      // action ever holds more than two.
      for (const action2 of ACTIONS) {
        expect(map[action2].length).toBeGreaterThanOrEqual(1);
        expect(map[action2].length).toBeLessThanOrEqual(2);
      }
      expect(map.pause).toContain("Escape");
    }
  });
});

describe("sanitizeKeys", () => {
  it("anything malformed gives the defaults whole", () => {
    for (const value of [null, undefined, "keys", 7, [], {}]) {
      expect(sanitizeKeys(value)).toEqual(DEFAULT_KEYS);
    }
    // A missing action.
    const missing = { ...copyOf(DEFAULT_KEYS) } as Partial<KeyMap>;
    delete missing.down;
    expect(sanitizeKeys(missing)).toEqual(DEFAULT_KEYS);
    // A non-string code.
    expect(sanitizeKeys({ ...copyOf(DEFAULT_KEYS), up: ["ArrowUp", 7] })).toEqual(DEFAULT_KEYS);
    // Three codes for one action.
    expect(sanitizeKeys({ ...copyOf(DEFAULT_KEYS), up: ["ArrowUp", "KeyW", "KeyI"] })).toEqual(DEFAULT_KEYS);
    // An empty action.
    expect(sanitizeKeys({ ...copyOf(DEFAULT_KEYS), mute: [] })).toEqual(DEFAULT_KEYS);
    // A code used twice.
    const duplicated = copyOf(DEFAULT_KEYS);
    duplicated.up = ["ArrowUp", "KeyA"];
    expect(sanitizeKeys(duplicated)).toEqual(DEFAULT_KEYS);
    // pause without Escape.
    expect(sanitizeKeys({ ...copyOf(DEFAULT_KEYS), pause: ["KeyP"] })).toEqual(DEFAULT_KEYS);
    // An unknown extra action smuggling codes in.
    expect(sanitizeKeys({ ...copyOf(DEFAULT_KEYS), roll: ["KeyR"] })).toEqual(DEFAULT_KEYS);
  });

  it("a valid custom map is returned as it is", () => {
    const custom: KeyMap = {
      up: ["KeyI"],
      down: ["KeyK"],
      left: ["KeyJ"],
      right: ["KeyL"],
      confirm: ["Enter"],
      mute: ["KeyN"],
      pause: ["Escape", "KeyO"],
      tool1: ["Digit1"],
      tool2: ["Digit3"],
    };
    expect(sanitizeKeys(custom)).toEqual(custom);
    // The copy is independent of the input.
    const map = sanitizeKeys(custom);
    expect(map).not.toBe(custom);
    expect(map.up).not.toBe(custom.up);
  });
});

describe("keyLabel", () => {
  it("reads letters, digits and the arrows as players expect", () => {
    expect(keyLabel("KeyQ")).toBe("Q");
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("Digit1")).toBe("1");
    expect(keyLabel("Digit9")).toBe("9");
    expect(keyLabel("ArrowUp")).toBe("Up arrow");
    expect(keyLabel("ArrowLeft")).toBe("Left arrow");
    expect(keyLabel("ArrowDown")).toBe("Down arrow");
    expect(keyLabel("ArrowRight")).toBe("Right arrow");
    expect(keyLabel("Space")).toBe("Space");
  });

  it("leaves anything else unchanged", () => {
    expect(keyLabel("Escape")).toBe("Escape");
    expect(keyLabel("Enter")).toBe("Enter");
    expect(keyLabel("Numpad5")).toBe("Numpad5");
    expect(keyLabel("")).toBe("");
  });
});

describe("ACTION_LABELS", () => {
  it("words every action", () => {
    for (const action of ACTIONS) {
      expect(typeof ACTION_LABELS[action]).toBe("string");
      expect(ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
    expect(ACTION_LABELS.up).toBe("Move up");
    expect(ACTION_LABELS.pause).toBe("Pause");
  });
});
