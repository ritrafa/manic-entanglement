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
    | { type: "fight"; cost: number; kind: EnemyKind; x: number; y: number }
    | { type: "levelClear"; level: number; gained: number }
    | { type: "dead"; cause: DeathCause; score: number; level: number };
