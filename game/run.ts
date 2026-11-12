// The whole run decided by one pure class: phases, moves, the energy clock, pickups,
// fights, level changes and score. No DOM, no audio, no clocks, no global randomness:
// every random choice comes from one seeded createRng, so a unit test can play a
// seeded run from start to death. Ported from lib/GameState.ts and lib/maze.ts.

import { Maze } from "./maze";
import { createRng, type Rng } from "./rng";
import { CONFIG } from "./config";
import { spawnLevel } from "./spawn";
import type { DeathCause, GameEvent, ItemType } from "./events";

export type RunPhase = "ready" | "playing" | "clear" | "dead";

export interface RunStats {
    attack: number;
    defense: number;
    speed: number;
    consumption: number;
    storage: number;
}

export interface RunItem {
    id: number;
    x: number;
    y: number;
    type: ItemType;
}

export interface RunEnemy {
    id: number;
    x: number;
    y: number;
}

export interface RunOptions {
    seed: number;
    stats?: Partial<RunStats>;
}

const DEFAULT_STATS: RunStats = { attack: 1, defense: 1, speed: 1, consumption: 1, storage: 100 };

export class Run {
    phase: RunPhase = "ready";
    level = 1;
    score = 0;
    energy: number;
    stats: RunStats;
    maze: Maze;
    player: { x: number; y: number; facingLeft: boolean };
    exit: { x: number; y: number };
    items: RunItem[] = [];
    enemies: RunEnemy[] = [];

    private rng: Rng;
    private events: GameEvent[] = [];
    private nextId = 1;
    private pendingMs = 0;

    constructor({ seed, stats }: RunOptions) {
        this.rng = createRng(seed);
        this.stats = { ...DEFAULT_STATS, ...stats };
        this.energy = Math.max(CONFIG.startEnergy, this.stats.storage);
        this.maze = new Maze(CONFIG.startSize, CONFIG.startSize, this.rng);
        this.player = { x: Math.floor(CONFIG.startSize / 2), y: CONFIG.startSize - 1, facingLeft: false };
        this.exit = { x: Math.floor(CONFIG.startSize / 2), y: 0 };
        this.buildLevel();
    }

    /** Start (or restart) at level 1 with score 0; the stats gained are kept. */
    start(): void {
        if (this.phase !== "ready" && this.phase !== "dead") return;
        this.push({ type: "start" });
        this.level = 1;
        this.score = 0;
        this.buildLevel();
        this.phase = "playing";
        this.push({ type: "levelStart", level: this.level, size: this.maze.width });
    }

    /** One cardinal step. False (and no change) unless playing; a wall or the edge only costs a "blocked" event. */
    move(dx: number, dy: number): boolean {
        if (this.phase !== "playing") return false;
        if (!this.maze.canMove(this.player.x, this.player.y, dx, dy)) {
            this.push({ type: "blocked", dx, dy });
            return false;
        }

        if (dx === -1) this.player.facingLeft = true;
        else if (dx === 1) this.player.facingLeft = false;

        this.player.x += dx;
        this.player.y += dy;
        this.energy -= 1 * this.stats.consumption;
        this.score += 1;
        this.push({ type: "move", x: this.player.x, y: this.player.y, dx, dy });

        for (let i = 0; i < CONFIG.shiftsPerMove; i++) this.maze.shift(this.rng);

        const itemIndex = this.items.findIndex((p) => p.x === this.player.x && p.y === this.player.y);
        if (itemIndex !== -1) {
            const item = this.items[itemIndex];
            const text = this.applyItem(item.type);
            this.items.splice(itemIndex, 1);
            this.push({ type: "pickup", item: item.type, text, x: item.x, y: item.y });
        }

        let fought = false;
        const enemyIndex = this.enemies.findIndex((p) => p.x === this.player.x && p.y === this.player.y);
        if (enemyIndex !== -1) {
            const enemy = this.enemies[enemyIndex];
            const cost = (CONFIG.enemy.hp / this.stats.attack) * (CONFIG.enemy.power - this.stats.defense);
            this.energy -= cost;
            this.enemies.splice(enemyIndex, 1);
            fought = true;
            this.push({ type: "fight", cost, x: enemy.x, y: enemy.y });
        }

        if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
            this.phase = "clear";
            this.push({ type: "levelClear", level: this.level });
            return true;
        }

        if (this.energy <= 0) {
            this.die(fought ? "fight" : "move");
        }
        return true;
    }

    /** Advance the energy clock. Only runs while playing: stopped in "ready", "clear" and "dead". */
    tick(ms: number): void {
        if (this.phase !== "playing") return;
        if (!(ms > 0)) return;
        this.pendingMs += ms;
        while (this.pendingMs >= CONFIG.drainMs * this.stats.speed) {
            // The current speed is used, so a "speed" pickup takes effect at once.
            this.pendingMs -= CONFIG.drainMs * this.stats.speed;
            this.energy -= 1;
            if (this.energy <= 0) {
                this.die("time");
                return;
            }
        }
    }

    /** From "clear" to "playing" on the next level: size +2, energy refilled, fresh placements. */
    nextLevel(): void {
        if (this.phase !== "clear") return;
        this.level += 1;
        this.buildLevel();
        this.phase = "playing";
        this.push({ type: "levelStart", level: this.level, size: this.maze.width });
    }

    /** The events since the last call, oldest first; the internal list is emptied. */
    takeEvents(): GameEvent[] {
        const events = this.events;
        this.events = [];
        return events;
    }

    // --- internals -------------------------------------------------------

    private push(event: GameEvent): void {
        this.events.push(event);
    }

    private die(cause: DeathCause): void {
        this.phase = "dead";
        this.pendingMs = 0;
        this.push({ type: "dead", cause, score: this.score, level: this.level });
    }

    private applyItem(type: ItemType): string {
        switch (type) {
            case "energy":
                this.energy = Math.min(this.stats.storage, this.energy + CONFIG.pickups.energy);
                return "+25 Energy";
            case "boots":
                this.stats.consumption *= CONFIG.pickups.boots;
                return "-1% Energy Use";
            case "gloves":
                this.stats.attack += CONFIG.pickups.gloves;
                return "+0.1 Attack";
            case "shield":
                this.stats.defense += CONFIG.pickups.shield;
                return "+0.1 Defense";
            case "speed":
                this.stats.speed *= CONFIG.pickups.speed;
                return "+1% Speed";
            case "backpack":
                this.stats.storage += CONFIG.pickups.backpack;
                this.energy += CONFIG.pickups.backpack;
                return "+5 Energy Storage";
        }
    }

    /** Build the maze, start, exit, pickups and enemies for the current level, and refill energy. */
    private buildLevel(): void {
        const size = CONFIG.startSize + (this.level - 1) * CONFIG.sizeStep;
        this.maze = new Maze(size, size, this.rng);
        this.player.x = Math.floor(size / 2);
        this.player.y = size - 1;
        this.exit = { x: Math.floor(size / 2), y: 0 };
        this.energy = Math.max(CONFIG.startEnergy, this.stats.storage);
        this.pendingMs = 0;
        const placed = spawnLevel(this.rng, size, {
            items: CONFIG.pickupCount,
            enemies: CONFIG.enemyCount,
        });
        this.items = placed.items.map((item) => ({ id: this.nextId++, ...item }));
        this.enemies = placed.enemies.map((enemy) => ({ id: this.nextId++, ...enemy }));
    }
}
