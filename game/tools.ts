// The three tools a run can carry: the Anchor, which freezes the maze for a
// number of moves, the Twist, which rerolls the forecast for the next one, and
// the Cut, which calls the Knot through the wall the player faces. All are
// found in the maze as pickups, carried as charges and used with a key or a
// tap. Pure data only — no DOM, no clocks, no global randomness.

/** The tool ids; also the pickup types the spawner gives tool pickups. */
export type ToolId = "anchor" | "twist" | "cut";

/** Every tool id, in the order the toolbar shows them (and keys 1, 2 and 3 bind). */
export const TOOL_IDS: readonly ToolId[] = ["anchor", "twist", "cut"];

/**
 * What a tool is called and the one line that explains what using it does.
 * `minDepth` is the first depth whose pickups may carry the tool: Cut pickups
 * only appear from depth 3, so earlier levels choose among the others.
 */
export const TOOL_INFO: Record<ToolId, { name: string; hint: string; minDepth: number }> = {
    anchor: { name: "Anchor", hint: "Freezes the maze for your next 6 moves", minDepth: 1 },
    twist: { name: "Twist", hint: "Rerolls the forecast for your next move", minDepth: 1 },
    cut: { name: "Cut", hint: "The Knot leaps to you and opens the wall you choose", minDepth: 3 },
};

/** The tool ids whose pickups may spawn at the given depth (below 1 reads as 1). */
export function toolsFor(depth: number): ToolId[] {
    const d = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
    return TOOL_IDS.filter((id) => TOOL_INFO[id].minDepth <= d);
}

/** True when a pickup type belongs to a tool rather than to the six gear items. */
export function isToolType(type: string): type is ToolId {
    return (TOOL_IDS as readonly string[]).includes(type);
}
