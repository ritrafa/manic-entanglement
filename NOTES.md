# NOTES

## Queue log

- Gave the game a wardrobe: the new pure `game/wardrobe.ts` holds `FREE_TRAITS`
  (Body Green, Body Blue, Eye Regular, Eye Asleep and Head Hood — `None` is
  always available where it exists), `UNLOCKS` (every one of the other seventeen
  traits on exactly one feat, one or two each — first-exit: Body Pink; depth-5:
  Eye One; depth-10: Clothes Tank; photo-finish: Head Cowboy; no-toll: Eye Zero;
  toll-road: Back Wings; warden: Clothes Robe + Astronaut; collector: Back
  Billhook + Head Crown; toolbox: Eye Scanner; in-the-dark: Head Cosmonaut +
  Body Purple; sprinter: Body Gold + Back Jetpack; still-water: Body Skeleton +
  Body Solana), plus `isUnlocked`, `availableTraits` (TRAITS order),
  `cycleTrait` (wrap-around), `fitLook` (a trait not available falls back to the
  layer's default) and `unlockedBy`, all tested in `game/wardrobe.test.ts`;
  `game/screens.ts` added the "wardrobe" screen (title opens it, back or Esc
  returns) and a `New look` summary row per trait the run's new feats unlocked,
  `game/menu.ts` a Wardrobe entry between Settings and Feats; `lib/GameState.ts`
  loads the look as `fitLook(sanitizeLook(save.look), save.feats)`, keeps it in
  the snapshot and gained `setWardrobeLook` (applies, saves and redraws) beside
  the wallet's `setLook`, which still shows an NFT look as it is and never
  writes to the save; `components/Wardrobe.tsx` draws the panel — a ~192 px
  pixelated preview stacked from `spriteLayers` and animated by `frameAt`, one
  row per layer (name, previous, trait, next, arrow keys on the focused row)
  and an "n of 22 traits unlocked" line saying feats unlock more, mounted
  through `components/Overlay.tsx` and styled in `styles/globals.css`. Held for
  the owner's Q12, since these traits are what the NFT collection is made of.


- Gave the game a feats collection: `game/run.ts` extended the `Tally` with
  `minExitEnergy` (lowest energy on arriving at an exit, null before the first),
  `wardens` (Wardens beaten), `toolsUsed` (a per-tool-id count raised only by
  successful `useTool` calls), `darkCleared` (Blackout levels cleared), `banked`
  (pieces kept at exits, 0 in a no-gear mode) and the run's `mode`; the new pure
  `game/feats.ts` holds `Feat = { id, name, text, test(tally, totals) }` with
  `FEATS` — first-exit, depth-5, depth-10, photo-finish, no-toll, toll-road,
  warden, collector, toolbox, in-the-dark, sprinter and still-water — plus
  `featById`, `updateTotals` (lifetime `runs`, `kills`, `cleared`, `banked` and a
  never-decreasing `deepest`, keeping every other totals key and never mutating
  its input), `evaluateFeats` (new ids in list order, unknown earned ids
  ignored) and `featProgress`; `lib/GameState.ts` settles each finished run once
  (`updateTotals` then `evaluateFeats` on the totals as they just became, new ids
  appended to `save.feats`, one write), prints a `New feat` row per earned name
  in the summary (`summaryLines` gained the `feats` input), exposes the earned
  ids in the snapshot and opens the new `feats` screen from the title
  (`game/screens.ts`, back to the title); `game/menu.ts` appends the
  `Feats (have/of)` entry and `components/Feats.tsx` lists every feat with its
  name, text and the word "Earned" or "Locked" (a word, not a colour); covered
  by `game/feats.test.ts` (uniqueness, the 80-character texts, each feat's
  boundary numbers, totals purity and kept keys, unknown-id tolerance) plus the
  new tally, screen and menu cases.

- Made the keys remappable: `game/keys.ts` gained `KeyMap = Record<Action, string[]>`
  (at most two codes per action), `rebind(keys, action, slot, code)` (a pure swap:
  a code held by another action trades places with the slot's old code, an empty
  slot just takes the code unless that would leave the other action with nothing,
  binding a code to the slot it already sits in changes nothing, and `Escape` is
  reserved — never assignable, never removable from `pause`), `sanitizeKeys(value)`
  (the whole map or `DEFAULT_KEYS`, never a repaired half: seven actions, one or
  two unique non-empty string codes each, `pause` holding `Escape`), `keyLabel(code)`
  (`KeyW` to `W`, `Digit1` to `1`, `ArrowUp` to "Up arrow", `Space` to "Space") and
  `ACTION_LABELS`; `game/settings.ts` added the `keys: KeyMap` field, sanitized with
  `sanitizeKeys`; `game/screens.ts` added the `keys` screen with a `keys` action from
  `settings` and `back`/`pause` returning to it; `lib/GameState.ts` now hands the
  saved map to `actionFor`, exposes `setKey(action, slot, code)` and `resetKeys()`
  (both through `setSetting`, so the save is written at once), `openControls()` /
  `closeControls()`, and a `capturingKey` flag that makes the global keydown/keyup
  handler ignore every event while the Controls screen waits for a key; the new
  `components/Controls.tsx` shows one row per action with its label and two key
  buttons (`-` for an empty slot) — activating one reads "Press a key" and binds
  the next keydown's code, Escape cancels — plus Reset to defaults and Back, and
  `components/Settings.tsx` gained the Controls entry; covered by the new `rebind`
  (swap, refusal, no-mutation, a 200-rebind seeded fuzz holding every invariant),
  `sanitizeKeys`, `keyLabel` and `ACTION_LABELS` cases in `game/keys.test.ts`, the
  `keys` screen cases in `game/screens.test.ts` and the `keys` field cases in
  `game/settings.test.ts`; `styles/globals.css` adds `.controls-rows`,
  `.controls-row .controls-label` and `.controls-key` in the settings-panel family.

- Made the best score survive closing the tab: rewrote `game/save.ts` as the one
  versioned save object — `SAVE_KEY = "manic-entanglement.save"`, `SaveData` at
  `v: 1` with `best`, `settings`, `gear`, `totals`, `feats`, `look` and `seen`
  (later cards fill those in instead of inventing new keys), `defaultSave()`
  returning a fresh object each call, `loadSave(storage)` returning the default
  for a null storage, a missing key, broken JSON, a non-object or a save not at
  version 1 and otherwise the stored object with every missing or wrongly typed
  top-level field replaced from the default (numbers in `best` that are not
  finite and non-negative are dropped, unknown extra fields are kept, and a
  throwing `getItem` still yields the default), and `writeSave(storage, data)`
  returning false without a throw when storage is null or `setItem` fails; the
  storage comes in as a `StorageLike` argument, so nothing under `game/` reaches
  for a browser global and the node tests pass a plain object; `lib/GameState.ts`
  now reads `window.localStorage` once in the constructor inside a try (null
  when it is missing or throws), seeds `highScore` from `save.best.descent`, and
  calls `recordBest(score)` on `levelClear` and `dead`, which updates the saved
  best and writes it back only when the run beat it — the HUD bar and the
  game-over text read that saved best; covered by `game/save.test.ts` (round
  trip, defaults, broken payloads, field repair, throwing storages, kept extras).

- Scored runs by what they achieved instead of by pacing: new pure `game/score.ts` (`levelScore({ level, energyLeft }) = 100 * level + floor(max(0, energyLeft))` awarded when a level is cleared with the energy as it is on arrival, before the exit bonus; `KILL_SCORE = 25` per enemy defeated and `PICKUP_SCORE = 10` per pickup, both awarded at once, the three numbers exported from `game/config.ts`), covered by `game/score.test.ts`; `game/run.ts` no longer touches `score` on a move and keeps a `run.tally: Tally` (`moves`, `ms` from `tick` while playing, `kills`, `pickups`, `bumps` for blocked moves, `depth` (deepest level, starts at 1), `cleared` and `lostToFights`), reset by `start()` and still readable after death, and the `levelClear` event carries `gained`; `game/save.ts` gained `upgradeSave(data)`, which empties `best` and stamps `totals.scoreRule = 2` once so old bests counted in steps never haunt the HUD bar, applied by `loadSave`; the shell floats `+<gained>` above the player when a level clears; `game/bot.test.ts` thresholds unchanged prove the rules themselves did not move, and `game/forecast.test.ts` pins the new event streams of the two seeded replays.

- Made the next shift visible before you take it: `game/maze.ts` gained `step(dir)` (moves the origin one step in a `"u" | "r" | "d" | "l"` direction, with `DIR_DELTAS` exported and `shift(rng)` now just "pick a valid direction, then step"), `validDirs(at?)` and a deep, independent `clone()`; the new pure `game/forecast.ts` has `Edge = { x, y, dir: "r" | "d" }` (the wall between a cell and its right or lower neighbour), `rollWalk(maze, rng, steps)` (the directions the origin will take, each drawn from the valid directions at the simulated position, so the walk never leaves the board) and `forecastOf(maze, walk)` (applies the walk to a clone and returns `{ walk, opens, closes }` - the origin's positions and the net wall changes, dropping any wall the walk opens and seals again); `game/run.ts` rolls the walk for the next move at each level start and after every successful move into `run.forecast` (a blocked move leaves it untouched), and a successful move applies exactly the stored directions with `maze.step` - the rolls consume the rng at the very points the old per-move shifts did, so `game/forecast.test.ts` pins two seeded bot replays to the events captured before this change; `game/view.ts` gained `markTiles(forecast)` (an `r` edge at (x, y) marks wall tile (2x + 2, 2y + 1), a `d` edge (2x + 1, 2y + 2)); `lib/board.ts` draws the Knot as one persistent `.knot` element gliding on the origin's tile (CSS-only gold ring with a teal centre and a slow pulse) over the now 4-tiles-wide blob (`blobTiles` in `game/config.ts`, passed to `blobRect` as its new third argument, 8 by default), and replaces one `.mark.mark-open` / `.mark.mark-close` element per marked wall tile on every update - opening walls get a dashed gold outline with the wall showing through, sealing walls a diagonal white hatch, so the two read by shape and pattern, not only colour; covered by `game/forecast.test.ts` (20 seeds x 50 moves where the walls after a move equal the walls before it with the forecast applied, opens/closes balance and bounds, walk shape, blocked moves, clone independence, 1,000-step walks on sizes 3 and 5) and the `markTiles` cases in `game/view.test.ts`.

- Gave the run a depth curve and carried energy between levels: new pure `game/plan.ts` (`levelPlan(depth)` -> `{ size, shifts, items, energyShare, enemies, exitBonus }` with `size = min(13, 5 + 2 * floor((depth - 1) / 2))` (5, 5, 7, 7, 9, 9, 11, 11, 13, 13, ...), `shifts = min(9, 3 + floor((depth - 1) / 2))` per move, `items = [2, 2 + floor(size / 3)]`, `energyShare = 0.4` (the chance a pickup is `energy`; the other five types share the rest evenly), `enemies = min(6, 1 + floor(depth / 2))` and `exitBonus = 50`, all constants in `game/config.ts`, depth below 1 treated as 1), covered by `game/plan.test.ts`; `game/run.ts` builds every level from `levelPlan(level)` and `nextLevel()` now sets `energy = min(storage, energy + exitBonus)` instead of refilling (level 1 still starts at `max(startEnergy, storage)`); `game/spawn.ts` takes an `energyShare` argument (default the even 1-in-6 draw); the old `shiftsPerMove: 15`, `pickupCount` and `enemyCount` config values are gone; `game/bot.test.ts` pins the curve over 40 seeds at 20000 max moves (at 4 moves a second >= 34 reach depth 3 and >= 24 depth 4, at 2 a second >= 32 reach depth 2, at 8 a second every run dies before depth 25; measured: 100%/92.5%, 100% and a deepest of 11) and the final tuned numbers stayed `exitBonus = 50` and `energyShare = 0.4`.
- Install and build again: moved to Next 16 / React 19 / vitest, dropped the GIF encoder
  (player now uses the default `player.gif`), deleted the NFT mint route and all
  server-key code, removed Tailwind/PostCSS/ESLint leftovers, and pinned Node 22 in `.nvmrc`.
- Rebuilt the player as stacked trait layers: new pure `game/sprite.ts` (`LAYER_ORDER`, `TRAITS`, `sanitizeLook`, `spriteLayers`, `frameAt`) plus `game/sprite.test.ts`; `GameState` now stacks one `<img class="player-layer">` per URL, animates it on a 150 ms interval with all frames preloaded, and exposes `setLook`; `Hud` feeds the wallet-loaded look to `setLook`; `.player` no longer uses `player.gif`.
- Made the maze algorithm a pure, seeded module: new `game/rng.ts` (`createRng` with mulberry32-backed `next`/`int`/`pick`/`clone`, seed 0 fine) and `game/maze.ts` (`Cell` + `Maze` with `constructor(width, height, rng)`, `shift(rng)` returning `{ from, to }`, and `canMove`), covered by `game/rng.test.ts` and `game/maze.test.ts`; `lib/maze.ts` now holds only `Item`/`Enemy` (the maze is gone, DOM stays out, no `GameState` import), and `GameState` owns `createRng(Date.now())`, builds mazes from it, calls `maze.shift(this.rng)` (still 15 per move), gates moves with `canMove`, and draws the fade overlay via its own private `addOverlay` (the buggy `updateOverlayPosition` is gone).
- Moved the run rules into a pure, DOM-free core: new `game/config.ts` (every tunable as `CONFIG`), `game/events.ts` (`GameEvent` union: `start`, `levelStart`, `move`, `blocked`, `pickup`, `fight`, `levelClear`, `dead`), `game/run.ts` (`Run` class with `phase`/`start()`/`move()`/`tick()`/`nextLevel()`/`takeEvents()`, one seeded `createRng`, ids on items and enemies, the placement typo fixed and the pre-start/after-death/level-change clock defects gone by construction) and `game/bot.ts` (`nextStep` BFS first step plus `playBot`), covered by `game/run.test.ts` and `game/bot.test.ts`; `lib/GameState.ts` is untouched, the page switches over in the next card.
- Put the page on the `Run` class: `lib/GameState.ts` is now the browser shell only — it owns one `Run` (`new Run({ seed: Date.now(), stats })` with stats from the `Player` fields), a 50 ms clock interval stored as a class field that feeds `run.tick(elapsedMs)` with real elapsed time (cleared whenever the run is not `playing`), and `run.takeEvents()` handling (`pickup`/`fight` sounds plus floating text via the new pure `lib/shell.ts` `eventMessage` helper, covered by `lib/shell.test.ts`; `levelClear` plays the level-up sound and the existing animation then calls `run.nextLevel()`; `levelStart` sizes/draws the board and sets the music rate; `dead` shows the game-over panel, whose click calls `run.start()` again). The duplicated rules (`initGame`, `placePowerups`, `placeEnemies`, the old `movePlayer` maths, the module-level `energyInterval`), the commented-out sound code and the `SHUFFLE_COUNT`/`POWERUP_COUNT`/`ENEMY_COUNT` constants are gone; `lib/maze.ts` and `lib/types.ts` are deleted and `app/page.tsx`/`components/Hud.tsx` import the `Player` class directly. The high score is a shell field (`highScore`, in memory); no `Math.random` remains in the shell — the run owns randomness.
- Put every board size on one path: new pure `game/layout.ts` (`boardLayout(viewW, viewH, tiles)` — whole-pixel `cell` ≥ 4, `board = cell * tiles`, capped at 94% of the width and 62% of the height — and `blobRect(origin, cell)` — an 8-tile blob centred on the origin tile's centre), covered by `game/layout.test.ts`; `lib/GameState.ts` now sizes the board only in `sizeBoard` (used by both the `levelStart` handling and `handleResize`, which also re-places the overlay) and the old `addOverlay` became `placeOverlay`, positioning `.fade-overlay` from `blobRect` with the shell's `cellSize` instead of the hard-coded 400 px / 176 px offset; `styles/globals.css` uses `100dvh` over a `100vh` fallback, sizes the countdown with `min(40vw, 40vh)`, raises `.stat` label text to 11 px, and adds a ≤ 480 px media query that puts the five stats in a five-column grid with the wallet box compacted above the bars.
- Gave the shell a tidy life cycle: new pure `game/clock.ts` (`clampDt(ms, max = 250)` — negative/NaN/non-finite give 0, larger values cap at `max`) covered by `game/clock.test.ts`; the 50 ms clock in `lib/GameState.ts` clamps each elapsed delta with `clampDt`, skips ticking entirely while `document.hidden` and restarts its measurement on the `visibilitychange` return, so a backgrounded tab cannot drain the energy in one tick; `startGame()` is ignored unless the phase is `ready`/`dead` with no countdown running (the three countdown `setTimeout`s live in a cancellable field, so repeated taps leave exactly one countdown), `dispose()` clears the clock, sprite interval, countdown, tracked message/animation timeouts and the visibility listener and pauses every audio element, and `app/page.tsx` calls it from the effect's cleanup; the `active` flag is now a getter on the run's phase (`playing` or `clear`).
- Made placement fair and terminating: new pure `game/spawn.ts` (`spawnLevel(rng, size, counts)` — the free cells (all but the start `(floor(size/2), size-1)` and the exit `(floor(size/2), 0)`) shuffled with the rng, enemies taken first from cells at `|dx|+|dy| >= 2` from the start, pickups from what is left, types picked evenly from the six, counts as rolled whole numbers or `{min,max}` ranges, and never a loop when cells run short) covered by `game/spawn.test.ts` (200 seeds x sizes 3/5/9 keep the start, exit and each other free with the enemy distance kept; size 3 with 20+20 requested returns at most 7 and ends; size 1 is empty; same seed, same result; all six types appear); `Run.buildLevel` now takes its items and enemies from `spawnLevel` and only adds the ids, replacing the old `placeItems`/`placeEnemies` do-while placement.
- Made fight costs finite, positive and survivable: new pure `game/combat.ts` (`fightCost(stats, enemy)` — `round(hp / max(0.1, attack) * max(1, power - defense))` clamped to 1..999, with a non-finite stat counting as its default attack 1 / defense 1, covered by `game/combat.test.ts`); `CONFIG.enemy` now tunes the fight through its two numbers, `hp` 3 and `power` 6 (a fight costs 15 energy at default stats, down from the old 90 that decided level 1 on any enemy standing on the only route); `Run.move` takes its cost from `fightCost` and the whole number goes into the `fight` event, plus the new `Run.fightCostAt(x, y)` preview for later cards; the shell floats `-${cost} Energy` (`lib/shell.ts`) and the game-over panel's second line opens with "An enemy took your last energy" when the `dead` cause is `fight` (`lib/GameState.ts`); the seeded bot at 4 moves a second now reaches level 2 or deeper on 40 of 40 seeds (`game/bot.test.ts`).
- Put the keyboard on physical keys: new pure `game/keys.ts` (`Action` union `up/down/left/right/confirm/mute/pause`, `DEFAULT_KEYS` bound to `KeyboardEvent.code` values — arrows + `KeyWASD`, `Enter`/`Space`, `KeyM`, `Escape`/`KeyP` — plus `actionFor(event, keys)` which drops the event when Ctrl/Alt/Meta is held or the target is an `INPUT`/`TEXTAREA`/`SELECT` and hands Enter/Space back to a focused `BUTTON`, and `dirOf(action)`), covered by `game/keys.test.ts`; `lib/GameState.ts` `handleKeyPress` now builds that plain object from the keydown, `preventDefault()`s every action it takes (arrows and Space no longer scroll), moves only while the run is live, and routes Enter/Space through the new public `confirm()` (countdown from the title, instant restart from death with the panel and red overlay cleared via `clearGameOverPanel`, no-op mid-run) and M through `toggleMute()` which mutes all six shell audios; `pause` is consumed but idle until the pause-screen card, the game-over panel's click and the title image's click in `app/page.tsx` both call `confirm()`, and the old `switch (event.key)` with its Caps Lock/layout-breaking letter cases is gone.
- Put the phone's hand on the board: new pure `game/swipe.ts` (`classifyTouch(dx, dy, ms)` — tap under 12 px and 500 ms with no direction, swipe when the larger distance reaches 24 px with the direction on the dominant axis and ties counting as horizontal, everything else `none` including NaN) covered by `game/swipe.test.ts`; new `components/TouchLayer.tsx` replaces and deletes `components/mobile-swiper.jsx` — it keeps the touch start in refs (no re-render per touch), listens on its own wrapper with `{ passive: false }` and `preventDefault()`s `touchmove` while a touch that started on the board runs (no scroll, no pull-to-refresh), calls `onSwipe(dx, dy)` only for a classified swipe and dispatches no synthetic events at all, so a tap is the browser's single click on the title or game-over panel; touches starting on a `button`, an `a` or the wallet dialog pass through untouched; `app/page.tsx` `handleSwipe` is now just `gameState.movePlayer(dx, dy)` (the unreachable zero-delta branch is gone), and `styles/globals.css` adds `touch-action: none` plus `-webkit-tap-highlight-color: transparent` on `#maze-container` and `overscroll-behavior: none` on `body`.
- Kept the board in the DOM instead of rebuilding it: new pure `game/view.ts` (`tileDiff(prev, next)` — the wall-grid tiles whose code changed, the full list when there is no remembered grid or the dimensions differ — and `entityPx(cellX, cellY, cell)` — a cell's tile at `(2x + 1, 2y + 1) * cell` pixels), covered by `game/view.test.ts` (a copy patched with the diff of one seeded shift equals the new `wallGrid`, and over 200 shifts on a 9 x 9 maze the largest diff stays under 40 of 361); new `lib/board.ts` (`Board`, the only code touching the board's DOM, no React): `mount` builds `.tiles`/`.entities`/`.fx` inside `#maze`, `setLevel` builds the tile images and one persistent element per player/exit/pickup/enemy/blob, `update` sets only the changed tiles' `src` from `tileDiff` and glides every entity with a `translate(...)` transform (elements of collected pickups and defeated enemies are removed by their stable ids), `resize` re-places everything at a new cell size and `float` drops a `.message` in the fx layer that goes when its animation ends; `lib/GameState.ts` lost `renderMaze`, `displayMessage` and `placeOverlay` and now drives the board (the sprite timer keeps animating the one persistent player element, whose flip moved to its `.player-sprite` inner wrapper), and `styles/globals.css` puts the grid on `.tiles`, absolutely positions the entity layers with `left/top: 0` plus `image-rendering: pixelated`, and transitions the player's transform over 90 ms and the blob's over 150 ms.
- Gave movement its own cadence: new `game/config.ts` values `stepMs: 110` (time between steps while running) and `firstRepeatMs: 170` (time from the first step to the second while a key stays down) are the two numbers to tune by hand; new pure `game/stepper.ts` (`Stepper` with `press(dir, now)`/`release(dir)`/`clear()`/`poll(now)`, the caller passes every instant) holds the held-key stack, the most-recent-key-wins rule and the one remembered press, covered by `game/stepper.test.ts`; `lib/GameState.ts` ignores `event.repeat`, routes directions through `stepper.press`/`stepper.release` (new `handleKeyRelease`, wired to `keyup` in `app/page.tsx`), clears the stepper on window `blur` and whenever the run leaves `playing`, and one `requestAnimationFrame` loop now drives both the clamped energy clock and `stepper.poll(performance.now())` steps (`dispose()` cancels it), while swipes go through `tapMove(dx, dy)` — a press followed by a release — so they share the cadence, and `.player`'s glide in `styles/globals.css` transitions over `var(--step-ms, 110ms)` set by the shell from `CONFIG.stepMs`.
- Made enemies a decision with three kinds, visible tolls and gear drops: new pure `game/enemies.ts` (`EnemyKind` = `wisp` / `brute` / `warden`, `ENEMY_KINDS` fed from new `CONFIG.enemyKinds` numbers — wisp hp 3, power 6, from depth 1, base toll 15; brute hp 6, power 6, from depth 3, base toll 30, drops 1 gear; warden hp 9, power 7, from depth 6, base toll 54, drops 2 gear — plus `isHeavy` and `enemyFor(depth, rng)`, which draws wisp below depth 3, 70/30 wisp/brute at depths 3 to 5 and 50/35/15 wisp/brute/warden from depth 6 using `CONFIG.enemyShares`; `game/enemies.test.ts`), covered by `game/enemies.test.ts`; `game/spawn.ts` `spawnLevel` takes a `{ depth, route }` option, gives every enemy a `kind` and moves a brute or warden dealt onto the start-to-exit route to a free cell off it (or demotes it to wisp when none is free), exporting `GEAR_TYPES` (the five non-energy pickups), covered by `game/spawn.test.ts`; `game/bot.ts` exports the breadth-first `routeCells(maze, from, to)` that `nextStep` now reuses, and `Run` uses it in `buildLevel` so the heavy kinds never block the opening route; `game/run.ts` enemies carry `kind`, `hp` and `power`, the new `run.tollOf(enemy)` is `fightCost` with the current stats (and backs `fightCostAt`), the `fight` event carries `kind`, and a beaten brute or warden emits its drops at once as gear pickups of random types that score and move the stats like ordinary pickups; `lib/board.ts` gives each enemy a `.toll` badge refreshed on every update (`.toll-fatal` inverted-and-outlined when the toll reaches the energy left) and kind classes `.enemy-brute` / `.enemy-warden` drawn 15% / 30% larger with one / two rings in CSS on the same GIF; `game/forecast.test.ts` baselines re-captured for the new events, `game/bot.test.ts` thresholds unchanged.
- Rendered the HUD from one model instead of twice: new pure `game/hud.ts` (`HudModel` with `energyText` (`Energy: 87`, whole, never below 0), `energyPct` and `bestPct` clamped to 0 to 100 with a 0 best or a broken storage reading 0 instead of NaN%, `scoreText`, `level`/`attack`/`defense` as one-decimal text, `clockPct` = `round(100 / speed)` (the drain rate, 100 at the start, lower is better) and `stepPct` = `round(consumption * 100)` — the two honest names for the old misleading Speed and Consumption — plus `isNewBest(score, bestBefore)`, true only when the score is above both the best and 0, and `sameHudModel` for the change check), covered by `game/hud.test.ts` (zero best, exceeded best, negative and overflowing energy, NaN storage, the two renames' numbers, deep equality on an unchanged run); `lib/GameState.ts` deleted `updateStatus()` and every `getElementById` HUD write and now holds one snapshot published through stable arrow-field `subscribe(listener)`/`getSnapshot()` — the object is replaced, and listeners woken, only when a model field actually changed, after each handled move, tick and phase change — while `beginRun()` remembers `bestBeforeRun` so the bar and the game-over text measure the run against the best it started with (the "new high score 🏆" now needs `isNewBest`, so merely equalling the old best, or both being 0, says nothing); `components/Hud.tsx` reads the model with `useSyncExternalStore(gameState.subscribe, gameState.getSnapshot, gameState.getSnapshot)` and labels the two stats `🏃‍♂️ Clock` and `⚡ Step cost`, the wallet half untouched.
- Taught the sound to wait for the player: new `lib/sound.ts` (`Sound`, built with an injected `(src) => AudioLike` factory so the file itself touches no browser global and `lib/sound.test.ts` runs in node) owns one lazily created element per sample — `pickup`, `fight` (rate 2), `levelup`, `beep` (rate 1.5) and `lost` — plus the looping music; `unlock()` (called by the shell on the first `keydown`, `pointerdown` or `touchstart`, `{ once: true }`, idempotent) is the gate that keeps every `play()` from ever being attempted before a gesture, so a page load logs no `NotAllowedError` any more, and both a thrown `play()` and a rejected play-promise are swallowed inside the class; `startMusic`/`stopMusic`/`setMusicRate` replace the old direct music element, `setMuted` silences everything (unmuting resumes music that should be playing) and `setHidden` pauses the music while the tab is hidden and resumes it on return — but never starts music that was stopped; `lib/GameState.ts` dropped its six eager `new Audio` fields and their constructor `play()` for one `Sound` (the factory `(src) => new Audio(src)` is the shell's only audio construction), routes every event and countdown beep through it, feeds `setHidden` from the `visibilitychange` handler and `setMusicRate` from `levelStart`, and M now toggles mute through it while storing the choice as `settings.muted` in the save and re-applying the stored value on load, so the silence survives a reload; `dispose()` calls `stopAll()`; covered by `lib/sound.test.ts` with a fake factory (no element and no play before `unlock`, exactly one element per sample across ten plays, rejecting and throwing fakes stay silent and unraised, muted plays and muted music make no sound and unmuting resumes, hidden pauses and resumes but never revives stopped music, `setMusicRate(0.79)` lands on the element).
- Gave the game a pause and a real ending: new pure `game/screens.ts` (`Screen` = `title` / `countdown` / `playing` / `paused` / `clear` / `over`, `nextScreen(screen, action, { pausedFrom })` for the actions `confirm`, `pause`, `hide`, `restart`, `quit` and the run-driven `started`, `cleared`, `levelStarted`, `died` — playing+pause/hide pauses, a pause resumes to where it came from (a pause taken on the clear screen waits for `levelStarted` before playing again, so the clock never runs behind the panel), `paused`+`hide` stays paused so a hidden tab comes back paused, `over` restarts through the countdown or quits to the title, and unknown pairs keep the screen — plus `summaryLines({ tally, score, best, newBest, cause })` (cause in words, `Depth reached`, `Score`, `Best` with `New best!`, `Time` as `m:ss`, `Enemies beaten`, `Pickups`) and `sameSummary` for the change check), covered by `game/screens.test.ts` including a Run that pays nothing for 10 s paused and the new `Run.abandon()` (a live or dead run walks back to `ready` with no `dead` event, so Quit is not dying); `lib/GameState.ts` deleted `gameOver()`, the hand-built `.game-over-message` DOM and the red maze tint, and now holds `screen` and routes every `pause`/`confirm`/`hide`/`restart`/`quit` and run event through `nextScreen` in one `dispatch` — entering `paused` stops the clock, clears the stepper and quiets the music, leaving it brings both back (and turns over a level whose clear animation finished behind the panel), `quit` abandons the run and shows the title again, `restart` abandons and runs the 3-2-1, and the snapshot gained `screen` plus `summary` on `over` (the HUD fields unchanged); new `components/Overlay.tsx` renders nothing while playing, a `role="dialog" aria-modal="true"` Paused panel (Resume, Restart, Quit to title) and the game-over summary panel (Retry, Menu) from the snapshot with real buttons, focusing the first when a panel appears — Enter on Retry restarts exactly once because `actionFor` already keeps Enter off the global confirm while a button has focus; `.game-over-message` in `styles/globals.css` is now the dark panel behind both, not the solid red sheet.
- Put the game behind a real title menu: new pure `game/menu.ts` (`MenuItem`/`menuItems()` — Play first, then How to play, ids unique — `moveFocus(index, count, action)` stepping with wrap-around for up/left and down/right and keeping the index for anything else, 0 for an empty menu, and `HOWTO`, the rules as sprite-and-sentence lines of at most 90 characters each covering the exit, the always-draining energy, the Knot rewiring the maze with dashed marks opening and hatched sealing, the tolls enemies show, the five pieces of gear and the controls including swipe, Esc and M), covered by `game/menu.test.ts` (the wrap cases, unknown actions keeping the index, count 0, the first id being `play`, every HOWTO image existing on disk under `public` via `node:fs`, every text within the limit); `game/screens.ts` gained the `howto` screen and the `howto` and `back` actions — title+howto opens it, and confirm, Esc or back closes it to the title, or straight to the countdown when the context flag `howtoFromPlay` says the first Play opened it — with the transitions covered in `game/screens.test.ts`; `lib/GameState.ts` stopped hiding the title by element id (no `getElementById('title-screen')` any more, and the countdown number is now `.game-countdown`), `play()` starts the countdown unless `save.seen.howto` is unset — then it shows the how-to first, sets the flag and writes the save so it never nags again, and `openHowTo()` opens it on request with the button reading Back; the snapshot carries `best` and `howtoFromPlay` so `components/Menu.tsx` can stack the real-text buttons over the title art with a dark gradient covering the painted START and the best score underneath, focusing the first button when the menu appears and moving the focus with the arrow keys through `moveFocus` (Enter on the focused button activates it alone, since `actionFor` keeps the global confirm off a focused button), and `components/HowTo.tsx` lists the lines with their sprite to the left (empty alt — the sentence carries the meaning) and one Start/Back button; `app/page.tsx` dropped the clickable title `<img>` and lets the shell's screen decide — the art shows on title, howto and countdown (dimmed under the 3-2-1, which still runs as before); new `.title-menu`, `.menu-buttons`, `.game-countdown` and `.howto-panel` rules in `styles/globals.css` replace `#title-screen`.
- Synthesized the sound effects: new pure `game/audio/voice.ts` (`Voice` — wave, `freq` with optional `freqEnd` glide, `at`/`dur` in seconds from the trigger, `gain`) and `game/audio/sfx.ts` (`noteHz(degree)` on a minor pentatonic from 220 Hz with semitone steps 0/3/5/7/10 so degree 5 is 440 and -5 is 110; `sfxFor(event, { streak, energyPct, depth })` — a near-silent tick for `move`, a falling thud for `blocked`, two quick rising notes from the clamped streak degree for `pickup`, a falling saw over a low square for `fight`, a four-note rising arpeggio for `levelClear`, one soft low note for `levelStart`, three slow falling notes for `dead`, `[]` for anything undesigned; `beepVoices(n)` for the 3-2-1 and a higher go-beep for 0; `warnVoices()`, a soft double pulse), covered by `game/audio/sfx.test.ts` (scale anchors and monotonic rise, every event type finite between 40 and 4000 Hz with gain above 0 and at most 0.5, positive durations, whole sound within 1.5 s, streak 3 starts above streak 2, streak 40 clamps under 4000 Hz, unknown types silent); new `lib/audioEngine.ts` (`AudioEngine`, built on an injected `() => AudioContext`-like factory and never naming a browser global itself — `unlock()` creates or resumes the context and builds the `"sfx"` and `"music"` gain buses, `play(voices, bus)` puts one oscillator plus one gain node on the bus per voice, each faded in and out over 8 ms so nothing clicks, `setVolume(bus, v)` and `setMuted(b)` ride the remembered volumes, and before `unlock()` — or forever after a factory that throws — every method is a silent no-op), covered by `lib/audioEngine.test.ts` with a fake context (no nodes before unlock, three voices make three oscillators, a throwing factory stays silent through every call, muted play creates no sound, volumes clamp, a refused oscillator is skipped without throwing); `lib/sound.ts` shrank to the music loop alone — the five effect samples, their `play(name)` and their tests are gone (the files in `public` stay for now, nothing loads them any more); and `lib/GameState.ts` now routes every run event through `sfxFor` and the engine, counts the pickup streak per level (reset on `levelStart`), beeps the countdown with `beepVoices` including the go, pulses `warnVoices()` about once a second while playing under 25% energy, and sets the effects bus from `save.settings.sfxVol` (default 0.7), with the first gesture unlocking music and engine together and M silencing both.
- Replaced the 2.2 MB music loop with a small generative sequencer: new pure `game/audio/music.ts` (`tempoFor(depth)` = `min(150, 96 + 4 * (depth - 1))` keeps the old idea of music that speeds up as you go deeper; `musicStep(step, { depth, energyPct })` writes the voices for one sixteenth of a 32-step pattern — a low triangle bass on a fixed rhythm, a square arpeggio over `noteHz`'s pentatonic whose figure changes between the pattern's two halves, from depth 4 a second arpeggio a fourth above, from depth 7 an octave sparkle on the off-beats, and below 25% energy no bass at all but a short high pulse on every second step — all deterministic, every voice 40 to 4000 Hz with gain above 0 and one step's gains summing well under 0.6; `class Sequencer` (`start(now)`/`stop()`/`setState(state)`/`advance(now, lookahead = 0.2)`) hands out every step starting before `now + lookahead` exactly once with absolute audio-clock times, its step length `60 / tempo / 4` taken at the moment a step is scheduled so a depth change only bends later spacing, and a sequencer left behind (throttled tab, long pause) catches up to the present instead of flooding; covered by `game/audio/music.test.ts` (tempo anchors, determinism, frequency/gain bounds and the 0.6 sum over every depth and energy, the bass-less low-energy mix with its 800 Hz pulse on 12+ steps, depth 7 layering over depth 1, the exactly-once 156.25 ms spacing over 10 s, the no-flood big jump, mid-run tempo changes and the stop/start rewind). `lib/audioEngine.ts` grew `now()` (the context's clock, 0 before unlock) and an optional absolute start time on `play(voices, bus, time?)`, tested with the fake context; `lib/GameState.ts` makes the `Sequencer` on the first gesture, ticks it every 50 ms while the screen is `playing` or `clear` (each step to `play(voices, 'music', time)`), stops it on pause, game over, the title and a hidden tab, feeds it `{ depth: run.level, energyPct }` on every HUD change, and sets the music bus from `save.settings.musicVol` (default 0.5); `lib/sound.ts`, its test and every reference to the loop file are gone — mute and both volumes now go through the engine alone.
- Taught the board to answer the player: new pure `game/fx.ts` (`Fx` union — `bump`, `pop`, `burst`, `flash`, `shake`, `zoom`, `fade` with tones `gold`/`red`/`teal`; `fxFor(event, { motion, exit })` — blocked bumps, pickup pops plus a gold burst of 5, fight throws a red burst of 8 with a 120 ms red flash and a 4 px/150 ms shake, levelClear bursts teal 14 at the exit and zooms toward it for 300 ms, levelStart fades 200 ms, dead flashes red 400 ms and shakes 8 px for 300 ms; `reduced` motion keeps only pops and fades, never bump/burst/shake/zoom; unknown events give `[]`; `class FxLimiter` allows at most 3 shakes and 3 flashes in any 1000 ms, each kind counted on its own; `lowEnergy(pct)` is true only under 0.25; counts clamp at 20 and durations at 500 ms), all numbers in `game/config.ts` as `FX`, covered by `game/fx.test.ts`; `lib/board.ts` grew `play(fx)` — sparks are `.spark` squares on the fx layer removed on `animationend` with a timeout behind it and capped at 60 alive (oldest first), the bump nudges the player's inner element (the facing flip moved to a `--sprite-flip` variable so the nudge keeps it), flash and fade veil the board, shake and zoom animate the board container (not the page) — plus `setLowEnergy(on)`, which puts `low-energy` on the board for a slow vignette-and-energy-bar breath (one cycle 1.6 s); `lib/GameState.ts` maps every event through `fxFor` and the `FxLimiter` (matchMedia reads the reduced-motion ask, `performance.now()` feeds the window), toggles the low-energy class from `lowEnergy(energyPct / 100)` on each HUD pass, and waits the zoom's 300 ms (0 ms reduced) before `run.nextLevel()` instead of the old overlay; `triggerLevelCompleteAnimation`, the `#level-complete-animation` element and its CSS are gone; `styles/globals.css` adds the effect animations and a `@media (prefers-reduced-motion: reduce)` rule that stops the drifting galaxy background.
- Gave the player a settings screen and the HUD a voice: new pure `game/settings.ts`
  (`Settings` — `musicVol` 0.5, `sfxVol` 0.7, `muted`, `motion` `system`/`full`/`reduced`,
  `contrast`, `textScale` 1/1.25/1.5, `shake` true; `sanitizeSettings` checks and defaults
  every field on its own, clamps volumes to 0..1 and keeps unknown extra fields untouched
  for later cards; `resolveMotion(setting, systemReduced)`; `SETTING_ROWS` — id, label,
  kind and choices — so `components/Settings.tsx` is one loop of labelled native controls
  (range inputs with a printed value, checkboxes, radio groups) plus a Back button;
  `announcement(prev, next)` over two HUD snapshots says `Energy low` once when the energy
  crosses below 25%, `Level N` when the level changes and `Paused`/`Game over` on those
  screens), covered by `game/settings.test.ts`; `game/screens.ts` adds the `settings`
  screen — opened from `title` and `paused` by the new `settings` action, returning to
  where it came from on `back` or Esc through the `settingsFrom` context, the clock never
  running behind the panel — and `game/menu.ts` adds the Settings entry;
  `lib/GameState.ts` loads the save through `sanitizeSettings`, re-applies everything on
  each `setSetting` (bus volumes and mute to the engine, `data-motion`, `data-contrast`
  and `--ui-scale` on the root element, shake off drops every `shake` effect, the motion
  setting overriding the matchMedia ask), carries `settings` and the latest
  `announcement` in the snapshot, and opens/closes the panel with `openSettings`/
  `closeSettings` (a settings visit from the pause keeps the pause's origin);
  `components/Hud.tsx` hides the stat emoji from readers, gives both bars
  `role="progressbar"` with `aria-valuenow`/`min`/`max` and an `aria-label`, and shows
  the latest announcement in a visually hidden `aria-live="polite"` region; the pause
  panel gained a Settings button; and `styles/globals.css` adds
  `[data-motion="reduced"]` (galaxy still, no board transition over 150 ms),
  `[data-contrast="true"]` (white 2 px outlines on enemies, pickups, the exit and the
  player, thicker forecast marks, the galaxy at 40% and static, HUD pure white on solid
  black) and `--ui-scale` sizing for the HUD and panels.
- Made touch screens first-class (owner decision Q15: swipe-and-hold is the default):
  `game/swipe.ts` gained the pure `TouchTracker` (`start`/`move`/`end`/`cancel` hand back
  `TouchOp`s — a direction is pressed once the finger reaches 24 px from its anchor along
  the dominant axis and the anchor re-anchors there, sliding to another direction releases
  the old one and presses the new, continuing along the held one never re-presses, `end`
  releases what is held and hands back a single tap only when nothing was ever pressed and
  the old `classifyTouch` tap rule still holds, so a quick flick stays exactly one step),
  covered by `game/swipe.test.ts` including a one-second hold through the `Stepper`
  (~nine steps); `game/fx.ts` gained `hapticFor(event)` (pickup 10 ms, fight 30, dead 80,
  anything else 0) and `lib/GameState.ts` calls `navigator.vibrate` only when haptics are
  on, the value is above 0 and the device has a vibrator, alongside the new `pressDir`/
  `releaseDir` (the Stepper's own cadence for touches and the D-pad) and `togglePause`;
  `game/settings.ts` gained `touch: "swipe" | "dpad"` (default swipe) and `haptics`
  (default true) with their rows; `components/TouchLayer.tsx` now feeds one finger into
  the tracker and passes press/release ops to the shell; `components/DPad.tsx` is the new
  optional cross of four 56 px buttons (pointerdown presses, pointerup/pointerleave/
  pointercancel release, labelled for readers), shown below the board on coarse-pointer
  devices when `settings.touch` is `"dpad"`, next to the 44 px `aria-label="Pause"`
  button at the board's top right; `app/layout.tsx` exports a `viewport`
  (`device-width`, `initialScale: 1`, `viewportFit: "cover"`, zoom untouched) and
  `styles/globals.css` pads the page with `env(safe-area-inset-*)` and styles the D-pad
  and the pause button.
- Shipped the first two promised items (owner decision Q16: hand-drawn SVG icons in the
  game's teal and gold): `game/tools.ts` defines the `ToolId` pair `anchor`/`twist` with
  `TOOL_IDS` and `TOOL_INFO` (name plus one-line hint), and `game/config.ts` gained
  `anchorMoves: 6` and `toolMax: 3`. `game/plan.ts` puts `tools` in the level plan
  (one at depth 1 and every even depth, none otherwise) and `game/spawn.ts` places that
  many tool pickups from the cells the gear did not take, each type drawn from the rng
  after the gear so leaving `tools` out of a call changes nothing else. `game/run.ts`
  carries `tools` charges (0 at `start()`, kept across levels, capped; a pickup beyond
  the cap still scores and emits its `+1 Anchor` / `+1 Twist` pickup event) and
  `useTool(id)`: the Anchor empties the forecast and freezes the maze for the next six
  successful moves (`run.anchored` counts them down; blocked moves do not spend one),
  the Twist rerolls the walk for the next move; both need a charge, only run while
  playing, refuse while an Anchor holds, and a successful use emits `tool { id }`
  (`game/events.ts`). `game/keys.ts` binds `tool1`/`tool2` to Digit1/Digit2,
  `game/audio/sfx.ts` gives the tool event its sound, and `game/menu.ts` explains the
  pair in one how-to line. The shell's snapshot carries `tools` and `anchored`; the new
  `components/ToolBar.tsx` in the HUD shows icon, name, key hint and charge count per
  tool (disabled at 0, click or tap spends one via `GameState.useTool`),
  `lib/board.ts` toggles `.knot-frozen` on the Knot while anchored (no pulse, dashed
  ring) and draws tool pickups with `.item_anchor` / `.item_twist` over
  `public/images/tools/*.svg`; `game/tools.test.ts` plus new `game/run.test.ts` cases
  cover the freeze, the reroll, the caps and the refusals, and the forecast baseline in
  `game/forecast.test.ts` was re-captured for the new tool-pickup draws.

- Added the Cut tool: `game/maze.ts` gained `reroot(x, y)` (re-roots the pointer
  tree at any cell by reversing the path to the origin and clearing the chosen
  cell's pointer, opening and closing no wall; out-of-bounds or a pointer that
  does not lead to the origin changes nothing), `game/tools.ts` added `"cut"` to
  `ToolId`/`TOOL_IDS`/`TOOL_INFO` with a `minDepth` of 3 and a `toolsFor(depth)`
  the spawner now draws tool pickups from (so Cut pickups only appear from depth
  3), `game/run.ts` spends a charge on `useTool("cut", dir)`: refused without a
  direction, at the edge, through an open wall, while anchored, without a charge
  or outside `playing` — otherwise it re-roots at the player, steps the Knot to
  the neighbour (that wall opens, the neighbour's former link closes), re-rolls
  the forecast and emits `tool { id: "cut", dx, dy }` while the player neither
  moves nor spends energy. `game/keys.ts` binds `tool3` to Digit3; the shell
  arms Cut instead of firing it (the snapshot carries `armed: "cut" | null`, the
  next key/swipe/D-pad direction goes to `useTool("cut", dir)` and disarms
  either way, and the key, button or Escape cancels; arming needs a charge),
  `lib/board.ts` flashes the opened wall tile gold, and `components/ToolBar.tsx`
  highlights the armed button with the hint "Choose a direction";
  `public/images/tools/cut.svg` joins the icons and new `game/maze.test.ts` /
  `game/tools.test.ts` cases cover the reroot invariants and the Cut's effects
  and refusals.

- Made gear permanent progress: `game/gear.ts` gave the five kinds (`boots`,
  `gloves`, `shield`, `speed`, `backpack`) capped levels with `statsFromGear`
  (attack 1 + 0.1 per gloves up to 3, defense 1 + 0.1 per shield up to 3,
  consumption 0.98^boots down to 0.6, speed 1.02^speed up to 1.5, storage
  100 + 5 per backpack up to 200), `gearCap` (gloves 20, shield 20, boots 26,
  speed 21, backpack 20), `sanitizeGear` and `addGear`, all numbers in
  `GEAR_RULES` (`game/config.ts`); `game/run.ts` now keeps `banked` and
  `carried` and derives `stats` from their sum, a gear pickup raises `carried`
  (one arriving at the cap gives +10 energy instead), the exit banks what was
  carried behind a `banked` event and death empties it, the `dead` event
  telling how many were `lost`; `game/save.ts` gained `resetProgress`, the
  shell builds its run from `sanitizeGear(save.gear)`, writes the save on every
  `banked` event, shows a "Carried: n" marker in the HUD, grew `Gear banked`
  and `Gear lost` summary rows and a twice-asked "Reset progress" button in
  settings, and `lib/player.ts` is gone with the look living in the shell and
  the save; `game/gear.test.ts` covers the curves, caps and sanitizer and new
  `game/run.test.ts` / `game/save.test.ts` cases cover banking, loss and the
  wipe.


- Added the four ways to play: `game/modes.ts` (pure) holds `ModeId` with
  `MODE_IDS` in order, `ModeRules` and `MODES` (Descent the game as it is,
  Sprint five gearless levels against the clock, Zen no clock with steps at
  double cost, Daily one seeded maze per calendar day without gear, blurbs at
  most 60 characters), `dailySeed(yyyymmdd)` (a 32-bit avalanche hash of the
  date number, always 0..2^32-1), `betterScore(mode, a, b)` (higher for score
  modes, lower for time modes, any value beats `undefined`) and
  `cycleMode(id, step)` (wrap-around stepping); `game/run.ts` takes
  `mode: ModeRules` (default Descent), so `clock: false` drains no energy
  while the tally still counts the time, a step costs `consumption *
  stepFactor`, `gear: false` pins the stats to `statsFromGear(noGear())` for
  the whole run and turns a gear pickup into a `+10 Energy` top-up with
  nothing banked at an exit, and clearing the last level of a `levels: 5`
  Sprint sets the new `done` phase with one `finished { ms }` event (new in
  `game/events.ts`) and no sixth level; `game/screens.ts` added the `finished`
  action to the summary, `formatTenths` and summary rows naming the mode on
  every run and reading `Finished in m:ss.t` for a finished Sprint;
  `lib/GameState.ts` reads the local date for `dailySeed(today)` (the only
  `Date` outside the shell), exposes `setMode(id)` on the title (remembered in
  `save.settings.mode`) and `stepMode(step)`, reads and writes bests per mode
  through `betterScore` (Sprint stores milliseconds, only for finished runs),
  keeps `save.totals.dailyDay` and clears `save.best.daily` when the day
  changes, and builds every run fresh under the mode's rules;
  `components/Menu.tsx` shows a mode row above the buttons — the name between
  two arrow buttons, the blurb and the best underneath, Left/Right cycling
  through `cycleMode` while the row is focused and the arrows answering clicks
  and taps — and `components/Overlay.tsx` titles a finished run "Run
  complete"; `styles/globals.css` adds `.mode-row`, `.mode-picker`,
  `.mode-name`, `.mode-blurb` and `.mode-best`; new `game/modes.test.ts` plus
  cases in `game/run.test.ts` and `game/screens.test.ts` cover the rules, the
  bot's five-level Sprint, the gearless runs, the daily determinism and the
  summaries.

- Added the Stalker, the enemy that hunts the player down: `game/config.ts`
  gained `enemyKinds.stalker` (hp 3, power 6, `fromDepth: 4`, the wisp's toll
  and no drops) plus `stalkerEvery: 2`, `stalkerMinDist: 4` and
  `stalkerPairDepth: 8`; `game/enemies.ts` knows the fourth kind
  (`ENEMY_KINDS`, `ENEMY_KIND_LIST`) while `enemyFor` still draws only wisp,
  brute and warden; `game/spawn.ts` assigns the kind itself — one stalker from
  depth 4, two from depth 8, replacing enemies rather than adding to the
  count, preferring wisps, always keeping at least `stalkerMinDist`
  (|dx| + |dy|) from the start by moving to a free farther cell, and falling
  back to a wisp when none is free, all without drawing the rng; `game/run.ts`
  counts the successful moves of each level and, every `stalkerEvery`-th one
  once that move's pickups, fights and maze shift are done, lets each stalker
  take one step along `routeCells` toward the player as the maze stands then —
  it waits instead of stepping onto the exit or another enemy's cell, and
  waits when no route exists; a step onto the player pays the toll at once (a
  `fight` event with `by: "stalker"`, death cause `fight` when the energy
  cannot cover it) and every stalker move emits a `stalker { id, x, y }`
  event (new in `game/events.ts`); each stalker also carries `enemy.intent`,
  the neighbour it means to step to next, recomputed from the current maze
  after every successful player move and null when no route exists, and
  stalkers keep walking while an Anchor holds the maze still;
  `RunOptions.shiftsOverride` lets tests pin the shifts per move;
  `lib/board.ts` draws the intent as a `.mark-intent` chevron pointing from
  the stalker toward that cell and `styles/globals.css` gives the stalker a
  red pointed marker and a faster bob on the one enemy GIF, with a quiet low
  note for `stalker` events in `game/audio/sfx.ts`; `lib/GameState.ts` floats
  "Something is following you" at the start of the first stalker level; new
  `game/stalker.test.ts` covers the depth rules, the every-second-move walk,
  the wall/board/exit/shared-cell invariants over 20 seeded shifting runs,
  the intent, both fight directions and determinism, and the
  `game/forecast.test.ts` baseline was re-captured for the new events.

- Tied named twists to the deep levels: the new pure `game/modifiers.ts` has
  `ModifierId = "blackout" | "storm" | "hoard"`, `MODIFIER_IDS`, `MODIFIER_INFO`
  (each twist's display name and a banner line of at most 70 characters),
  `modifierFor(depth, rng)` (null unless `depth >= MODIFIER_RULES.firstDepth`
  and `depth % MODIFIER_RULES.everyDepths === 0`, then one of the three drawn
  with the rng — which a plain depth never consumes), `applyModifier(plan, id)`
  (a fresh plan: Storm caps `shifts * 2` at `stormShiftMax` and adds
  `stormExitBonus` to `exitBonus`, Hoard doubles both ends of `items` and adds
  `hoardExtraEnemies`, Blackout only adds `vision: blackoutVision`, null leaves
  it unchanged) and `visibleCells({ size, player, knot, exit, walk, radius })`
  (a `[y][x]` grid: true within the Chebyshev `radius` of the player, on the
  Knot, on every forecast-walk cell and on the exit), all the numbers in
  `MODIFIER_RULES` in `game/config.ts`; `game/run.ts` takes a `modifiers`
  option (default on), builds each level from
  `applyModifier(levelPlan(level), modifierFor(level, rng))`, keeps the twist
  in `run.modifier` and the radius in `run.vision`, shifts and pays the exit
  from that modified plan (so a Storm level shifts twice as much and its exit
  adds 75, capped at storage) and the `levelStart` event (now in
  `game/events.ts`) carries `modifier`; `lib/board.ts` recomputes the view on
  every update — on a Blackout level tiles outside it get `.unseen` (6%
  opacity) and the items and enemies on those cells hide, while wall tiles
  touching two visible cells stay lit, the Knot, the exit and the forecast
  marks always show — and its new `banner(name, line, ms)` stands the twist's
  name and line over the board for `bannerMs` milliseconds, which
  `lib/GameState.ts` calls on a `levelStart` that carries a twist and repeats
  into the live region; `game/audio/sfx.ts` answers the plain low note with a
  bright high one on an entangled level; `game/bot.test.ts` pins the baseline
  curve with `modifiers: false` and adds the twisted threshold (at 4 moves a
  second, at least 20 of 40 seeds reach depth 4 — measured 38), and
  `game/forecast.test.ts` replays its two baselines with `modifiers: false`
  (re-captured with the `modifier` field); covered by `game/modifiers.test.ts`
  and the `Run modifiers` cases in `game/run.test.ts` (plain depths, all three
  twists over 300 seeds, no-mutation, the caps, the Blackout view, the Storm
  bonus and its cap, same seed same twists, and a Hoard size-5 level never
  placing more things than the 23 free cells).

- Made the deploy ready: `app/layout.tsx` now exports real `metadata` — the
  title, a one-sentence description, `metadataBase` from
  `NEXT_PUBLIC_SITE_URL` through the new pure `siteUrl(value)` helper in
  `app/meta.ts` (a valid absolute URL is used as-is, anything else — unset,
  blank or unparseable — falls back to `http://localhost:3000` instead of
  throwing, covered by `app/meta.test.ts`, whose folder `vitest.config.ts`
  now includes), `openGraph` and `twitter` entries on `/images/title.png`
  (the 500 x 500 title art doubling as the share image), `manifest:
  '/manifest.webmanifest'`, a `themeColor: "#08412c"` added to the existing
  `viewport` (pinch zoom untouched, still allowed) and a `<noscript>` line in
  the body saying the game needs JavaScript; the new `app/manifest.ts`
  serves the name, short name, description, `start_url: "/"`,
  `display: "standalone"`, the game's background and theme colours and the
  title art as a 500 x 500 icon; `app/error.tsx` (client) shows a short
  line, the error's digest when Next passed one and a "Try again" button
  calling `reset()`, `app/not-found.tsx` a line and a link home, both in the
  game's colours through the new `.status-page` block in
  `styles/globals.css`; `package.json` gained `"check": "npm run build &&
  tsc --noEmit && vitest run"` and `.github/workflows/ci.yml` runs exactly
  that on every push and pull request (checkout@v4, setup-node@v4 with
  `node-version-file: .nvmrc` and npm cache, `npm ci`, `npm run check`,
  `permissions: contents: read`, no secrets; no lint step because there is
  no lint script); and `README.md` was rewritten around what the code holds
  today — the two links and the CaptainLuma credit kept, the leaderboard,
  in-game minting and gear-written-to-the-NFT claims gone, how to play
  (controls, energy, the Knot and its forecast, enemies, gear, tools, modes,
  feats and wardrobe), the optional read-only wallet, Develop, Project
  layout, Environment variables (`NEXT_PUBLIC_SITE_URL` only) and Deploy
  (Vercel, merge to `main` publishes, check the preview) added.

- Brought linting back on ESLint 9's flat config: the new `eslint.config.mjs`
  spreads `eslint-config-next/core-web-vitals`, ignores `.next/**`,
  `node_modules/**`, `public/**` and `next-env.d.ts`, and switches
  `@next/next/no-img-element` off because the pixel-art sprites and tiles are
  plain `<img>`s on purpose; `package.json` gained `"lint": "eslint ."` and
  the `check` script now ends with it (CI runs `check`, so lint joins every
  push and pull request unchanged). Seven errors were fixed and none needed a
  rule disabled: `app/page.tsx` keeps creating the shell inside the effect
  (never during server rendering) but hands it to React through a microtask
  instead of a synchronous setState, and `useCoarsePointer` reads the
  matchMedia query through `useSyncExternalStore`; `Menu`, `Settings` and
  `Controls` now reset their transient focus/arming/capture state with
  render-time state adjustments instead of setState-in-effect, and
  `TouchLayer` refreshes its latest-callback refs from an effect. The two
  safe warnings went with them — the HUD's wallet callback lists `gameState`
  and the config file exports a named constant — leaving 0 warnings; one
  inline `eslint-disable` (a stable-callback effect in `Controls`) remains.

- Moved the wallet's RPC host out of the source and made the loader safe: the
  old `lib/helius.ts` (hard-coded provider host, unchecked replies, throws
  inside an unawaited promise) is replaced by `lib/reptile.ts` — `rpcUrl()`
  reads `NEXT_PUBLIC_RPC_URL` and only accepts a non-empty `https://` URL,
  `findReptile()` walks the asset list defensively and builds the look through
  `sanitizeLook` (an NFT changes the look only, never stats or the high
  score), and `loadReptile()` never throws, answering `found`/`none`/`error`;
  all covered by `lib/reptile.test.ts`. The HUD's wallet box moved to
  `components/WalletBox.tsx` (connect button, Assets button, image and one
  status line: "Loading...", "No Entangled Reptile in this wallet" or "Could
  not reach the network"); `WalletContextProvider` uses `rpcUrl()` and, when
  it is null, renders plain children, and the HUD then leaves the wallet box
  out entirely. **The wallet needs `NEXT_PUBLIC_RPC_URL` set to an
  `https://` RPC endpoint, or the wallet box stays hidden.**

- Cut the first visit's weight: the wallet now arrives on demand. `app/layout.tsx`
  no longer wraps the app in `WalletContextProvider`; the HUD shows a plain
  **Wallet** button (`components/WalletGate.tsx`, only when `rpcUrl()` is set) that
  pulls in the panel with `next/dynamic` (`ssr: false`) — the panel is
  `components/WalletBox.tsx`, which now carries its own provider (and with it the
  wallet CSS import) and renders the connect button and the reptile loader under
  it, their hooks unchanged; the button reads "Loading..." while the chunk is in
  flight, and with `NEXT_PUBLIC_RPC_URL` unset there is no button and the wallet
  chunk is never requested. Added `scripts/first-load.mjs` (sums the
  `/_next/static/...js` files the prerendered `.next/server/app/index.html`
  references, prints the kB total and exits 1 above `--max-kb`; wired up as
  `npm run size`) and `scripts/shrink-assets.mjs` (sharp; never enlarges, safe to
  re-run), which re-encoded `public/images/galaxy2.jpg` from 2400 px / 1.4 MB to
  1280 px / 124 kB at quality 72. Deleted the media nothing in `app`, `components`,
  `lib`, `game` or `styles` references any more: `images/galaxy.jpg`,
  `images/player.gif`, `images/sagamonke.gif`, `drum-loop.mp3`, `standoff-loop.mp3`,
  `pickup.wav`, `fight.wav`, `levelup.wav`, `beep.mp3` and `lost.mp3`. The drifting
  galaxy moved to a `#maze::before` layer (absolutely positioned, half a board
  beyond every edge, behind the tiles) animated with `transform` only — translate
  and scale — so the board is no longer repainted every frame; the reduced-motion
  and high-contrast asks still stop or dim it, and `lib/board.ts` now preloads the
  sixteen wall pictures once when the board mounts, so a wall that changes never
  flashes empty. **First-load JavaScript: 1137.8 kB before, 663.7 kB after
  (uncompressed); `public`: 8.0 MB before, 1.5 MB after.**
- E41: Drew the maze in production builds and let a long slide turn: `lib/GameState.ts`
  `mountBoard()` is public (its constructor call stays, a no-op while `#maze` is missing), and
  `GameShell` in `app/page.tsx` gained `useEffect(() => { gameState.mountBoard(); }, [gameState]);`
  so the board mounts once the element is really in the page — before this a production build
  showed the title and HUD over an empty maze, since the GameState was created while the page
  still read "Loading..." and React's double setup only hid it in development; mounting twice
  stays harmless because `Board.mount` uses `replaceChildren`. `TouchTracker.move` in
  `game/swipe.ts` now moves the anchor to the current point whenever the finger keeps travelling
  in the held direction (no operations returned), so after a 300 px slide a 30 px perpendicular
  flick turns instead of having to beat the whole horizontal run from the original anchor; the
  class doc comment says so and `game/swipe.test.ts` pins the long-slide-then-turn sequence.
- E42: Put the design system's foundations on every route: `app/layout.tsx` now imports, in order,
  the fontsource CSS for Silkscreen (400, 700) and Atkinson Hyperlegible (400, 700),
  `design/tokens.css`, `design/components.css` and `styles/globals.css`, so the 404 and error routes
  are styled too (the globals import left `app/page.tsx`); the fonts come from the
  `@fontsource/silkscreen` and `@fontsource/atkinson-hyperlegible` packages, never from Google
  Fonts. `styles/globals.css` drops the green-to-purple gradient: `html, body` now sit on the flat
  `var(--void)` ground with `var(--ink)` text in `var(--font-body)`, and every `img` renders with
  `image-rendering: pixelated` so sprites and tiles stay crisp; all other selectors wait for their
  screen-by-screen cards. `app/not-found.tsx` and `app/error.tsx` are rebuilt on the StatusPage
  pattern (`me-statuspage`, `me-btn me-btn-primary`, a `.me-statuspage-strip` of three 48px
  sprites): "404 / No corridor here / That page is not in this maze." with the two wall tiles and
  the exit, and "The maze tangled itself" with an enemy between walls, keeping the digest line and
  the "Try again" button that calls `reset()`. The theme colour stays `#08412c`.

- E43: moved the controls and overlays outside the board onto the design system's
  parts and deleted the old copies from `styles/globals.css`. Every button in
  `components/Menu.tsx`, `Overlay.tsx`, `Settings.tsx`, `HowTo.tsx`, `Feats.tsx`,
  `ToolBar.tsx` and `Controls.tsx` is a `me-btn` (Play, Resume, Retry and the
  panels' Back are the one primary per screen, Reset progress is
  `me-btn-danger`, the tool buttons carry name, key and count as text with no
  SVG icons until pixel tool sprites exist); the pause, game-over, settings,
  controls, how-to and feats sheets are one `me-panel` (with `me-panel-title`,
  `me-panel-body`, `me-panel-actions`, `me-summary` and `me-divider`) centred on
  `me-scrim`, at most 480px wide, scrolling inside with the scrollbar hidden;
  the title menu is a `me-menu` with the `me-mode` picker below the painting's
  own band, never over its lettering; the D-pad is `me-dpad` with `me-btn` keys
  and CSS `me-arrow`s; the touch pause button is a `me-btn me-btn-icon` with
  `me-pause-bars` and the shell hides it, and the D-pad, whenever a panel
  (pause, game over, settings, controls, how-to, feats, wardrobe) is open; the
  entanglement banner and the floating event line follow the Toast pattern
  (`surface` on a `line`/gold border, `drop-hard`, display type, no blur).
  Removed selectors: `.title-gradient`, `.menu-buttons` (+ its `button` and its
  `:hover`/`:focus-visible`), `.menu-best`, `.mode-row` (+ `:focus-visible`),
  `.mode-picker` (+ its `button` and its `:hover`/`:focus-visible`), `.mode-name`,
  `.mode-blurb`, `.mode-best`, `.howto-panel`, `.game-over-message` (+ its `p`),
  `.summary`, `.summary-line`, `.summary-label`, `.summary-value`,
  `.overlay-buttons button` (+ its `:hover`/`:focus-visible`), `.settings-panel`
  (+ its `p`), `.settings-rows`, `.settings-row` (+ its `label`, its
  `label:first-child`, its `input[type="range"]` and its
  `input[type="checkbox"]`/`[type="radio"]`), `.settings-radio`,
  `.settings-toggle`, `.settings-choice` (+ its `legend`), `.settings-value`,
  `.settings-panel .overlay-buttons button` (+ its `:hover`/`:focus-visible`),
  `.feats-panel` (+ its `p`), `.feats-panel .overlay-buttons button` (+ its
  `:hover`/`:focus-visible`), `.toolbar`, `.tool-button` (+ `:disabled`),
  `.tool-icon`, `.tool-name`, `.tool-key`, `.tool-count`, `.tool-anchored`,
  `.tool-button.tool-armed`, `.tool-armed-hint`, `@keyframes tool-armed-pulse`,
  `.dpad`, `.dpad-btn` (+ `:active`) and `.dpad-up`/`.dpad-left`/`.dpad-right`/
  `.dpad-down`. Kept for the wardrobe, the later card that still draws its own
  sheet: `.overlay-title`, `.overlay-buttons` and the `.wardrobe-*` family; the
  HUD, the board, the wallet box and the countdown keep their own selectors, and
  `.settings-label`, `.controls-row`, `.controls-label`, `.controls-key`,
  `.howto-list`, `.howto-line`, `.howto-sprite`, `.howto-text`, `.feats-list`,
  `.feats-row`, `.feats-name`, `.feats-text`, `.feats-state`, `.me-dpad`
  (placement), `.pause-button` (placement), `.title-menu`, `.title-art`,
  `.level-banner` and `.message` stay as token-based layout or pattern rules.

- E44: made the HUD the design's `HudBar` (design/components/HudBar).
  `game/sprite.ts` gained the pure `pfpLayers(look)` — the 16-grid portrait
  masters `/images/nft/<Layer>/<Trait>pfp.png` in draw order, `None` skipped
  and unknown traits falling back exactly as the runner does — tested in
  `game/sprite.test.ts` (all five layers, a skipped `None`, the fallback, and
  every pfp file on disk). `game/hud.ts` gives the model an `energyLow` flag
  (game/fx.ts lowEnergy over the bar percentage, compared by sameHudModel) and
  `energyText`/`scoreText` are now plain number texts the HUD pairs with its
  own labels. `components/Hud.tsx` renders `#hud` as one wrapping `me-hud` row
  at the board's width: a `me-portrait` stacking the current look's
  `pfpLayers` as pixelated `<img>` layers at 48px (the PFP, never the runner,
  built locally so it always matches the loadout), the energy and score meters
  as `me-meter`s (`--energy` teal, score `is-gold`, numbers in the display
  face), the four stats as `me-stat`s with the 24px gear sprites — gloves
  attack, shield defense, speed clock, boots step cost — and no emoji, the
  `me-carried` marker and the tool row. Low energy now reaches the bar itself:
  the meter takes `is-low`, the label and number turn to danger and the label
  reads "Energy low", and the breathe pulse moved from the unreachable
  `.low-energy #energy-bar-inner` to `.me-meter.is-low > i` (stilled under
  reduced motion). `components/WalletBox.tsx` no longer shows the remote NFT
  image in the HUD; a loaded reptile's look feeds the same portrait through
  the shell. `styles/globals.css` deleted the unused old HUD selectors (`#hud`
  box, `.asset-image`, `.right-box`, `.bar-container`, `#energy-bar`/
  `#progress-bar` and their inners, `.stats-container`, `.stat`,
  `.carried-marker`, `#stat-*`), restyled `.left-box` as the wallet box inside
  the row, and stacks the HUD below 480px on the `is-phone` pattern.

- E45: put the board on the design's pixel grid. `game/layout.ts` now raises
  `HEIGHT_SHARE` to 0.72 (the HUD has been one row since E44) and exports the
  art-grid size `PIXEL = 24`: `boardLayout` still floors the cell to whole
  pixels, then snaps it down to the largest multiple of 24 that fits whenever
  it can afford one, so a 1280x800 screen draws the first level's tiles at
  exactly 24 px; below 24 the plain whole-pixel cell stands, keeping small
  phones and the deep levels playable, and `blobRect` is untouched.
  `game/layout.test.ts` covers the new rule (24 px at 1280x800 with 21 tiles,
  the kept 17 px cell at 390x844 with 21 tiles, multiples of 24 whenever the
  cell reaches it). `styles/globals.css` dropped the Brute's 1.15 and the
  Warden's 1.3 `scale` — every enemy now draws at the cell size, the heavier
  kinds still told apart by their hard rings until their own sprites exist —
  and cleared the last blur from the board: the Knot keeps its gold ring, teal
  centre (both tokens now) and pulse without its radial gradient or `0 0 10px`
  glow, the frozen Knot keeps its dashed ring, and the stalker's marker and
  intent chevron lost their 1 px drop shadows. Tiles, entities and sprites all
  already render with `image-rendering: pixelated`; the galaxy drift and the
  reduced-motion and contrast rules are unchanged.

- E46: rebuilt the wardrobe as the design's trait grid and the wallet box on
  the WalletBox states. `components/Wardrobe.tsx` is now a `me-panel` on the
  scrim with `me-tabs` per layer and a `me-grid` of TraitCards: each card
  stacks the trait's PFP layer (from `pfpLayers`) over a ghost of the body,
  names it, and shows its state — `On` when equipped, the layer label when
  available, `New` for a trait unlocked since the panel was last closed, and
  `Locked` with the unlocking feat's name under a silhouette; feat-granted
  traits carry the three `is-feat` pips, free ones the `is-found` pip. The
  equipped card is `is-equipped`, choosing any other available card equips it
  through `setWardrobeLook`, and locked cards stay out of the button order but
  answer Tab so their hint can be read. Above the grid the current look shows
  twice at 144 px: the stacked PFP as "Your NFT" and the framed runner as "In
  the maze", with the "n of 22 traits" count and a gold meter over them. The
  New markers live in the save's existing `seen` record as
  `trait:<Layer>:<Trait>` keys: `GameState.openWardrobe` snapshots the
  wearable cards the save has not seen into the new `newTraits` snapshot
  field and `GameState.markTraitsSeen` marks them when the panel closes,
  `game/save.ts` now sanitizes `seen` to true flags, and
  `game/save.test.ts` proves old saves without any marker still load.
  `components/WalletBox.tsx` follows design/components/WalletBox: one
  `me-wallet` box with the connect button, a disabled "Check assets" and a
  busy `me-status` while looking up, the found reptile as a 48 px PFP with
  "Reptile #<n>" (the number read from the asset's name) and the shortened
  address, "No Entangled Reptile in this wallet" when the list holds none,
  and "Could not reach the network" with a Try again button on failure. In
  `lib/reptile.ts` a reply carrying a JSON-RPC `error`, or no `result` at
  all, is now that network failure instead of an empty wallet, covered by two
  new cases in `lib/reptile.test.ts`. `styles/globals.css` lost the old
  `.wardrobe-*` rows, `.wallet-actions`, `.wallet-status` and the unused
  `.overlay-title`/`.overlay-buttons`, and gained only the wardrobe sheet the
  design parts cannot say: the 720 px panel, the two-column layout, the
  stage sizes with their phone drops and the three-card phone grid. No chain
  feature was added: saving and minting come later.

- E47: fixed what the pre-merge review of E42-E46 saw at 1280x800 and 390x844.
  `styles/globals.css`: the wardrobe scrim (`wardrobe-scrim` in
  `components/Wardrobe.tsx`) is now `position: fixed; inset: 0` above the
  board, so the panel reaches the design's 720 px beside it and the design's
  `me-grid` fills several TraitCards per row instead of one card per row over
  a 1650 px scroll; a taller-than-the-phone panel scrolls inside the scrim on
  auto margins, and the stage's gold meter is `flex: none`, keeping its 16 px
  height instead of stretching down the column. `components/Hud.tsx` dropped
  the `me-row hud-top-row` wrapper: portrait, wallet button, meters, stats,
  carried marker and tools are direct children of the one wrapping `me-hud`
  row at every viewport width, and each stat label now carries both words
  (`hud-label-full` / `hud-label-short`) with the phone media query showing
  the HudBar's short Atk, Def, Clock and Step, so nothing runs off the edge
  at 390 px. `components/Menu.tsx` focuses the first menu button with
  `focus({ preventScroll: true })`, so the page stays at the top, the title
  painting keeps its whole band and the menu sits below it; the touch pause
  button (`app/page.tsx`) now stands down on the title and the countdown as it
  already did on every panel. The leftovers went too: `#maze-container`'s top
  corners are square, the closed wallet button in `components/WalletGate.tsx`
  is a `me-btn` (its `.wallet-open` sheet and the unused `.status-*` rules
  left `styles/globals.css`), and the New tag tells the truth:
  `lib/GameState.ts` only marks feat-unlocked traits as new (free traits never
  are), and `loadSave` in `game/save.ts` seeds the seen markers for every
  trait a marker-less old save's feats already unlocked, so such a save loads
  as already seen, all covered by the wardrobe cases in `game/save.test.ts`.

- E48: brought the galaxy's zoom drift back behind the board. `#maze::before`
  is now a 13-board layer (inset: -600%) tiled with one picture every 6 boards
  (background-size: 46.154%), and `@keyframes moveBackground` halves that to 3
  boards while panning 2 boards left and 1 board up over the same 45s
  ease-in-out alternate — the pre-E38 600% -> 300% zoom with its ~1000 x 500 px
  drift, scaled to the board, by transform only; `transform-origin` sits on the
  board's top-left corner where the old background-position anchored the zoom,
  and `#maze` gained `overflow: hidden` so the oversized layer never shows
  outside the board. Reduced motion and high contrast still stop and dim it.

- E49: finished the pre-merge design review at 1280x800 and 390x844. The HUD
  no longer sizes to the board alone: `styles/globals.css` gives `#hud` the
  larger of the board's width and 720px, never past the viewport minus the
  16px gutters, centred under the board (the rule wins over sizeBoard's
  inline width with `!important`), and `components/Hud.tsx` now renders two
  `me-hud-row` rows — row 1 portrait, wallet, meters and the carried marker,
  row 2 the four stats and the tools — so desktop is at most two rows and a
  390px phone takes the full width inside the gutters, wrapping without
  overflow. The galaxy shed its 13-board layer: `#maze::before` is `inset: 0`
  behind the tiles with `will-change` and `contain: paint`, and
  `@keyframes moveBackground` animates the original way again —
  `background-size` 600% -> 300% and `background-position` 0 0 ->
  -1000px -500px, 45s ease-in-out infinite alternate; reduced motion and
  high contrast still stop and dim it. The title menu fits below the painting
  at 1280x800: a shorter art band, tighter margins and a two-column button
  grid (Play spans both), and where it still must scroll `components/Menu.tsx`
  fades in a "More" hint at the bottom edge until the last entry is in view.
  And the wardrobe's "New" tag tells the truth for feats earned before its
  first opening: `game/save.ts` no longer re-seeds the seen markers on every
  read — `seedSeenOnce` records the then-unlocked traits plus the `SEEN_INIT`
  key once, `lib/GameState.ts` applies it at load and writes it at once, so a
  feat earned later stays unseen until the wardrobe opens, all covered by the
  marker cases in `game/save.test.ts`.
- E50: polished the three layout faults the post-E49 screenshots showed at
  1280x800 and 390x844. The HUD's second row no longer lets the Step cost
  stat run under the Anchor button: `styles/globals.css` gives
  `#hud.me-hud .me-stats` quarter tracks that may shrink to zero
  (`repeat(4, minmax(0, 1fr))`) instead of the design's content-sized
  `repeat(4, auto)`, so the four stats stay inside the width flex leaves
  them and the `flex: none` tools keep their own space. The title painting
  is whole again: `.title-art` keeps the picture's own square aspect ratio
  (`aspect-ratio: 1 / 1` with `object-fit: contain`) instead of a full-width
  `cover` band cropped from the top, so the lettering shows in full at both
  sizes and the menu trims its own spacing for the painting, never the
  reverse. And the "More" hint tells the truth: `.title-menu .me-menu`
  trims its margins and gaps to `space-4` so the menu fits at 1280x800
  without scrolling and the hint stays hidden there, `components/Menu.tsx`
  measures the overflow from the `.me-menu` box itself (the band above it
  excluded, the hint's own height unable to conjure an overflow), and the
  hint renders as the menu's own last row inside its bottom edge — in the
  flow, not pinned over the scroll box — so on a phone it sits under the
  last button row instead of covering the mode row's best line.
- E51: the page is a top-aligned column and the title screen left the board's
  box. `styles/globals.css` puts `body` at `justify-content: flex-start` with
  `padding-block` of `space-16` plus the safe-area insets and a `min-height`
  of `100dvh` (no fixed height, no `overflow: hidden`), so content starts at
  the top on phones and desktop and the page itself scrolls when it is taller
  than the screen; during play the board keeps `touch-action: none`, so
  swipes never scroll it. `components/Menu.tsx` draws the title screen as a
  `.title-screen` block that `app/page.tsx` places in the column where the
  board was (the board area hides via
  `.game-container[data-screen='title'] #maze-container`, the board staying
  mounted); at up to 720 px inside the gutters the painting shows whole at
  its own aspect ratio (capped at 420 px so the buttons stay on screen at
  1280x800), then the mode picker, the buttons and the best line at their
  natural height — nothing scrolls inside, so the "More" hint and its rules
  are gone. The how-to and the countdown keep the title art as a board-sized
  overlay, dimmed under the countdown as before.
- E52: the board fills a phone's width and the title page tidied up, the
  owner's 2026-11-13 decision replacing "crisp everywhere".
  `game/layout.ts` `boardLayout` no longer snaps every cell of 24 or more down
  to the art grid: it keeps the whole-pixel cell and takes the largest
  multiple of `PIXEL` only when that is at least `PIXEL_SNAP_SHARE` (0.8) of
  it — 1280x800 still draws 52 -> 48 (11 tiles) and 27 -> 24 (21 tiles), while
  a 403x900 phone keeps its 34 px cell, a ~374 px board instead of a 264 px
  square with 440 px of emptiness under it (`game/layout.test.ts` carries
  those three cases; `blobRect` is untouched). The HUD now shows from the
  countdown on — `app/page.tsx` leaves it out on the title — so the title page
  no longer scrolls at 403x900 or 1280x800. The title painting's band is
  cropped in CSS only: `styles/globals.css` gives `.title-screen .title-art`
  an `aspect-ratio` of 500/150 with `object-fit: cover` and
  `object-position: center top`, which keeps the whole "MANIC ENTANGLEMENT"
  lettering and hides the picture's own painted "START", the dead second
  button. The pause panel gained a `pause-panel` class
  (`components/Overlay.tsx`) whose tighter title strip, body padding and
  column of buttons in `styles/globals.css` keep "Quit to title" visible at
  390x844, and the HUD's stats (`components/Hud.tsx`) always use the short
  labels Atk, Def, Clock and Step — one set at every width, so nothing is cut
  at 1280.

- E53: Turned the Knot's forecast into ghost walls drawn with the game's own
  wall art. `game/view.ts` now exports `gridAfterForecast` (a copy of the wall
  grid with the sealing edges filled and the opening edges emptied),
  `tileCodeAt` (the sixteen-picture neighbour numbering maze.ts uses) and
  `markTiles(forecast, grid)`, whose marks carry the code each tile will have
  after the change; `lib/board.ts` `syncMarks` draws an incoming wall as an
  `img.mark-incoming` of that picture on the marks layer and puts
  `wall-outgoing` on the outgoing wall's own tile in the tiles layer, clearing
  the class from every tile on each update so none keeps it after the change.
  `styles/globals.css` breathes the two with one 1.6s alternate opacity cycle
  (0.1 to 0.2 in, 0.8 to 0.9 out), stills them at 0.15 and 0.85 under
  `prefers-reduced-motion` and `[data-motion="reduced"]`, and at 0.35 and 0.65
  under `[data-contrast="true"]`; the old dashed-outline and hatch
  `.mark-open` / `.mark-close` rules and their contrast variants are gone, the
  stalker chevrons untouched. `game/view.test.ts` checks the incoming code
  comes from the forecast-applied grid and matches the real wallGrid after a
  walked shift.

- E54: lifted the maze-size ceiling so the board keeps growing with depth in
  every mode, the way the original did. `game/config.ts` drops `maxSize` and
  `game/plan.ts` `levelPlan` now takes `size = startSize + sizeStep * step`
  with no clamp, so depth 13 builds 17x17, depth 21 builds 25x25 and depth 41
  builds 45x45; the shifts, enemy and item caps are untouched and no mode
  overrides the size. `game/plan.test.ts` pins the new sizes, keeps asserting
  the size is odd and follows the curve to depth 200, and checks no entry in
  `MODES` carries a size field. The board still fits any viewport:
  `game/layout.ts` `boardLayout` shrinks the cell as the maze grows and
  `MIN_CELL` stays the floor.

- E55: the forecast no longer reveals Blackout's hidden walls, and the title
  centres on tall screens. `game/view.ts` `markTiles` takes an optional
  `tileShown(tx, ty)` view and drops every mark on a tile it answers false
  for; `lib/board.ts` `syncMarks` hands it the same `tileShown` the tiles use,
  so on a Blackout level a hidden wall never gets the `wall-outgoing`
  breathing — whose 0.8-to-0.9 opacity used to override the hidden tile's
  0.06 and show the wall at 85% — and no `mark-incoming` ghost picture is
  drawn on a hidden tile either: outside the view the 0.06 fade is the last
  word, and the forecast only ever marks walls the player can already see.
  `game/view.test.ts` pins the rule for both mark kinds and for an
  everything-hidden / everything-shown view. `styles/globals.css` gives
  `.title-screen` `margin: auto` instead of `margin: 0 auto`: the flex auto
  margins centre the title block vertically between the safe-area insets when
  it is shorter than the viewport (~460 px of emptiness gone at 403x900) and
  resolve to zero when it is taller, so a tall block still starts at the top
  and the page scrolls as before; countdown, how-to and play keep their top
  alignment.

- E56: deep mazes now get a camera and a minimap instead of unreadable tiles.
  Since E54 the maze grows without limit, and past ~depth 44 on a phone the
  whole-maze cell fell below 12 px (at depth 41 the tile is 4 px and the
  reptile a dot). `game/layout.ts` adds `MIN_READABLE_CELL` (12),
  `CAMERA_CELL_STEP` (12), `MIN_VIEW_TILES` (13) and the pure `viewportFor`,
  which returns `whole` exactly where `boardLayout` stays readable (early
  levels look pixel-identical) and `camera` otherwise: the largest multiple of
  12 whose window still fits 13 tiles (never below 12), the window as wide as
  that cell affords, capped at the maze. The new pure `game/camera.ts`
  `cameraOffset(player, tiles, viewTiles)` keeps the reptile centred and
  clamps at the maze's edges; both are tested beside the old layout cases.
  `lib/board.ts` takes the viewport from `lib/GameState.ts` `sizeBoard`: in
  camera mode the three layers draw the whole maze at the camera cell inside
  the now window-sized `#maze` (so the galaxy on `#maze::before` stays the
  size of what is seen), slide by a transform with the reptile's glide timing
  (`.camera-move`, instant under reduced motion), and a ~96 px canvas in the
  board's corner — `well` under a `line` border — redraws on maze or reptile
  changes only: walls at 1-2 px a tile, reptile and exit as bright pixels, the
  window as an outline, and on Blackout levels nothing but the reptile and the
  frame.

- E57: art batch 1 is wired in. Brute, Warden and Stalker each draw their own
  240 px four-frame GIF (`brute.gif`, `warden.gif`, `stalker.gif` in
  `styles/globals.css`) at the cell size, pixelated like the rest; the wisp
  keeps the shared `enemy.gif` and the heavy rings and the stalker's red
  marker stay. The HUD tool buttons (`components/ToolBar.tsx`) show the new
  24 px pixel icons (`public/images/tools/<name>.png`, pixelated) beside name,
  key and count; the three `tools/*.svg` are gone and the maze's tool pickups
  and the how-to line read the PNGs. `game/sprite.ts` TRAITS gained the ten
  approved traits (Back Oxygen/Panel, Body Chrome/Ember, Clothes Scarf/Plate,
  Eye Visor/Eclipse, Head Miner/Halo), and `game/wardrobe.ts` a pure
  `PICKUP_TRAITS` table giving each a rarity (Found: Oxygen, Chrome, Scarf,
  Visor, Miner; Rare: Panel, Ember, Plate, Eclipse, Halo). A trait is now
  wearable when it is free, unlocked by an earned feat, or held in the save's
  new `pickedUp` list (`game/save.ts`; old saves load with an empty one), and
  the invariant test reads: every non-free, non-None trait sits in exactly one
  of UNLOCKS or PICKUP_TRAITS. The wardrobe shows pickup traits with Found 1 /
  Rare 2 pips and "Found in the maze" while unheld. Trait pickups in the maze
  come with E58.

- E58: traits drop in the maze. `game/spawn.ts` rolls at most one trait
  pickup per level from the traits the player does not hold yet (not free,
  not feat-unlocked, not in the save's `pickedUp`, none kept or held by the
  run): Rare first at 6% from depth 5, then Found at 20% from depth 2, so a
  level never carries both and the first level never carries one (the table
  is the exported `TRAIT_DROPS`). The roll rides its own rng branch
  (`Rng.clone`), so a level without candidates reads exactly as before; if
  the roll wins but no unheld trait of that rarity is left, nothing drops.
  `game/run.ts` holds the picked trait (`heldTrait`, counted as a pickup)
  and emits `traitPickup` / `traitKept`: reaching the exit keeps it — the
  shell adds it to the save's `pickedUp` and saves — while dying, quitting
  or restarting loses it, like gear. The HUD shows the held trait's PFP
  icon beside the carried marker; the board draws the floor sprite per
  Pixel art: the PFP master cropped to its bounding box (measured on a
  canvas), two tile pixels per art pixel at crops of at most 8 by 8 else
  one, centred in the middle 16, with the 1px black outline and the four
  1x5 corner brackets in `--energy` (Found) or `--gold` (Rare). Picking up
  toasts "New trait: <Name>. Reach the exit to keep it." over the board and
  the exit answers "Kept: <Name>."; the kept trait wears the wardrobe's
  existing New marker until the panel is next closed. Feat-only traits
  never drop, and old saves load unchanged.

- E59: the title block really centres, and the minimap draws crisp. The
  centring E55 asked for never happened because the title block's parent,
  the `.touch-layer` div of `components/TouchLayer.tsx`, was unstyled: only
  as tall as its content, it left the block 16 px from the top with ~773 px
  of empty below at 403x900 (~658 px at 1280x800) for the auto margins to
  work on. `styles/globals.css` now makes `.touch-layer` the page's column:
  `display: flex; flex-direction: column` with a `min-height` of the
  viewport between the safe-area insets (what the body's own padding
  leaves), so the title block sits in the vertical middle when shorter than
  the screen and still starts at the top, page scrolling, when taller. The
  wrapper's shrink-to-fit width and the default item stretch keep every
  play item exactly where the block layout put it — same width, the board's
  top position at 403x900 and 1280x800 unchanged, minimap and panels
  unmoved — and the items' own auto margins still centre the title block,
  the HUD and the D-pad; touch handling on the board is untouched. The E56
  minimap was blurry: its buffer was ~91 px stretched to the 96 px CSS box.
  `lib/board.ts`
  `drawMinimap` now sizes the canvas to exactly its displayed CSS size times
  `devicePixelRatio`, rounded to whole pixels, draws each wall-grid tile at
  a whole number of buffer pixels (at most 2 CSS pixels' worth), turns
  `imageSmoothingEnabled` off beside the CSS `image-rendering: pixelated`,
  and folds the buffer side into the redraw key so a zoom or ratio change
  repaints it.

- E60: the second trait batch is in the maze. `game/sprite.ts` `TRAITS` grew
  by the 72 names the owner picked (Back 14, Body 14, Clothes 15, Eye 14,
  Head 15, each appended after its layer's existing names with `None` kept
  where it was) and `game/wardrobe.ts` `PICKUP_TRAITS` registers every one
  with its rarity — 49 Found and 23 Rare beside the shipped 5 and 5 — so
  E58's drop roll hands them out and the wardrobe wears them once kept. The
  two names that repeat across layers (Circuit in Body and Clothes, Crystal
  in Back and Clothes) were checked everywhere traits are keyed: the save's
  `pickedUp` entries, the wardrobe's New-marker seen keys, the kept/dedup
  checks in `lib/GameState.ts` and the HUD's held-trait icon all carry the
  layer beside the name already, and `game/wardrobe.test.ts` now pins that
  holding Body/Circuit never frees Clothes/Circuit (same for Crystal) while
  `game/sprite.test.ts` reads the six files of every registered trait
  (`<Trait>1..4.png`, `<Trait>pfp.png`, `<Trait>.png`) off
  `public/images/nft/<Layer>/` with `node:fs`. With about twenty traits per
  layer the wardrobe grid gained a `max-height` and scrolls inside its panel
  in `styles/globals.css`, leaving the layer tabs and the stage in place.
- E61: the pre-merge review of E57-E60 is answered. The tool row no longer
  overflows a phone (E57): in the `max-width: 480px` block of
  `styles/globals.css` `#hud.me-hud .me-tools` takes the whole line
  (`flex: 1 1 100%`, `min-width: 0`, wrapping) and the three buttons share it
  in equal shrinkable shares, while `components/ToolBar.tsx` gives the key
  hint its own `me-tool-key` class so phones can drop it — icon, name and
  count stay, and nothing scrolls sideways at 390 or 403 px. The wardrobe
  grid (E60) uses the panel's height now: the panel is a height-capped flex
  column, the grid fills the right column below the tabs (well past 60% of
  the desktop viewport), and `components/Wardrobe.tsx` wraps it in a
  `.wardrobe-grid-wrap` that shows a fade over its bottom edge exactly while
  cards below are out of sight; phones keep the whole-panel scroll. And the
  trait pickup (E58) draws at whole art pixels: `lib/board.ts` sizes the
  crop at the floor of what fits the middle two thirds of the tile (never
  under one screen pixel per art pixel) and gives `--trait-bracket` a whole
  pixel value, so no fractional scale touches the sprite or its outline at
  any cell size.

- E62: the two layout faults the review of E61 left behind are fixed. On the
  desktop the wardrobe's trait grid now takes the panel's whole height: the
  panel is capped at the viewport between the scrim's gutters
  (`max-height: calc(100dvh - var(--space-24) * 2)`), `.wardrobe-layout` got
  explicit rows (`minmax(min-content, 1fr) auto auto`, an auto row had sized
  itself to the cards), the grid column spans all three beside the hint and
  the Back button, and `components/Wardrobe.tsx` moved that hint and that
  button into the layout as `.wardrobe-hint` and `.wardrobe-actions` so they
  sit under the preview, in the left column that used to stay empty below it
  — at 1280x800 four rows of cards show at once, the tabs and the preview
  stay put while the grid scrolls, and the preview column rides `position:
  sticky` at its top. Phones are unchanged: below 641 px the layout is the
  plain one-column stack again (`grid-template-rows: none`, the stage first)
  and the scrim still scrolls the whole panel. And the phone tool buttons
  (E57's row) read "Anchor 0" now, not "ANCHOR0": in the `max-width: 480px`
  block `#hud.me-hud .me-tools .me-btn .me-count` keeps a `--space-4` of its
  own after the name and the display face the desktop button gives it.

- E63: the two phone reports about the board's overlays are fixed. The 3-2-1
  now shows whole and dead centre over the board area: `.game-countdown`
  (styles/globals.css) kills the `<p>`'s default `margin: 1em 0` and its tall
  line box (`margin: 0`, `line-height: 1`), which at the old viewport-sized
  font pushed the digit past the bottom of the overflow-hidden
  `#maze-container` so only its top edge showed, and `startGame()` in
  `lib/GameState.ts` sizes the digit inline, in pixels, from the board area
  itself (half the container's shorter side, never larger than the board)
  instead of `min(40vw, 40vh)` — checked at 403x900, 390x844 and 1280x800.
  And two floating texts in one tick (an enemy kill and the boost it drops)
  no longer print on top of each other: `game/fx.ts` gained the pure
  `floatLineOffset(active, cellX, cellY, now)` — given the texts still rising
  (their cells and start times) it replays the stack in start order and
  answers the new text's offset, one 24 px line under the lowest earlier text
  whose cell is the same or a neighbour, 0 when nothing nearby is on screen —
  with a describe block in `game/fx.test.ts`; `float()` in `lib/board.ts`
  only keeps the list of live texts, prunes the finished ones and adds the
  returned offset to the element's `top`.
