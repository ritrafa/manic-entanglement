// The events a Run emits while it plays. Pure data: no DOM, no clocks, no global randomness.

export type ItemType = "energy" | "boots" | "gloves" | "shield" | "speed" | "backpack";

export type DeathCause = "time" | "move" | "fight";

export type GameEvent =
    | { type: "start" }
    | { type: "levelStart"; level: number; size: number }
    | { type: "move"; x: number; y: number; dx: number; dy: number }
    | { type: "blocked"; dx: number; dy: number }
    | { type: "pickup"; item: ItemType; text: string; x: number; y: number }
    | { type: "fight"; cost: number; x: number; y: number }
    | { type: "levelClear"; level: number }
    | { type: "dead"; cause: DeathCause; score: number; level: number };
