# NOTES

## Queue log

- Install and build again: moved to Next 16 / React 19 / vitest, dropped the GIF encoder
  (player now uses the default `player.gif`), deleted the NFT mint route and all
  server-key code, removed Tailwind/PostCSS/ESLint leftovers, and pinned Node 22 in `.nvmrc`.
- Rebuilt the player as stacked trait layers: new pure `game/sprite.ts` (`LAYER_ORDER`, `TRAITS`, `sanitizeLook`, `spriteLayers`, `frameAt`) plus `game/sprite.test.ts`; `GameState` now stacks one `<img class="player-layer">` per URL, animates it on a 150 ms interval with all frames preloaded, and exposes `setLook`; `Hud` feeds the wallet-loaded look to `setLook`; `.player` no longer uses `player.gif`.
