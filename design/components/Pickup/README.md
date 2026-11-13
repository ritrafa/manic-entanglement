# Pickup

How things lie on the board: gear, enemies with their toll, the exit, and trait pickups with a rarity frame.

- **You provide** the tile size (`--c`, a whole multiple of 24px) and, for a trait pickup, its sprite and rarity.
- **The player** on the board is the runner sprite, never the PFP.
- **Cells.** `me-cell` is one tile; sprites fill it with `image-rendering: pixelated`. The board ground is black with the galaxy behind.
- **Gear** (energy, boots, gloves, shield, speed, backpack) is the teal sprite alone, no frame.
- **Trait pickup.** `me-pickup` with `is-found` or `is-rare`: the trait in its own colours, centred in the middle 16 art pixels with a black outline, inside four corner brackets drawn by CSS in the rarity colour (1 art pixel thick, 5 long). The sprite is the trait's PFP layer cropped to its bounding box (`me-crop`): two tile pixels per art pixel when the crop is at most 8 by 8, otherwise one. No extra drawing per trait (see Pixel art).
- **Rarity** is frame colour plus pips wherever there is room for words: Found one pip `energy`, Rare two pips `gold`, Feat only three pips `feat`. Feat-only traits never lie on the board.
- **Toll.** `me-toll` above an enemy: `display-sm` on `well` with an `ink` border; `is-fatal` turns it to `danger-fill` with `on-danger` text.
- Picking up a trait: flash the tile once in the rarity colour (a hard two-frame blink), then show the New trait Toast.
- With the Clear shapes setting on, every floor sprite also gets a 2px `ink` outline box, as today.
- Do not scale a pickup to show importance, add glow, or animate the brackets.
