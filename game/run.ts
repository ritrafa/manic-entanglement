// The whole run decided by one pure class: phases, moves, the energy clock, pickups,
// fights, level changes and score. No DOM, no audio, no clocks, no global randomness:
// every random choice comes from one seeded createRng, so a unit test can play a
// seeded run from start to death. Ported from lib/GameState.ts and lib/maze.ts.

import { Maze, type Dir } from "./maze";
import { forecastOf, rollWalk, type Forecast } from "./forecast";
import { createRng, type Rng } from "./rng";
import { spawnLevel, GEAR_TYPES } from "./spawn";
import { routeCells } from "./bot";
import { ENEMY_KINDS, type EnemyKind } from "./enemies";
import { levelPlan } from "./plan";
import { CONFIG } from "./config";
import { fightCost } from "./combat";
import { KILL_SCORE, PICKUP_SCORE, levelScore } from "./score";
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
    /** Which of the three kinds this is (game/enemies.ts). */
    kind: EnemyKind;
    /** Hit points for the cost formula: the kind's number at spawn. */
    hp: number;
    /** Power for the cost formula: the kind's number at spawn. */
    power: number;
}

/** What happened during one run, for the summary screen and later for feats. */
export interface Tally {
    /** Successful moves. */
    moves: number;
    /** Milliseconds spent in the "playing" phase (from tick). */
    ms: number;
    /** Enemies defeated. */
    kills: number;
    /** Pickups collected. */
    pickups: number;
    /** Moves blocked by a wall or the edge. */
    bumps: number;
    /** Deepest level reached, starting at 1. */
    depth: number;
    /** Levels cleared. */
    cleared: number;
    /** Total energy paid to enemies in fights. */
    lostToFights: number;
}

/** A fresh tally: nothing done yet, standing on level 1. */
function freshTally(): Tally {
    return { moves: 0, ms: 0, kills: 0, pickups: 0, bumps: 0, depth: 1, cleared: 0, lostToFights: 0 };
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
    /** What this run did, kept through death and reset by start(). */
    tally: Tally = freshTally();
    energy: number;
    stats: RunStats;
    maze: Maze;
    player: { x: number; y: number; facingLeft: boolean };
    exit: { x: number; y: number };
    items: RunItem[] = [];
    enemies: RunEnemy[] = [];
    /**
     * What the next successful move's shifts will do: the origin's walk and the net
     * wall changes. Rolled at each level start and after every successful move, so
     * it always matches what the next move does to the walls; a blocked move leaves
     * it unchanged.
     */
    forecast: Forecast = { walk: [], opens: [], closes: [] };

    private rng: Rng;
    /** The directions behind the current forecast, applied with maze.step on the next move. */
    private forecastDirs: Dir[] = [];
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
        this.tally = freshTally();
        this.energy = Math.max(CONFIG.startEnergy, this.stats.storage);
        this.buildLevel();
        this.rollForecast();
        this.phase = "playing";
        this.push({ type: "levelStart", level: this.level, size: this.maze.width });
    }

    /**
     * Walk away from a live run: "ready" again so `start()` can begin a fresh one,
     * with no "dead" event — quitting is not dying. The tally stays until the next
     * start, and nothing ticks in this phase.
     */
    abandon(): void {
        if (this.phase === "ready") return;
        this.phase = "ready";
        this.pendingMs = 0;
    }

    /** One cardinal step. False (and no change) unless playing; a wall or the edge only costs a "blocked" event. */
    move(dx: number, dy: number): boolean {
        if (this.phase !== "playing") return false;
        if (!this.maze.canMove(this.player.x, this.player.y, dx, dy)) {
            this.tally.bumps += 1;
            this.push({ type: "blocked", dx, dy });
            return false;
        }

        if (dx === -1) this.player.facingLeft = true;
        else if (dx === 1) this.player.facingLeft = false;

        this.player.x += dx;
        this.player.y += dy;
        this.energy -= 1 * this.stats.consumption;
        this.tally.moves += 1;
        this.push({ type: "move", x: this.player.x, y: this.player.y, dx, dy });

        // Apply exactly the walk the forecast promised; the next one is rolled at
        // the end, only when the run is still playing.
        for (const dir of this.forecastDirs) this.maze.step(dir);

        const itemIndex = this.items.findIndex((p) => p.x === this.player.x && p.y === this.player.y);
        if (itemIndex !== -1) {
            const item = this.items[itemIndex];
            const text = this.applyItem(item.type);
            this.items.splice(itemIndex, 1);
            this.score += PICKUP_SCORE;
            this.tally.pickups += 1;
            this.push({ type: "pickup", item: item.type, text, x: item.x, y: item.y });
        }

        let fought = false;
        const enemyIndex = this.enemies.findIndex((p) => p.x === this.player.x && p.y === this.player.y);
        if (enemyIndex !== -1) {
            const enemy = this.enemies[enemyIndex];
            const cost = this.tollOf(enemy);
            this.energy -= cost;
            this.enemies.splice(enemyIndex, 1);
            this.score += KILL_SCORE;
            this.tally.kills += 1;
            this.tally.lostToFights += cost;
            fought = true;
            this.push({ type: "fight", cost, kind: enemy.kind, x: enemy.x, y: enemy.y });
            // The heavy kinds pay out their gear at once, as ordinary pickups.
            for (let i = 0; i < ENEMY_KINDS[enemy.kind].drops; i++) {
                const type = this.rng.pick(GEAR_TYPES);
                const text = this.applyItem(type);
                this.score += PICKUP_SCORE;
                this.tally.pickups += 1;
                this.push({ type: "pickup", item: type, text, x: enemy.x, y: enemy.y });
            }
        }

        if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
            this.phase = "clear";
            const gained = levelScore({ level: this.level, energyLeft: this.energy });
            this.score += gained;
            this.tally.cleared += 1;
            this.tally.depth = Math.max(this.tally.depth, this.level + 1);
            this.push({ type: "levelClear", level: this.level, gained });
            return true;
        }

        if (this.energy <= 0) {
            this.die(fought ? "fight" : "move");
        }
        if (this.phase === "playing") this.rollForecast();
        return true;
    }

    /** Advance the energy clock. Only runs while playing: stopped in "ready", "clear" and "dead". */
    tick(ms: number): void {
        if (this.phase !== "playing") return;
        if (!(ms > 0)) return;
        this.tally.ms += ms;
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

    /** From "clear" to "playing" on the next level: energy carries over plus the plan's
     * exit bonus (capped at storage), and the level is rebuilt from `levelPlan`. */
    nextLevel(): void {
        if (this.phase !== "clear") return;
        this.energy = Math.min(this.stats.storage, this.energy + levelPlan(this.level).exitBonus);
        this.level += 1;
        this.tally.depth = Math.max(this.tally.depth, this.level);
        this.buildLevel();
        this.rollForecast();
        this.phase = "playing";
        this.push({ type: "levelStart", level: this.level, size: this.maze.width });
    }

    /**
     * The energy defeating the enemy standing on (x, y) would cost with the current
     * stats, or null when no enemy is on that cell. For cards that display the cost
     * before the fight (see game/combat.ts).
     */
    fightCostAt(x: number, y: number): number | null {
        const enemy = this.enemies.find((candidate) => candidate.x === x && candidate.y === y);
        return enemy === undefined ? null : this.tollOf(enemy);
    }

    /**
     * The energy defeating this enemy costs with the current stats (game/combat.ts).
     * The number the board shows above the enemy; it moves as stats and energy do.
     */
    tollOf(enemy: RunEnemy): number {
        return fightCost(this.stats, enemy);
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

    /** Build the maze, start, exit, pickups and enemies for the current level from its plan. */
    private buildLevel(): void {
        const plan = levelPlan(this.level);
        const size = plan.size;
        this.maze = new Maze(size, size, this.rng);
        this.player.x = Math.floor(size / 2);
        this.player.y = size - 1;
        this.exit = { x: Math.floor(size / 2), y: 0 };
        this.pendingMs = 0;
        // The route the level begins on: the heavy kinds are kept off it (game/spawn.ts).
        const route = routeCells(this.maze, { x: this.player.x, y: this.player.y }, this.exit) ?? [];
        const spawned = spawnLevel(
            this.rng,
            size,
            { items: plan.items, enemies: plan.enemies },
            plan.energyShare,
            { depth: this.level, route },
        );
        this.items = spawned.items.map((item) => ({ id: this.nextId++, ...item }));
        this.enemies = spawned.enemies.map((enemy) => ({
            id: this.nextId++,
            ...enemy,
            hp: ENEMY_KINDS[enemy.kind].hp,
            power: ENEMY_KINDS[enemy.kind].power,
        }));
    }

    /** Roll the walk for the next move and store it as `forecast` (with its directions). */
    private rollForecast(): void {
        this.forecastDirs = rollWalk(this.maze, this.rng, levelPlan(this.level).shifts);
        this.forecast = forecastOf(this.maze, this.forecastDirs);
    }
}
