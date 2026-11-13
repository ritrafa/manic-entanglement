# Panel

The one container for every overlay: pause, game over, how to play, settings, feats, wardrobe, save and mint.

- **Structure.** `me-scrim` covers the board; inside it one `me-panel` with a `me-panel-title` strip and a `me-panel-body`. Buttons go last in `me-panel-actions`.
- **You provide** the title (one or two words), the body and the actions. Give the panel `role="dialog"`, `aria-modal="true"` and a label; move focus to the first button.
- **Width.** 296 to 480px; the wardrobe may reach 720px. On a phone the panel is the screen width minus two `space-16` gutters.
- **Title.** `me-panel-title` is `display-lg` centred. Add `is-sm` for a long action title ("Save progress to my NFT").
- **Summaries** use `me-summary`: label in `body` `ink-muted` on the left, value in `display-sm` on the right. Colour a value only when it is a result: `gold` for a new best, `danger` for the cause of death.
- **Dividers** are `me-divider` (`line-quiet`), used once at most, above the actions.
- One panel at a time. No panel inside a panel, no drop shadow, no close "x": the last button closes it and Escape does the same.
- Hide the pause button and the D-pad while a panel is open.
