import { describe, expect, it } from "vitest";
import { FLOAT_LINE_PX, FLOAT_RISE_MS, FxLimiter, floatLineOffset, fxFor, lowEnergy, type FloatText, type Fx, type Motion } from "@/game/fx";
import type { GameEvent } from "@/game/events";

const EXIT = { x: 2, y: 0 };

function kinds(fxs: Fx[]): string[] {
    return fxs.map((fx) => fx.kind);
}

const BLOCKED: GameEvent = { type: "blocked", dx: -1, dy: 1 };
const PICKUP: GameEvent = { type: "pickup", item: "boots", text: "Boots!", x: 3, y: 4 };
const FIGHT: GameEvent = { type: "fight", cost: 15, kind: "wisp", x: 1, y: 2 };
const LEVEL_CLEAR: GameEvent = { type: "levelClear", level: 2, gained: 50 };
const LEVEL_START: GameEvent = { type: "levelStart", level: 2, size: 5, modifier: null };
const HURT: GameEvent = { type: "hurt", cost: 5, x: 2, y: 3 };
const DEAD: GameEvent = { type: "dead", cause: "time", score: 100, level: 2 , lost: 0 };

const ALL_EVENTS: GameEvent[] = [BLOCKED, PICKUP, FIGHT, HURT, LEVEL_CLEAR, LEVEL_START, DEAD];

describe("fxFor with full motion", () => {
    it("blocked bumps in the direction that was refused", () => {
        expect(fxFor(BLOCKED, { motion: "full", exit: EXIT })).toEqual([
            { kind: "bump", dx: -1, dy: 1 },
        ]);
    });

    it("pickup pops and throws a gold burst of 5 on its cell", () => {
        expect(fxFor(PICKUP, { motion: "full", exit: EXIT })).toEqual([
            { kind: "pop", x: 3, y: 4 },
            { kind: "burst", x: 3, y: 4, count: 5, tone: "gold" },
        ]);
    });

    it("fight bursts red 8, flashes red for 120 ms and shakes 4 px for 150 ms", () => {
        expect(fxFor(FIGHT, { motion: "full", exit: EXIT })).toEqual([
            { kind: "burst", x: 1, y: 2, count: 8, tone: "red" },
            { kind: "flash", tone: "red", ms: 120 },
            { kind: "shake", px: 4, ms: 150 },
        ]);
    });

    it("levelClear bursts teal 14 at the exit and zooms toward it for 300 ms", () => {
        expect(fxFor(LEVEL_CLEAR, { motion: "full", exit: EXIT })).toEqual([
            { kind: "burst", x: EXIT.x, y: EXIT.y, count: 14, tone: "teal" },
            { kind: "zoom", x: EXIT.x, y: EXIT.y, ms: 300 },
        ]);
    });

    it("levelStart fades for 200 ms", () => {
        expect(fxFor(LEVEL_START, { motion: "full", exit: EXIT })).toEqual([
            { kind: "fade", ms: 200 },
        ]);
    });

    it("dead flashes red for 400 ms and shakes 8 px for 300 ms", () => {
        expect(fxFor(DEAD, { motion: "full", exit: EXIT })).toEqual([
            { kind: "flash", tone: "red", ms: 400 },
            { kind: "shake", px: 8, ms: 300 },
        ]);
    });
});

describe("fxFor with reduced motion", () => {
    const FORBIDDEN = ["bump", "burst", "shake", "zoom"];

    for (const event of ALL_EVENTS) {
        it(`never bumps, bursts, shakes or zooms for ${event.type}`, () => {
            const got = kinds(fxFor(event, { motion: "reduced", exit: EXIT }));
            for (const kind of FORBIDDEN) expect(got).not.toContain(kind);
        });
    }

    it("keeps the pickup's pop and drops only its burst", () => {
        expect(fxFor(PICKUP, { motion: "reduced", exit: EXIT })).toEqual([
            { kind: "pop", x: 3, y: 4 },
        ]);
    });

    it("turns the fight's flash into a fade", () => {
        expect(fxFor(FIGHT, { motion: "reduced", exit: EXIT })).toEqual([
            { kind: "fade", ms: 120 },
        ]);
    });

    it("turns the death flash into a fade", () => {
        expect(fxFor(DEAD, { motion: "reduced", exit: EXIT })).toEqual([
            { kind: "fade", ms: 400 },
        ]);
    });

    it("keeps the level's opening fade", () => {
        expect(fxFor(LEVEL_START, { motion: "reduced", exit: EXIT })).toEqual([
            { kind: "fade", ms: 200 },
        ]);
    });
});

it("an unknown event returns []", () => {
    const surprise = { type: "surprise" } as unknown as GameEvent;
    expect(fxFor(surprise, { motion: "full" })).toEqual([]);
    expect(fxFor(surprise, { motion: "reduced" })).toEqual([]);
});

describe("FxLimiter", () => {
    it("lets three shakes in a second, refuses the fourth and allows again at 1001 ms", () => {
        const limiter = new FxLimiter();
        expect(limiter.allow("shake", 0)).toBe(true);
        expect(limiter.allow("shake", 100)).toBe(true);
        expect(limiter.allow("shake", 200)).toBe(true);
        expect(limiter.allow("shake", 300)).toBe(false);
        expect(limiter.allow("shake", 1001)).toBe(true);
    });

    it("counts flashes separately from shakes", () => {
        const limiter = new FxLimiter();
        expect(limiter.allow("shake", 0)).toBe(true);
        expect(limiter.allow("shake", 100)).toBe(true);
        expect(limiter.allow("shake", 200)).toBe(true);
        expect(limiter.allow("shake", 300)).toBe(false);
        // The refused shakes took no flash budget: three flashes still go through.
        expect(limiter.allow("flash", 0)).toBe(true);
        expect(limiter.allow("flash", 100)).toBe(true);
        expect(limiter.allow("flash", 200)).toBe(true);
        expect(limiter.allow("flash", 300)).toBe(false);
        expect(limiter.allow("flash", 1001)).toBe(true);
    });
});

describe("lowEnergy", () => {
    it("is true only under 0.25, and false for nonsense", () => {
        expect(lowEnergy(0.25)).toBe(false);
        expect(lowEnergy(0.249)).toBe(true);
        expect(lowEnergy(NaN)).toBe(false);
        expect(lowEnergy(0)).toBe(true);
        expect(lowEnergy(1)).toBe(false);
    });
});

describe("floatLineOffset", () => {
    const t = (x: number, y: number, startedAt: number): FloatText => ({ x, y, startedAt });

    it("starts at the cell when nothing is on the board", () => {
        expect(floatLineOffset([], 3, 4, 1000)).toBe(0);
    });

    it("starts one line under a text still rising on the same cell", () => {
        const active = [t(3, 4, 1000)];
        expect(floatLineOffset(active, 3, 4, 1100)).toBe(FLOAT_LINE_PX);
    });

    it("counts a neighbour cell (one away) as the same column", () => {
        expect(floatLineOffset([t(3, 4, 1000)], 4, 4, 1100)).toBe(FLOAT_LINE_PX);
        expect(floatLineOffset([t(3, 4, 1000)], 2, 3, 1100)).toBe(FLOAT_LINE_PX);
    });

    it("ignores a text two cells away on any axis", () => {
        expect(floatLineOffset([t(5, 4, 1000)], 3, 4, 1100)).toBe(0);
        expect(floatLineOffset([t(3, 6, 1000)], 3, 4, 1100)).toBe(0);
    });

    it("ignores a text whose rise is over (2500 ms and older)", () => {
        expect(floatLineOffset([t(3, 4, 0)], 3, 4, FLOAT_RISE_MS)).toBe(0);
        expect(floatLineOffset([t(3, 4, 0)], 3, 4, FLOAT_RISE_MS - 1)).toBe(FLOAT_LINE_PX);
    });

    it("ignores a text that starts in the future", () => {
        expect(floatLineOffset([t(3, 4, 2000)], 3, 4, 1000)).toBe(0);
    });

    it("stacks three texts on one cell as 0, 24 and 48", () => {
        const first = t(3, 4, 0);
        const second = t(3, 4, 10);
        expect(floatLineOffset([first], 3, 4, 10)).toBe(FLOAT_LINE_PX);
        expect(floatLineOffset([first, second], 3, 4, 20)).toBe(2 * FLOAT_LINE_PX);
    });

    it("puts the new text one line under the lowest nearby, not one per text", () => {
        // Two texts two cells apart share no line (both sit on line 0); the
        // new one, near both, must go one line under them, not two.
        const active = [t(0, 0, 0), t(2, 0, 10)];
        expect(floatLineOffset(active, 1, 0, 20)).toBe(FLOAT_LINE_PX);
    });

    it("replays the whole stack in start order, whatever order it arrives in", () => {
        const a = t(0, 0, 0); // line 0
        const b = t(1, 0, 10); // near a: line 1
        const c = t(0, 0, 20); // near a and b: line 2
        expect(floatLineOffset([c, b, a], 0, 0, 30)).toBe(3 * FLOAT_LINE_PX);
    });

    it("keeps two far-apart columns independent", () => {
        const far = t(9, 9, 0);
        const near = t(3, 4, 10);
        expect(floatLineOffset([far, near], 3, 4, 20)).toBe(FLOAT_LINE_PX);
        expect(floatLineOffset([far, near], 9, 9, 20)).toBe(FLOAT_LINE_PX);
    });

    it("answers 0 for nonsense instead of throwing", () => {
        expect(floatLineOffset([t(NaN, 4, 0)], 3, 4, 1000)).toBe(0);
        expect(floatLineOffset([t(3, 4, NaN)], 3, 4, 1000)).toBe(0);
        expect(floatLineOffset([t(3, 4, 0)], NaN, 4, 1000)).toBe(0);
        expect(floatLineOffset([t(3, 4, 0)], 3, 4, NaN)).toBe(0);
    });

    it("uses a whole number of 24 px lines", () => {
        expect(FLOAT_LINE_PX).toBe(24);
        const active = [t(3, 4, 0), t(3, 4, 10), t(3, 4, 20)];
        const offset = floatLineOffset(active, 3, 4, 30);
        expect(offset).toBe(3 * 24);
        expect(offset % FLOAT_LINE_PX).toBe(0);
    });
});

describe("effect caps", () => {
    const MOTIONS: Motion[] = ["full", "reduced"];

    for (const event of ALL_EVENTS) {
        for (const motion of MOTIONS) {
            it(`${event.type} with ${motion}: counts at most 20 and durations at most 500 ms`, () => {
                for (const fx of fxFor(event, { motion, exit: EXIT })) {
                    if (fx.kind === "burst") {
                        expect(fx.count).toBeLessThanOrEqual(20);
                        expect(fx.count).toBeGreaterThanOrEqual(0);
                    }
                    if ("ms" in fx) {
                        expect(fx.ms).toBeLessThanOrEqual(500);
                        expect(fx.ms).toBeGreaterThanOrEqual(0);
                    }
                }
            });
        }
    }
});

describe("fxFor for the Knot hurt", () => {
    const HURT: GameEvent = { type: "hurt", cost: 5, x: 2, y: 3 };

    it("bursts red 4 on its cell and flashes red for 80 ms", () => {
        expect(fxFor(HURT, { motion: "full", exit: EXIT })).toEqual([
            { kind: "burst", x: 2, y: 3, count: 4, tone: "red" },
            { kind: "flash", tone: "red", ms: 80 },
        ]);
    });

    it("turns the hurt flash into a fade under reduced motion", () => {
        expect(fxFor(HURT, { motion: "reduced", exit: EXIT })).toEqual([
            { kind: "fade", ms: 80 },
        ]);
    });
});
