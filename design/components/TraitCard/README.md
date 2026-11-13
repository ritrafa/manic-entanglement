# TraitCard

One trait in the wardrobe: its art, its name, its rarity and whether you have it.

- **You provide** the layer, the trait name, its rarity, its state and, when locked, how to get it.
- **Art.** The trait's PFP layer at 96px (16px art at 6x) on `well`, over a ghost of the body PFP (`is-ghost`) so its place on the reptile is clear. For a Body trait show the body PFP itself. The card shows the PFP because that is what goes on the NFT; the runner is on the Wardrobe stage.
- **States.**
  - Unlocked: `line` border, the layer name as a `label`.
  - Equipped: `is-equipped`, a `border-thick` `ink` border and the `On` tag. One per layer.
  - New: `is-new`, a `gold` border and the `New` tag, until the wardrobe is next closed.
  - Locked: `is-locked`, the art as a flat silhouette, `ink-dim` text, the `Locked` tag and one line: "Find it in the maze" or "Feat: <name>" in `feat`.
- **Rarity** is the three pips bottom right (`me-pips` with `is-found`, `is-rare` or `is-feat`), with an `aria-label`.
- An unlocked card is a `<button aria-pressed>`; choosing it equips it. A locked card is not focusable as a button; it still shows how to unlock.
- Card width is 120px; do not stretch it. Names are one word.
- Never show a locked trait in colour, and never hide a locked trait: the silhouette is the lure.
