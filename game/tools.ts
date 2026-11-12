// The two tools a run can carry: the Anchor, which freezes the maze for a
// number of moves, and the Twist, which rerolls the forecast for the next one.
// Both are found in the maze as pickups, carried as charges and used with a
// key or a tap. Pure data only — no DOM, no clocks, no global randomness.

/** The two tool ids; also the pickup types the spawner gives tool pickups. */
export type ToolId = "anchor" | "twist";

/** Every tool id, in the order the toolbar shows them (and keys 1 and 2 bind). */
export const TOOL_IDS: readonly ToolId[] = ["anchor", "twist"];

/** What a tool is called and the one line that explains what using it does. */
export const TOOL_INFO: Record<ToolId, { name: string; hint: string }> = {
    anchor: { name: "Anchor", hint: "Freezes the maze for your next 6 moves" },
    twist: { name: "Twist", hint: "Rerolls the forecast for your next move" },
};

/** True when a pickup type belongs to a tool rather than to the six gear items. */
export function isToolType(type: string): type is ToolId {
    return (TOOL_IDS as readonly string[]).includes(type);
}
