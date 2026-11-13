# MenuList

The title menu: the mode picker and a column of full-width buttons under the title painting.

- **You provide** the modes (name, one-line blurb, best) and the menu rows in order: Play, How to play, Settings, Wardrobe, Feats.
- **Structure.** `me-menu` is a 280px column with `space-8` gaps. `me-mode` holds two icon buttons and the mode name in `display-md`, the blurb in `body-sm` and the best in `gold`.
- **Play is the only primary.** Every other row is a secondary button of the same width.
- **The painting keeps its own band** above the menu, cropped from the top so the lettering shows, with a `border-thick` `line` under it. Nothing overlaps it; no dark gradient over it.
- Counts go in the label: "Feats 3/12".
- Keyboard: Up and Down move focus through the rows, Left and Right change the mode, Enter activates. Focus is the inset ring.
- Do not add icons to rows, a second column, or more than six rows. New destinations (Mint, Wallet) live in the WalletBox, not here.
