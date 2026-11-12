// The whole run decided by one pure class: phases, moves, the energy clock, pickups,
// fights, level changes and score. No DOM, no audio, no clocks, no global randomness:
// every random choice comes from one seeded createRng, so a unit test can play a
// seeded run from start to death. Ported from lib/GameState.ts and lib/maze.ts.

import { Maze, DIR_DELTAS, type Dir } from "./maze";
import { forecastOf, rollWalk, type Forecast } from "./forecast";
import { createRng, type Rng } from "./rng";
import { spawnLevel, GEAR_TYPES } from "./spawn";
import { routeCells } from "./bot";
import { ENEMY_KINDS, type EnemyKind } from "./enemies";
import { levelPlan } from "./plan";
import { CONFIG, GEAR_RULES } from "./config";
import { fightCost } from "./combat";
import { KILL_SCORE, PICKUP_SCORE, levelScore } from "./score";
import type { DeathCause, GameEvent, ItemType, PickupType } from "./events";
import { TOOL_INFO, TOOL_IDS, isToolType, type ToolId } from "./tools";
import { MODES, type ModeRules } from "./modes";
import {
    addGear,
    countGear,
    gearCap,
    GEAR_NAMES,
    noGear,
    sanitizeGear,
    statsFromGear,
    type GearId,
    type GearLevels,
    type Stats,
} from "./gear";

export type RunPhase = "ready" | "playing" | "clear" | "dead" | "done";

/** The five numbers of a run, all derived from gear levels (game/gear.ts). */
export type RunStats = Stats;

export interface RunItem {
    id: number;
    x: number;
    y: number;
    /** One of the six gear pickups, or a tool pickup (game/tools.ts). */
    type: PickupType;
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
    /**
     * A stalker's hint (game/enemies.ts, game/run.ts): the cell it would step to
     * next, the first step of the shortest route to the player through the maze as
     * it stood after the last player move. Null when there is no route, and always
     * a neighbour of the stalker otherwise. The shift before the actual step may
     * still change the route, so it is a hint, not a promise. Always null for the
     * other kinds.
     */
    intent: { x: number; y: number } | null;
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
    /** The banked gear levels the run starts with (game/gear.ts); anything invalid reads as 0. */
    gear?: GearLevels;
    /** Which of the four ways to play (game/modes.ts); Descent when left out. */
    mode?: ModeRules;
    /**
     * Overrides the plan's shifts per move (game/plan.ts) for the whole run;
     * 0 keeps the maze still. Tests use it to watch the stalkers without the
     * shift; leaving it out takes each level's planned number.
     */
    shiftsOverride?: number;
}

export class Run {
    phase: RunPhase = "ready";
    level = 1;
    score = 0;
    /** What this run did, kept through death and reset by start(). */
    tally: Tally = freshTally();
    energy: number;
    /**
     * Gear kept for good: raised at every exit (game/gear.ts), kept through
     * death and start(), written to the save by the shell on each "banked" event.
     */
    banked: GearLevels;
    /**
     * Gear picked up since the last exit: raised by gear pickups, banked on
     * "levelClear" and emptied on death.
     */
    carried: GearLevels;
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
    /**
     * Charges carried per tool (game/tools.ts): 0 at start(), kept from level to
     * level, at most CONFIG.toolMax of each — a pickup beyond the cap is still
     * removed and scores, but adds nothing.
     */
    tools: Record<ToolId, number> = { anchor: 0, twist: 0, cut: 0 };
    /**
     * Successful moves the Anchor still freezes the maze for, 0 when nothing is
     * anchored. While it is above 0 the forecast stays empty and no shift is applied.
     */
    anchored = 0;

    private mode: ModeRules;
    private rng: Rng;
    /** The directions behind the current forecast, applied with maze.step on the next move. */
    private forecastDirs: Dir[] = [];
    private events: GameEvent[] = [];
    private nextId = 1;
    private pendingMs = 0;
    /** Successful moves since this level started; a stalker steps every CONFIG.stalkerEvery of them. */
    private movesOnLevel = 0;
    /** The RunOptions.shiftsOverride in force, or null when the plan decides the shifts. */
    private shiftsOverride: number | null;

    constructor(options: RunOptions) {
        const { seed, gear, mode = MODES.descent } = options;
        this.mode = mode;
        this.rng = createRng(seed);
        this.shiftsOverride = Number.isFinite(options.shiftsOverride ?? Number.NaN)
            ? Math.max(0, Math.floor(options.shiftsOverride as number))
            : null;
        // A no-gear mode keeps the bank out of the run entirely: base stats for
        // the whole run, and gear pickups give energy instead (applyItem).
        this.banked = mode.gear ? sanitizeGear(gear) : noGear();
        this.carried = noGear();
        this.energy = Math.max(CONFIG.startEnergy, this.stats.storage);
        this.maze = new Maze(CONFIG.startSize, CONFIG.startSize, this.rng);
        this.player = { x: Math.floor(CONFIG.startSize / 2), y: CONFIG.startSize - 1, facingLeft: false };
        this.exit = { x: Math.floor(CONFIG.startSize / 2), y: 0 };
        this.buildLevel();
    }

    /**
     * The run's five numbers, always exactly what the gear says: banked plus
     * carried levels through statsFromGear (game/gear.ts). Nothing else moves
     * them, so a pickup takes effect the moment it lands in `carried`.
     */
    get stats(): RunStats {
        if (!this.mode.gear) return statsFromGear(noGear());
        return statsFromGear(addGear(this.banked, this.carried));
    }

    /** Start (or restart) at level 1 with score 0; the banked gear is kept. */
    start(): void {
        if (this.phase !== "ready" && this.phase !== "dead" && this.phase !== "done") return;
        this.push({ type: "start" });
        this.carried = noGear();
        this.level = 1;
        this.score = 0;
        this.tally = freshTally();
        this.tools = { anchor: 0, twist: 0, cut: 0 };
        this.anchored = 0;
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
        // Nothing was kept by an exit: what was carried goes with the run.
        this.carried = noGear();
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
        this.energy -= this.stats.consumption * this.mode.stepFactor;
        this.tally.moves += 1;
        this.push({ type: "move", x: this.player.x, y: this.player.y, dx, dy });

        // Apply exactly the walk the forecast promised; the next one is rolled at
        // the end, only when the run is still playing.
        for (const dir of this.forecastDirs) this.maze.step(dir);

        const itemIndex = this.items.findIndex((p) => p.x === this.player.x && p.y === this.player.y);
        if (itemIndex !== -1) {
            const item = this.items[itemIndex];
            const text = isToolType(item.type) ? this.applyToolPickup(item.type) : this.applyItem(item.type);
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
            const gained = levelScore({ level: this.level, energyLeft: this.energy });
            this.score += gained;
            this.tally.cleared += 1;
            this.tally.depth = Math.max(this.tally.depth, this.level + 1);
            this.push({ type: "levelClear", level: this.level, gained });
            // The exit keeps what the level carried: it joins the bank for good.
            // A no-gear mode banks nothing: there was never anything to keep.
            const count = this.mode.gear ? countGear(this.carried) : 0;
            if (count > 0) {
                this.banked = addGear(this.banked, this.carried);
                this.push({ type: "banked", count });
            }
            // The carry is spent either way: kept by the bank, or gone with the level.
            this.carried = noGear();
            // The last level of a limited mode ends the run where the exit is:
            // "done" ticks nothing and takes no move; one "finished" event tells
            // the tally's time and there is no next level.
            if (this.mode.levels !== null && this.level >= this.mode.levels) {
                this.phase = "done";
                this.pendingMs = 0;
                this.push({ type: "finished", ms: this.tally.ms });
            } else {
                this.phase = "clear";
            }
            return true;
        }

        if (this.energy <= 0) {
            this.die(fought ? "fight" : "move");
        }
        if (this.phase === "playing") {
            // Stalkers (game/enemies.ts): the pickups, fights and the maze shift
            // of this move are done, so every CONFIG.stalkerEvery-th successful
            // move of the level lets each stalker step once toward the player.
            // Their intent is a hint recomputed from the maze as it is now, after
            // every successful move; the Anchor does not stop them.
            this.movesOnLevel += 1;
            if (this.movesOnLevel % CONFIG.stalkerEvery === 0) this.stepStalkers();
            this.refreshIntents();
        }
        if (this.phase === "playing") {
            // A successful move spends one anchored move; when the last one is
            // spent, the walk for the next move is rolled again.
            if (this.anchored > 0) this.anchored -= 1;
            this.rollForecast();
        }
        return true;
    }

    /** Advance the energy clock. Only runs while playing: stopped in "ready", "clear" and "dead".
     * A mode without a clock still counts the time into the tally but never drains. */
    tick(ms: number): void {
        if (this.phase !== "playing") return;
        if (!(ms > 0)) return;
        this.tally.ms += ms;
        if (!this.mode.clock) return;
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

    /**
     * Use one charge of a tool (game/tools.ts), true when it took effect. Only
     * while playing and only with a charge to spend; every tool is refused
     * while an Anchor still holds, so a refused use costs nothing and emits
     * nothing. A successful use emits a "tool" event: the Anchor freezes the
     * maze for the next CONFIG.anchorMoves successful moves, the Twist rolls a
     * fresh walk for the next move, and the Cut — which needs a direction —
     * calls the Knot through the wall on that side of the player: the maze is
     * re-rooted at the player's cell (no wall changes), the origin steps to the
     * neighbour (that wall opens, the neighbour's former link closes), and a
     * fresh walk is rolled from the Knot's new position. The player does not
     * move and no energy is spent; the next move can go through the opening.
     * A Cut without a direction, or toward the edge, or through a wall that is
     * already open, is refused like any other.
     */
    useTool(id: ToolId, dir?: Dir): boolean {
        if (this.phase !== "playing") return false;
        if (!TOOL_IDS.includes(id)) return false;
        if (this.tools[id] <= 0) return false;
        if (this.anchored > 0) return false;
        if (id === "cut") {
            if (dir === undefined || !(dir in DIR_DELTAS)) return false;
            const delta = DIR_DELTAS[dir];
            const nx = this.player.x + delta.x;
            const ny = this.player.y + delta.y;
            if (nx < 0 || nx >= this.maze.width || ny < 0 || ny >= this.maze.height) return false;
            if (this.maze.canMove(this.player.x, this.player.y, delta.x, delta.y)) return false;
            this.tools[id] -= 1;
            this.maze.reroot(this.player.x, this.player.y);
            this.maze.step(dir);
            this.rollForecast();
            this.push({ type: "tool", id, dx: delta.x, dy: delta.y });
            return true;
        }
        this.tools[id] -= 1;
        this.push({ type: "tool", id });
        if (id === "anchor") this.anchored = CONFIG.anchorMoves;
        this.rollForecast();
        return true;
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
        // Dying before the exit loses everything carried since the last one.
        const lost = countGear(this.carried);
        this.carried = noGear();
        this.push({ type: "dead", cause, score: this.score, level: this.level, lost });
    }

    private applyItem(type: ItemType): string {
        if (type === "energy") {
            this.energy = Math.min(this.stats.storage, this.energy + CONFIG.pickups.energy);
            return "+25 Energy";
        }
        // Without gear the whole run (game/modes.ts): a gear pickup is only a
        // small energy top-up, its text says so, and nothing is ever banked.
        if (!this.mode.gear) {
            this.energy = Math.min(this.stats.storage, this.energy + GEAR_RULES.maxedEnergy);
            return `+${GEAR_RULES.maxedEnergy} Energy`;
        }
        // A gear pickup raises its carried level by one, until banked plus
        // carried stands at the cap; one past it gives energy instead.
        const id: GearId = type;
        if (this.banked[id] + this.carried[id] >= gearCap(id)) {
            this.energy = Math.min(this.stats.storage, this.energy + GEAR_RULES.maxedEnergy);
            return `${GEAR_NAMES[id]} maxed +${GEAR_RULES.maxedEnergy} Energy`;
        }
        this.carried = { ...this.carried, [id]: this.carried[id] + 1 };
        switch (id) {
            case "boots":
                return `-${Math.round((1 - GEAR_RULES.bootsFactor) * 100)}% Energy Use`;
            case "gloves":
                return `+${GEAR_RULES.attackStep} Attack`;
            case "shield":
                return `+${GEAR_RULES.defenseStep} Defense`;
            case "speed":
                return `+${Math.round((GEAR_RULES.speedFactor - 1) * 100)}% Speed`;
            case "backpack":
                this.energy += GEAR_RULES.backpackEnergy;
                return `+${GEAR_RULES.storageStep} Energy Storage`;
        }
    }

    /** Take a tool pickup: one charge, never above the cap; the text floats as it goes. */
    private applyToolPickup(id: ToolId): string {
        this.tools[id] = Math.min(CONFIG.toolMax, this.tools[id] + 1);
        return `+1 ${TOOL_INFO[id].name}`;
    }

    /**
     * One step for every stalker of the level, in list order: the first step of
     * the shortest route to the player through the maze as it is at this moment.
     * A stalker whose first step is the exit or another enemy's cell waits, and so
     * does one with no route. A step onto the player's cell fights at once, as if
     * the player had stepped onto the stalker.
     */
    private stepStalkers(): void {
        for (const enemy of [...this.enemies]) {
            if (this.phase !== "playing") return;
            if (enemy.kind !== "stalker") continue;
            const path = routeCells(
                this.maze,
                { x: enemy.x, y: enemy.y },
                { x: this.player.x, y: this.player.y },
            );
            if (path === null || path.length < 2) continue; // no route: it waits
            const next = path[1];
            if (next.x === this.exit.x && next.y === this.exit.y) continue; // the exit stays free
            if (this.enemies.some((other) => other !== enemy && other.x === next.x && other.y === next.y)) {
                continue; // another enemy holds the cell: it waits
            }
            enemy.x = next.x;
            enemy.y = next.y;
            this.push({ type: "stalker", id: enemy.id, x: enemy.x, y: enemy.y });
            if (enemy.x === this.player.x && enemy.y === this.player.y) this.fightStalker(enemy);
        }
    }

    /** The fight when a stalker steps onto the player: the same toll as stepping onto it. */
    private fightStalker(enemy: RunEnemy): void {
        const cost = this.tollOf(enemy);
        this.energy -= cost;
        const index = this.enemies.indexOf(enemy);
        if (index !== -1) this.enemies.splice(index, 1);
        this.score += KILL_SCORE;
        this.tally.kills += 1;
        this.tally.lostToFights += cost;
        this.push({ type: "fight", cost, kind: enemy.kind, x: enemy.x, y: enemy.y, by: "stalker" });
        if (this.energy <= 0) this.die("fight");
    }

    /**
     * Recompute every enemy's intent from the maze as it is now: the first step of
     * the shortest route to the player for a stalker, null when there is no route
     * (and always a neighbour of the stalker otherwise). The other kinds carry no
     * intent. Called after each successful player move, once its shift is applied.
     */
    private refreshIntents(): void {
        for (const enemy of this.enemies) {
            if (enemy.kind !== "stalker") {
                enemy.intent = null;
                continue;
            }
            const path = routeCells(
                this.maze,
                { x: enemy.x, y: enemy.y },
                { x: this.player.x, y: this.player.y },
            );
            enemy.intent = path !== null && path.length >= 2 ? { x: path[1].x, y: path[1].y } : null;
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
            { items: plan.items, enemies: plan.enemies, tools: plan.tools },
            plan.energyShare,
            { depth: this.level, route },
        );
        this.items = spawned.items.map((item) => ({ id: this.nextId++, ...item }));
        this.enemies = spawned.enemies.map((enemy) => ({
            id: this.nextId++,
            ...enemy,
            hp: ENEMY_KINDS[enemy.kind].hp,
            power: ENEMY_KINDS[enemy.kind].power,
            intent: null,
        }));
        // The stalker step counts the successful moves made on this level.
        this.movesOnLevel = 0;
        this.refreshIntents();
    }

    /**
     * Roll the walk for the next move and store it as `forecast` (with its
     * directions). While an Anchor holds, nothing is rolled: the stored walk is
     * empty and the forecast shows no opens or closes, so the next moves apply
     * no shift at all.
     */
    private rollForecast(): void {
        if (this.anchored > 0) {
            this.forecastDirs = [];
            this.forecast = { walk: [], opens: [], closes: [] };
            return;
        }
        const shifts = this.shiftsOverride ?? levelPlan(this.level).shifts;
        this.forecastDirs = rollWalk(this.maze, this.rng, shifts);
        this.forecast = forecastOf(this.maze, this.forecastDirs);
    }
}
