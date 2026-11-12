import { describe, expect, it } from "vitest";
import { eventMessage } from "@/lib/shell";

describe("eventMessage", () => {
  it("returns the pickup text", () => {
    expect(eventMessage({ type: "pickup", item: "energy", text: "+25 Energy", x: 1, y: 1 })).toBe("+25 Energy");
  });

  it("floats the whole fight cost as -<cost> Energy", () => {
    expect(eventMessage({ type: "fight", cost: 15, kind: "wisp", x: 0, y: 0 })).toBe("-15 Energy");
    expect(eventMessage({ type: "fight", cost: 1, kind: "wisp", x: 0, y: 0 })).toBe("-1 Energy");
    expect(eventMessage({ type: "fight", cost: 999, kind: "wisp", x: 0, y: 0 })).toBe("-999 Energy");
  });

  it("floats nothing for the other events", () => {
    expect(eventMessage({ type: "start" })).toBeNull();
    expect(eventMessage({ type: "levelStart", level: 2, size: 7 })).toBeNull();
    expect(eventMessage({ type: "move", x: 1, y: 1, dx: 0, dy: -1 })).toBeNull();
    expect(eventMessage({ type: "blocked", dx: 1, dy: 0 })).toBeNull();
    expect(eventMessage({ type: "levelClear", level: 1, gained: 137 })).toBeNull();
    expect(eventMessage({ type: "dead", cause: "time", score: 3, level: 1 })).toBeNull();
  });
});
