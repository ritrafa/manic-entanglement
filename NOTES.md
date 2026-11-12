# NOTES

## Queue log

- Install and build again: moved to Next 16 / React 19 / vitest, dropped the GIF encoder
  (player now uses the default `player.gif`), deleted the NFT mint route and all
  server-key code, removed Tailwind/PostCSS/ESLint leftovers, and pinned Node 22 in `.nvmrc`.
- Rebuilt the player as stacked trait layers: new pure `game/sprite.ts` (`LAYER_ORDER`, `TRAITS`, `sanitizeLook`, `spriteLayers`, `frameAt`) plus `game/sprite.test.ts`; `GameState` now stacks one `<img class="player-layer">` per URL, animates it on a 150 ms interval with all frames preloaded, and exposes `setLook`; `Hud` feeds the wallet-loaded look to `setLook`; `.player` no longer uses `player.gif`.
- Made the maze algorithm a pure, seeded module: new `game/rng.ts` (`createRng` with mulberry32-backed `next`/`int`/`pick`/`clone`, seed 0 fine) and `game/maze.ts` (`Cell` + `Maze` with `constructor(width, height, rng)`, `shift(rng)` returning `{ from, to }`, and `canMove`), covered by `game/rng.test.ts` and `game/maze.test.ts`; `lib/maze.ts` now holds only `Item`/`Enemy` (the maze is gone, DOM stays out, no `GameState` import), and `GameState` owns `createRng(Date.now())`, builds mazes from it, calls `maze.shift(this.rng)` (still 15 per move), gates moves with `canMove`, and draws the fade overlay via its own private `addOverlay` (the buggy `updateOverlayPosition` is gone).
