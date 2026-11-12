// The entanglements as pure data: which depths are entangled, what each twist
// does to a level plan, and which cells a Blackout level shows. No DOM, no
// clocks, no global randomness: every draw comes from a seeded createRng.

import { describe, expect, it } from "vitest";
import { createRng } from "@/game/rng";
import { levelPlan, type LevelPlan } from "@/game/plan";
import {
    applyModifier,
    modifierFor,
    MODIFIER_IDS,
    MODIFIER_INFO,
    visibleCells,
    type ModifierId,
} from "@/game/modifiers";

/** A plan of the given size with the plain curve's other numbers. */
function planOf(size: number): LevelPlan {
    return { ...levelPlan(1), size };
}

describe("modifierFor", () => {
    it("entangles only every third depth from 3", () => {
        for (const depth of [1, 2, 4, 5, 7, 8, 10, 11, 29]) {
            expect(modifierFor(depth, createRng(depth)), `depth ${depth}`).toBeNull();
        }
        for (const depth of [3, 6, 9, 30]) {
            expect(MODIFIER_IDS, `depth ${depth}`).toContain(modifierFor(depth, createRng(depth)));
        }
    });

    it("draws each of the three at depth 3 over 300 seeds", () => {
        const seen = new Set<ModifierId>();
        for (let seed = 0; seed < 300; seed++) {
            const id = modifierFor(3, createRng(seed));
            expect(id).not.toBeNull();
            seen.add(id as ModifierId);
        }
        expect([...seen].sort()).toEqual(["blackout", "hoard", "storm"]);
    });

    it("gives the same answer from the same rng state and costs the rng nothing on plain depths", () => {
        for (let seed = 0; seed < 40; seed++) {
            expect(modifierFor(3, createRng(seed))).toBe(modifierFor(3, createRng(seed)));
            // A plain depth must not consume the rng at all.
            const plain = createRng(seed);
            expect(modifierFor(4, plain)).toBeNull();
            expect(plain.next()).toBe(createRng(seed).next());
        }
    });

    it("is null for nonsense depths", () => {
        for (const depth of [NaN, Infinity, -1, 0]) {
            expect(modifierFor(depth, createRng(1))).toBeNull();
        }
    });
});

describe("MODIFIER_INFO", () => {
    it("names every twist with a line of at most 70 characters", () => {
        for (const id of MODIFIER_IDS) {
            const info = MODIFIER_INFO[id];
            expect(info.name.length).toBeGreaterThan(0);
            expect(info.line.length).toBeGreaterThan(0);
            expect(info.line.length).toBeLessThanOrEqual(70);
        }
    });
});

describe("applyModifier", () => {
    it("never mutates the plan it is given", () => {
        const plan = levelPlan(6);
        const frozen = JSON.parse(JSON.stringify(plan));
        for (const id of [...MODIFIER_IDS, null]) {
            applyModifier(plan, id);
        }
        expect(plan).toEqual(frozen);
    });

    it("returns the plan unchanged for a null id", () => {
        const plan = levelPlan(5);
        expect(applyModifier(plan, null)).toEqual(plan);
        expect(applyModifier(plan, null).vision).toBeUndefined();
    });

    it("storm doubles the shifts, caps them at 14, and pays the exit 25 more", () => {
        const calm = applyModifier(planOf(9), "storm");
        expect(calm.shifts).toBe(planOf(9).shifts * 2);
        expect(calm.exitBonus).toBe(planOf(9).exitBonus + 25);
        // 9 shifts doubled would be 18: the cap holds it at 14.
        expect(applyModifier({ ...planOf(13), shifts: 9 }, "storm").shifts).toBe(14);
    });

    it("hoard doubles both ends of the pickup range and adds two enemies", () => {
        const hoard = applyModifier({ ...planOf(9), items: [2, 5], enemies: 3 }, "hoard");
        expect(hoard.items).toEqual([4, 10]);
        expect(hoard.enemies).toBe(5);
        expect(hoard.shifts).toBe(planOf(9).shifts);
    });

    it("blackout leaves the plan as it is and only adds the vision radius", () => {
        const plan = levelPlan(3);
        const dark = applyModifier(plan, "blackout");
        expect(dark).toEqual({ ...plan, vision: 2 });
        expect(dark.vision).toBe(2);
    });
});

describe("visibleCells", () => {
    const base = {
        size: 9,
        player: { x: 4, y: 8 },
        knot: { x: 4, y: 4 },
        exit: { x: 4, y: 0 },
        walk: [] as { x: number; y: number }[],
        radius: 2,
    };

    it("shows the radius around the player by max(|dx|, |dy|) and nothing beyond", () => {
        const grid = visibleCells(base);
        expect(grid.length).toBe(9);
        grid.forEach((row) => expect(row.length).toBe(9));
        expect(grid[6][4]).toBe(true); // two cells up
        expect(grid[8][6]).toBe(true); // two cells right
        expect(grid[5][4]).toBe(false); // three cells up
        expect(grid[8][7]).toBe(false); // three cells right
    });

    it("keeps the Knot, the whole forecast walk and the exit visible wherever they sit", () => {
        const walk = [
            { x: 0, y: 0 },
            { x: 8, y: 8 },
            { x: 0, y: 8 },
        ];
        const grid = visibleCells({ ...base, walk });
        expect(grid[4][4]).toBe(true); // the Knot, far outside the radius
        expect(grid[0][0]).toBe(true); // the exit, far outside the radius
        expect(grid[0][0] && grid[8][8] && grid[8][0]).toBe(true); // every walk cell
    });

    it("marks nothing outside the board and gives a size by size grid", () => {
        const grid = visibleCells({ ...base, size: 5, player: { x: 0, y: 0 } });
        expect(grid.length).toBe(5);
        grid.forEach((row) => expect(row.length).toBe(5));
        expect(grid[0][0]).toBe(true);
        expect(grid[2][2]).toBe(true);
        expect(grid[3][3]).toBe(false);
    });
});
