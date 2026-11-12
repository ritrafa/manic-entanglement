// Seeded pseudo-random number generator (mulberry32): pure, no DOM, no clocks, no global randomness.
// The same seed always produces the same sequence.

export interface Rng {
    /** A float in [0, 1). */
    next(): number;
    /** An integer in [0, n). */
    int(n: number): number;
    /** One element of items, chosen uniformly. */
    pick<T>(items: readonly T[]): T;
    /** An independent generator continuing from the same state. */
    clone(): Rng;
}

function fromState(state: number): Rng {
    let s = state >>> 0;

    function next(): number {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function int(n: number): number {
        return Math.floor(next() * n);
    }

    function pick<T>(items: readonly T[]): T {
        return items[int(items.length)];
    }

    function clone(): Rng {
        return fromState(s);
    }

    return { next, int, pick, clone };
}

/** Create a generator for the given integer seed. Seed 0 works like any other. */
export function createRng(seed: number): Rng {
    return fromState(seed >>> 0);
}
