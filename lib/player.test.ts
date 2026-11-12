import { describe, expect, it } from "vitest";
import Player from "@/lib/player";

describe("Player", () => {
  it("starts with energy 100 and attack 1", () => {
    const player = new Player();
    expect(player.energy).toBe(100);
    expect(player.attack).toBe(1);
  });

  it("setPlayerDetails sets body and attack", () => {
    const player = new Player();
    player.setPlayerDetails([
      { key: "Body", value: "Blue" },
      { key: "Attack", value: "2" },
    ]);
    expect(player.body).toBe("Blue");
    expect(player.attack).toBe(2);
  });
});
