// The events a Run emits while it plays. Pure data: no DOM, no clocks, no global randomness.

import type { EnemyKind } from "./enemies";
import type { ToolId } from "./tools";

export type ItemType = "energy" | "boots" | "gloves" | "shield" | "speed" | "backpack";

/** What a pickup on the board can be: one of the six gear items, or a tool. */
export type PickupType = ItemType | ToolId;

export type DeathCause = "time" | "move" | "fight";

export type GameEvent =
    | { type: "start" }
    | { type: "levelStart"; level: number; size: number }
    | { type: "move"; x: number; y: number; dx: number; dy: number }
    | { type: "blocked"; dx: number; dy: number }
    | { type: "pickup"; item: PickupType; text: string; x: number; y: number }
    | { type: "tool"; id: ToolId; dx?: number; dy?: number }
    /** `by: "stalker"` when a stalker stepped onto the player; absent when the player walked into it. */
    | { type: "fight"; cost: number; kind: EnemyKind; x: number; y: number; by?: "stalker" }
    /** A stalker (game/enemies.ts, game/run.ts) took its step to this cell. */
    | { type: "stalker"; id: number; x: number; y: number }
    | { type: "levelClear"; level: number; gained: number }
    /** Carried gear became permanent at the exit: `count` pieces joined the bank. */
    | { type: "banked"; count: number }
    /** The last level of a limited run was cleared: it finished in `ms` (the tally's time). */
    | { type: "finished"; ms: number }
    | { type: "dead"; cause: DeathCause; score: number; level: number; lost: number };
