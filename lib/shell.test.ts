import { describe, expect, it } from "vitest";
import { eventMessage } from "@/lib/shell";

describe("eventMessage", () => {
  it("returns the pickup text", () => {
    expect(eventMessage({ type: "pickup", item: "energy", text: "+25 Energy", x: 1, y: 1 })).toBe("+25 Energy");
  });

  it("rounds the fight cost to two decimals", () => {
    expect(eventMessage({ type: "fight", cost: 90.1234, x: 0, y: 0 })).toBe("-90.12 Energy to Defeat");
    expect(eventMessage({ type: "fight", cost: 90, x: 0, y: 0 })).toBe("-90 Energy to Defeat");
  });

  it("floats nothing for the other events", () => {
    expect(eventMessage({ type: "start" })).toBeNull();
    expect(eventMessage({ type: "levelStart", level: 2, size: 7 })).toBeNull();
    expect(eventMessage({ type: "move", x: 1, y: 1, dx: 0, dy: -1 })).toBeNull();
    expect(eventMessage({ type: "blocked", dx: 1, dy: 0 })).toBeNull();
    expect(eventMessage({ type: "levelClear", level: 1 })).toBeNull();
    expect(eventMessage({ type: "dead", cause: "time", score: 3, level: 1 })).toBeNull();
  });
});
