# HudBar

The strip under the board: the PFP portrait, energy and score meters, four stats, the carried marker and the tool buttons.

- **Portrait.** The bar starts with the player's PFP in `me-portrait`: the PFP layers of the current loadout stacked at 48px (16px art at 3x) on `well`. It is built locally from the loadout, not loaded from the NFT's image address, so it updates the moment a trait changes. Never the runner here.
- **You provide** the loadout, energy (0 to 100) and its number, score and progress toward best, the four stat values, tool counts and the carried count.
- **Layout.** `me-hud` is one wrapping row at the board's width on desktop. Add `is-phone` below 480px: portrait beside the meters, then stats, carried marker, tools, stacked.
- **Meters.** `me-meter` with `--v` as a percentage. Energy is `energy`; score is `is-gold`. Each meter has a `label` and a `display-sm` number to its left and a `role="progressbar"` with values.
- **Low energy.** At the game's low threshold add `is-low` to the meter, switch label and number to `danger`, and change the label to "Energy low". Colour plus words, never colour alone.
- **Stats.** `me-stat`: a 24px gear sprite, a `label` and a `display-sm` value. Attack uses `gloves.gif`, defense `shield.gif`, clock `speed.gif`, step cost `boots.gif`. On a phone shorten labels to Atk, Def, Clock, Step.
- **Carried.** `me-carried` shows only while gear is carried, with the hint "Reach the exit to keep it".
- **Tools.** Secondary buttons with the tool name, its key in `gold` (desktop only) and its count in `energy`. Zero count means `disabled`.
- No emoji, no rounded bars, no eased width changes: the meter jumps a segment at a time.
- Keep the live region for announcements; it is invisible and unchanged.
