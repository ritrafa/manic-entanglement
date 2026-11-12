import { describe, expect, it } from "vitest";
import { eventMessage } from "@/lib/GameState";
import type { GameEvent } from "@/game/events";

describe("eventMessage", () => {
  it("returns the pickup text as-is", () => {
    const event: GameEvent = { type: "pickup", item: "energy", text: "+25 Energy", x: 1, y: 2 };
    expect(eventMessage(event)).toBe("+25 Energy");
  });

  it("formats the fight cost to two decimals", () => {
    expect(eventMessage({ type: "fight", cost: 90.126, x: 0, y: 0 })).toBe("-90.13 Energy to Defeat");
    expect(eventMessage({ type: "fight", cost: 90, x: 0, y: 0 })).toBe("-90 Energy to Defeat");
  });

  it("has no message for the other events", () => {
    expect(eventMessage({ type: "start" })).toBeNull();
    expect(eventMessage({ type: "levelStart", level: 1, size: 5 })).toBeNull();
    expect(eventMessage({ type: "move", x: 1, y: 1, dx: 1, dy: 0 })).toBeNull();
    expect(eventMessage({ type: "blocked", dx: 0, dy: -1 })).toBeNull();
    expect(eventMessage({ type: "levelClear", level: 2 })).toBeNull();
    expect(eventMessage({ type: "dead", cause: "time", score: 3, level: 1 })).toBeNull();
  });
});
