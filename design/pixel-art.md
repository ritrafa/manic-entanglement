# Pixel art

Draw every new trait, piece of equipment, enemy and tile to these rules. The numbers are measured from the art in the game today, so new art lines up with old art without touching code.

## Two renditions of every trait

Every trait and every wearable piece of equipment is drawn twice. Both are required; a trait with only one is not finished.

| Rendition | What it is | Where it shows |
| --- | --- | --- |
| **Runner** | The whole reptile on the 24 grid, four animated frames | Only on the board: the player in the maze |
| **PFP** | A head-and-shoulders portrait on a 16 grid, one still frame | Everywhere else: the HUD portrait, wardrobe cards and stage, wallet box, toasts, the mint picker, the save review, and the NFT image itself |

- **The PFP is the NFT.** The image that gets minted or saved is the PFP layers of the loadout stacked together. The runner never goes on chain.
- The two renditions are the same character: same layer, same name, same colours, same silhouette idea (a crown is a crown in both).
- Never scale one rendition to stand in for the other. A runner frame is not a portrait and a portrait is not a sprite.

## The grids

- **One tile is 24 by 24 art pixels.** The runner, items, enemies, the exit and wall tiles share it.
- **The PFP is 16 by 16 art pixels.**
- An art pixel is always a perfect square block. Nothing is drawn between grid lines, rotated, or anti-aliased.
- Alpha is 0 or 255. No soft edges. The one existing exception is the Cosmonaut visor glass (two partial alphas); allow partial alpha only for glass, at most two levels.

| Family | File | File size | Art pixel in the file | Frames | Timing |
| --- | --- | --- | --- | --- | --- |
| Runner | `<Trait>1.png` to `<Trait>4.png` | 48 x 48 PNG | 2 x 2 | 4 | 150ms each, loop |
| PFP master | `<Trait>pfp.png` | 16 x 16 PNG | 1 x 1 | 1 | still |
| PFP export (the mint layer) | `<Trait>.png` | 320 x 320 PNG | 20 x 20 | 1 | still |
| Item, enemy, exit | `<name>.gif` | 240 x 240 GIF | 10 x 10 | 4 | 100ms each, loop forever |
| Wall tile | `<bits>.png` | 240 x 240 PNG | 10 x 10 | 1 | still |

The PFP export is the PFP master scaled by 20 with nearest neighbour, nothing else. Draw the master; generate the export from it.

## Rendering

- Render with `image-rendering: pixelated`, on every image, canvas and background.
- **Whole-number scale only.** A tile is 24, 48, 72 or 96px. A runner frame is 48, 96 or 144px. A PFP is 16, 32, 48, 64, 96 or 144px. Never 23, 30 or 34px.
- The board cell is `24 x n`: the largest n that fits, at least 1. Letterbox the remainder with `void`. If a level cannot fit at 24px, change the level or the camera, not the scale.
- Mirror the runner with `scaleX(-1)` to face left. No other transform: no fractional `scale`, no rotation. A Brute or Warden is a different sprite, not the wisp at 1.15 or 1.3. The PFP is never mirrored.
- Stack layers at the same origin and the same size, back to front: Back, Body, Clothes, Eye, Head. The order is the same for both renditions.

## Runner: layer anchors

Coordinates are art pixels on the 24 grid, x from the left, y from the top, both starting at 0. The reptile faces right.

| Layer | May draw inside (x, y) | Fixed anchor in frame 1 |
| --- | --- | --- |
| Back | x 2 to 21, y 8 to 23 | Sits behind the torso and is drawn first. Jetpack is at x 4 to 7, y 13 to 21; Wings span x 3 to 17, y 10 to 21 |
| Body | x 6 to 18, y 3 to 22 | Head top y 3; snout tip x 18; feet on row 22; row 23 stays empty |
| Clothes | x 6 to 18, y 13 to 23 | Neckline on row 13; covers the torso, leaves hands and feet showing |
| Eye | x 8 to 15, y 4 to 10 | Regular eye is 2 x 2 at x 11 to 12, y 6 to 7: white with one black pupil pixel |
| Head | x 5 to 19, y 1 to 16 | A hat rests on row 3 (the head top) and may rise to row 1; a helmet may wrap down to row 16 |

- **Idle bob.** Across frames 1, 2, 3, 4 the head and shoulders sit 0, 1, 2, 1 art pixels lower while the feet stay on row 22. Eye, Head and Back shift by the same 0, 1, 2, 1. Clothes follow the torso: the neckline moves, the hem stays.
- A layer never needs pixels outside its box. If a design wants more room (a tall hat, wide wings), shrink the design.
- Body colours never appear in other layers and other layers never repaint body pixels, except Clothes over the torso and Head over the skull.

## PFP: layer anchors

Coordinates are art pixels on the 16 grid. The portrait faces right and is cut off by the bottom edge at the chest.

| Layer | May draw inside (x, y) | Fixed anchor |
| --- | --- | --- |
| Back | x 0 to 13, y 10 to 15 | Shows behind the shoulders only. Jetpack is at x 0 to 2, y 13 to 15; Wings span x 0 to 11, y 10 to 15 |
| Body | x 2 to 13, y 3 to 15 | Head top y 3; snout tip x 13; shoulders run off the bottom edge (row 15) |
| Clothes | x 2 to 11, y 13 to 15 | The collar and shoulders: the bottom three rows only |
| Eye | x 3 to 10, y 4 to 8 | Regular eye is 2 x 2 at x 6 to 7, y 6 to 7: white with one black pupil pixel |
| Head | x 0 to 14, y 1 to 14 | A hat rests on row 3 and may rise to row 1; a helmet may wrap the whole head down to row 14 |

- Row 0 and column 15 stay empty in every layer, so the portrait never touches the top or right edge.
- The PFP has no animation frames.
- A detail that only exists in motion (the jetpack flame) stays in the runner. Everything else that reads on the runner must read on the PFP.

## Colour, shading and outline

- **Both renditions share one palette.** A trait's PFP uses exactly the hex values of its runner: same base, same light, same shade. The PFP may use fewer colours than the runner, never different ones. This holds for all 26 traits in the game today.
- **At most 6 colours per layer file.** Most layers use 3 or 4.
- **A material is a ramp of three tones**: base, light, shade. Runner frames may add one deeper shade. Pick the three from one hue; shift lightness by clear steps (see the body ramps).
- **Light comes from the upper left**, behind the reptile. Put a one-pixel `light` rim on top and left edges, `shade` on right and under edges and where a limb overlaps. No dithering, no gradients, no pillow shading.
- **Worn layers have no outline**, in either rendition. The body and its traits read by flat colour against a dark ground.
- **Floor sprites have a one-pixel black outline** (`outline`, `#000000`): items, enemies, the exit and trait pickups, because they sit loose over the galaxy.
- Black is otherwise kept for pupils and deliberately dark details. White is for eyes, teeth and claws.
- **Gear is teal, enemies are red.** Gear uses only black plus the teal ramp. Enemies use only black, `#d80d17`, `#e45c63` and white. A trait pickup is the exception that shows its own colours.

Body ramps in the game today:

| Body | Base | Light | Shade | Deep shade (runner only) |
| --- | --- | --- | --- | --- |
| Green | `#6abe30` | `#8cdd54` | `#4a9a12` | `#3a8008` |
| Blue | `#3156e6` | `#6f8bf5` | `#002bc9` | `#00229f` |
| Gold | `#e7cb07` | `#ffe532` | `#bea917` | `#9d8a0c` |
| Pink | `#db6fbf` | `#f0b6e1` | `#d631ab` | `#b20b88` |
| Purple | `#9039cd` | `#b26de2` | `#6c14a9` | `#56098d` |
| Skeleton | `#ffffff` | none | `#c9c9c9` | `#acacac`, `#9a9a9a` |

Shared ramps:

| Use | Colours, light to dark |
| --- | --- |
| Gear and exit (teal) | `#2ad6c8`, `#27cabd`, `#25c1b4`, `#22b0a4`, `#1c9289`, `#125d57` |
| Walls (maze green) | `#11ab74`, `#0b9363`, `#05784f`, `#056744`, `#035b3c`, `#0a4d35` |
| Metal and stone | `#acacac`, `#929292`, `#676767`, `#454545` |
| Leather and wood | `#a56d53`, `#8f563b`, `#703d25`, `#663931` |

New traits may bring a new ramp of three tones. Reuse a shared ramp for metal, leather and cloth before inventing one.

## The NFT image: building and exporting the PFP composite

The NFT image is built by the server from the loadout, never drawn by hand and never uploaded by the player.

1. Take the five trait names of the loadout. Skip `None`.
2. Stack their PFP masters (`<Trait>pfp.png`, 16 x 16) at the same origin in draw order: Back, Body, Clothes, Eye, Head. Plain alpha-over; alpha is 0 or 255, so there is no blending.
3. Scale the 16 x 16 stack with nearest neighbour by a whole number: 20 for the standard 320 x 320 image. Larger sizes are 640 (40) and 960 (60). Never a size that is not a whole multiple of 16.
4. Put the scaled stack on the background (owner's rule, 2026-11-13), filling the whole image. Never leave the NFT image transparent.
   - **Standard:** one flat very dark green, `void` (`#06120d`).
   - **Feat reward:** the Solana gradient, earned by a feat. A smooth linear gradient at the image's full resolution, top left `#9945FF` (purple) to bottom right `#14F195` (green). It is the one place the system allows a gradient and the one thing that is not pixelated: the reptile on top stays crisp pixel art.
   - The background is part of the loadout and is saved with it, like a trait.
5. Export as PNG, RGB, no metadata, no colour profile. The same loadout must always give the same bytes (draw the gradient with fixed integer maths, no dithering).

- Stacking the 320 x 320 exports (`<Trait>.png`) gives the same picture and is allowed, as long as each export equals its master times 20. Check that when a trait is added. Today one file fails the check: the Cosmonaut export does not match its master. Regenerate it from the master.
- The in-game PFP (HUD, wardrobe, wallet, toasts) is the same stack of masters, shown live at 48, 96 or 144px on `well`. What the player sees in the HUD is what is on chain after a save.

## Trait pickups on the board

A trait found in the maze appears as a tile-sized floor sprite made from its PFP layer. No third drawing is needed.

- Crop the PFP master to its bounding box.
- If the crop is at most 8 by 8 art pixels, draw it at two tile pixels per art pixel; otherwise at one. Centre it on the tile. It must stay inside the middle 16 by 16 tile pixels.
- The game adds the one-pixel black outline and the rarity frame: four corner brackets, 1 tile pixel thick and 5 long, in `energy`, `gold` or `feat`.
- Do not bake rarity, glow or sparkles into any trait art. The frame colour and the pip count carry rarity.
- Feat-only traits never drop, so they never appear as pickups.
- Equipment that is not worn (energy, tools) stays a teal floor sprite and has no PFP.

## Wall tiles

- 16 tiles named by four bits in the order north, east, south, west: `0101.png` is a wall running east to west, `1111.png` a crossing, `0000.png` empty floor.
- A wall arm is 6 art pixels wide, centred (x or y 9 to 14), and runs to the tile edge on each side whose bit is 1.
- Brick face `#056744`, mortar and lit edge `#05784f` and `#0b9363`, shadow edge `#035b3c`. No outline.

## Naming and delivery

- Traits live at `public/images/nft/<Layer>/` with six files each: the runner `<Trait>1.png` to `<Trait>4.png`, the PFP master `<Trait>pfp.png` and the PFP export `<Trait>.png`.
- `<Layer>` is exactly `Back`, `Body`, `Clothes`, `Eye` or `Head`. `<Trait>` is one capitalised word, letters only, unique in its layer (`Jetpack`, `Cowboy`). It must match the name in the game's trait list.
- `None` is a full set of six empty transparent files; keep it for every layer that can be bare.
- Items and enemies are lower-case single words at `public/images/` (`boots.gif`).
- Deliver at the file sizes in the table, no extra scales, no sprite sheets, no metadata.
- Check before handing over:
  - Both renditions exist, all six files.
  - Every file is clean at its block size (no half pixels) and stays inside its layer box.
  - The PFP uses only colours the runner uses; colours counted, 6 at most.
  - The export equals the master times 20.
  - Runner frames 1 to 4 bob 0, 1, 2, 1.
  - Stacked on the Green body, the runner reads at 48px and the PFP reads at 48px, both on black.
