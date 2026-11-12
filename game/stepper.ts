// The movement cadence: who is held down, and when the next step is due.
// Pure: the caller passes every instant, so tests invent their own times.
// No DOM, no Date, no performance here.

import { CONFIG } from "./config";

/** The four directions a step can take. */
export type Dir = "up" | "down" | "left" | "right";

/**
 * The keyboard's rhythm, independent of the operating system's key repeat.
 *
 * The shell reports `press`/`release` with the instant they happened and calls
 * `poll` on every frame; `poll` hands back the direction to step in, or null.
 * The rules:
 * - A press while idle makes the next `poll` return that direction, even if the
 *   key (or swipe) was already released: a tap is exactly one step.
 * - While a direction stays down it repeats: `firstRepeatMs` after the first
 *   step, then every `stepMs`.
 * - Two steps are never less than `stepMs` apart.
 * - Several keys held: the most recently pressed one runs; when it is released,
 *   the one still held takes over.
 * - A press arriving during the wait after a step is remembered in one slot (a
 *   newer press replaces it) and returned as soon as the wait allows, even if
 *   it has been released in the meantime.
 */
export class Stepper {
    /** The directions currently held down, oldest first; the last one wins. */
    private held: Dir[] = [];
    /** The one remembered press waiting for its step; a newer press replaces it. */
    private queued: { dir: Dir; dueAt: number } | null = null;
    /** The direction repeating while it stays down; null between runs. */
    private running: Dir | null = null;
    /** When the running direction's next automatic step may happen. */
    private nextDue: number | null = null;
    /** When the last step was handed out, so no two come closer than stepMs. */
    private lastStepAt: number | null = null;

    /** The key went down (or a swipe began) at `now`. */
    press(dir: Dir, now: number): void {
        this.held = this.held.filter((held) => held !== dir);
        this.held.push(dir);
        // A fresh run in this direction: its first step is due at once, but never
        // closer to the previous step than stepMs. The hold's own repeat pauses
        // while this step waits; it restarts from the step itself if the key stays down.
        this.queued = { dir, dueAt: this.notTooSoon(now) };
        this.running = null;
        this.nextDue = null;
    }

    /** The key came up. A step already promised to this direction is still owed. */
    release(dir: Dir): void {
        this.held = this.held.filter((held) => held !== dir);
        if (this.running !== dir) return;
        // The repeating run ends with the key; a key still held underneath takes over.
        this.running = null;
        this.nextDue = null;
        this.handOver();
    }

    /** Forget everything: held keys, the remembered press and the schedule. */
    clear(): void {
        this.held = [];
        this.queued = null;
        this.running = null;
        this.nextDue = null;
        this.lastStepAt = null;
    }

    /** The direction to step in now, or null when no step is due. */
    poll(now: number): Dir | null {
        if (this.queued !== null) {
            if (now < this.queued.dueAt) return null;
            return this.takeStep(this.queued.dir, now, true);
        }
        if (this.running !== null && this.nextDue !== null && now >= this.nextDue) {
            return this.takeStep(this.running, now, false);
        }
        return null;
    }

    /** Hand out one step and set up what follows it. */
    private takeStep(dir: Dir, now: number, isFirst: boolean): Dir {
        this.queued = null;
        this.lastStepAt = now;
        if (this.held.includes(dir)) {
            // Still down: keep the run going, firstRepeatMs to the second step, stepMs after.
            this.running = dir;
            this.nextDue = now + (isFirst ? CONFIG.firstRepeatMs : CONFIG.stepMs);
        } else {
            // Released before its step landed: the tap is spent, one step exactly.
            this.running = null;
            this.nextDue = null;
            this.handOver();
        }
        return dir;
    }

    /** Let the most recently pressed key still down start a run, if any. */
    private handOver(): void {
        if (this.queued !== null || this.running !== null) return;
        const next = this.held[this.held.length - 1];
        if (next === undefined) return;
        this.queued = { dir: next, dueAt: this.notTooSoon(this.lastStepAt === null ? 0 : this.lastStepAt + CONFIG.stepMs) };
    }

    /** The earliest a step may follow: never less than stepMs after the last one. */
    private notTooSoon(now: number): number {
        return this.lastStepAt === null ? now : Math.max(now, this.lastStepAt + CONFIG.stepMs);
    }
}
