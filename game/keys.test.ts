import { describe, expect, it } from "vitest";
import { Action, DEFAULT_KEYS, actionFor, dirOf } from "@/game/keys";

const ACTIONS: Action[] = ["up", "down", "left", "right", "confirm", "mute", "pause"];

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
