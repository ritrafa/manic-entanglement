# Button

The one button for the whole site and game: a square-notched block with a 4px lip, labelled in Silkscreen.

- **Use** `me-btn` on a `<button>` or `<a>`. You provide the label, in sentence case; CSS uppercases it.
- **Primary** (`me-btn-primary`, `maze-400` with `on-maze` text): one per screen, for the thing the screen is for (Play, Resume, Retry, Back to the title).
- **Secondary** (plain `me-btn`): everything else.
- **Danger** (`me-btn-danger`): actions that lose something (Reset progress). Never the primary.
- **Gold** (`me-btn-gold`): only for keeping a reward on chain (Save to my NFT, Mint this reptile).
- **Disabled**: the `disabled` attribute. It loses the lip and uses `ink-dim`; say why nearby if it is not obvious ("Mint locked").
- **Sizes**: default is 48px tall. `me-btn-sm` (32px) only inside a card next to a 48px action. `me-btn-icon` is 48 x 48 for an arrow or the pause mark; give it an `aria-label`. `me-btn-block` fills its column.
- Labels are a verb or a place, at most three words. No icons beside labels, no emoji.
- Do not restyle per screen. Do not put two primaries side by side. Do not use gold for navigation.
- States: hover lightens the fill, pressed drops the lip and the label 4px, focus is the inset 2px ring.
