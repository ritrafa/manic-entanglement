> Source of truth: the Manic Entanglement design system page (approved by the owner 2026-11-13). This folder is a copy for the agents that apply it: `tokens.json`/`tokens.css` (the tokens), `components.css` and `components/<Name>/preview.html` (reference markup and CSS for each part), `pixel-art.md` (the art spec). Images in previews are named in `assets.md`.

Manic Entanglement is a maze that rewires itself with every step. You play an Entangled Reptile, a pixel-art lizard stacked from five trait layers, running deeper through green brick corridors that float in a galaxy. This system gives the site and the game one visual language: dark ground, maze-green structure, teal for what you pick up, gold for what you win, and pixel art on one 24-pixel grid.

## The world and its tone

- **Place.** A brick maze hung in deep space. The walls are the only solid thing; the galaxy shows through the floor. The Knot is the spot the maze rewires around.
- **Feel.** Tense and quick, never cute, never grim. An arcade cabinet, not a casino and not a crypto dashboard.
- **The reptile is the star.** It is the one many-coloured thing on screen. The UI stays in greens, teal and gold so the reptile and its traits carry the colour.
- **Chain features are part of the game.** Wallet, mint and save use the same panels, buttons and words as everything else. No separate "web3" look.

## The reptile: runner and PFP

Every reptile has two pictures, built from the same five trait layers (Back, Body, Clothes, Eye, Head).

- **The runner** is the whole body on the 24 grid, animated. It appears only on the board, in the maze.
- **The PFP** is the 16-grid portrait. It is the NFT image, and it is the reptile everywhere outside the board: the HUD portrait, wardrobe, wallet box, toasts, the mint picker and the save review.
- Show the PFP on `well` inside a `border-thin` `line` frame (`me-portrait`) at 48, 96 or 144px. Show the runner at 48, 96 or 144px.
- Where a player chooses a look (wardrobe, mint), show both side by side, labelled "Your NFT" and "In the maze", so the choice is clear in both.
- What the HUD portrait shows is what a save writes on chain. Never show a PFP the loadout would not produce.

## Voice

Write like a HUD: short, plain, present tense. Say what happened or what to do.

- **Length.** A label is one or two words. A line is one sentence. A toast is a headline and at most one line.
- **Case.** Text set in `display-*` styles is uppercase by CSS; write it in sentence case in the source ("How to play"). Body text is sentence case. No title case.
- **Person.** "You" and "your". The game never says "we" or "I".
- **Words.** Use the game's own nouns and keep them fixed: energy, score, best, depth, level, gear, tool, trait, feat, exit, toll, the Knot, reptile, wallet. Verbs for chain actions: mint, save, approve.
- **Numbers.** Digits always. `Best 125`, `3/12`, `x2`, `100%`. A thousands comma from 1,000.
- **Punctuation.** No exclamation marks except the single earned one, `New best!`. No ellipsis for waiting: say what is happening ("Verifying your run"). No emoji anywhere, including the HUD.
- **Failures.** Say what failed, what state things are in, and the next step: "Save failed. Nothing changed." then a "Try again" button.

Real lines from the game, kept as the model:

> Reach the exit to descend to the next level.
> Enemies charge the toll shown on them.
> Gear makes you stronger and is kept when you reach the exit; dying loses it.
> 404: No corridor here. That page is not in this maze.
> The maze tangled itself.

New lines written to the same rule:

> New trait: Crown. Reach the exit to keep it.
> Progress restored. From your reptile: best 1,240, depth 9, 7 feats, 14 traits.
> Approve in your wallet. Verifying your run. Saving to your NFT. Saved.
> Mint locked. Reach depth 5 in one run.

## Colour

One theme, dark, on purpose: the board is black space and the art is drawn for it. Every colour is taken from the existing art.

- **Ground.** The page is `void`. Panels, the HUD and toasts are `surface`. Cards, stat cells and secondary buttons are `surface-raised`. Meter tracks and sprite stages are `well`. A modal sits on `scrim` over the board.
- **Structure is maze green.** Borders are `line` (the wall face, `maze-500`). Panel title strips are `maze-800`, the site's theme colour. The primary button is `maze-400` with `on-maze` text. Do not use white text on any maze green lighter than `maze-600`.
- **Teal is what you pick up.** `energy` (`teal-300`) is the energy meter, the energy number and every gear sprite. The pickup on the board and the meter it fills are the same colour.
- **Gold is what you win.** `gold` is score, best, earned feats, new unlocks, and the save and mint buttons. Nothing is gold unless the player earned it or is about to keep it.
- **Danger.** Use `danger` for text, borders and marks; use `danger-fill` only as a fill with `on-danger` text. Danger always comes with a word ("Energy low", "Save failed").
- **Feat purple.** `feat` marks things only a feat can give.
- **Text.** `ink` for primary, `ink-muted` for secondary, `ink-dim` for disabled and locked. All three hold 4.5:1 on `void`, `surface` and `surface-raised`.
- **Status never rides on hue alone.** Each state carries a word, and rarity carries a pip count. Teal against red also differs in lightness.
- **No gradients between colours, no transparency tricks.** The only gradient allowed is the hard-stop one that draws meter segments. The page behind the game is flat `void`, not a green-to-purple wash.

Rarity uses three of the colours above, always with pips:

| Rarity | Colour | Pips | Where it comes from |
| --- | --- | --- | --- |
| Found | `energy` | 1 of 3 | Drops in the maze |
| Rare | `gold` | 2 of 3 | Drops deep or seldom |
| Feat only | `feat` | 3 of 3 | Awarded by a feat, never dropped |

## Type

Two families from Google Fonts.

- **Silkscreen** (`--font-display`) is the pixel face: titles, buttons, menu rows, HUD numbers, tags. Uppercase always. Use only 16, 24, 32 and 64px (`display-sm`, `display-md`, `display-lg`, `display-xl`); never smaller than 16px. Fallback: Courier New, then monospace.
- **Atkinson Hyperlegible** (`--font-body`) is everything you read: how-to lines, hints, settings, summaries labels, errors. `body` is the default; `body-sm` for hints; `label` (12px bold uppercase, 0.08em tracking) names a value. Fallback: Segoe UI, then system-ui.
- A value and its label are a pair: `label` in `ink-muted` over or beside a `display-sm` number.
- The game's text-size setting multiplies body sizes only. Silkscreen steps to the next size in its list instead of scaling by a fraction.
- No italics, no underlines except links in body text, no text shadows except the 2px hard `well` shadow on score numbers that float over the board.

## Space and layout

- The UI pixel is 2px. Every size, gap and border is a multiple of it; spacing comes from `space-2` to `space-48`.
- `space-24` is one tile. Line the HUD and panels up to the board edge.
- Touch targets are at least `tile-2x` (48px). D-pad keys are `dpad-key` (64px).
- Panel padding is `space-16`; gaps between buttons `space-8`; phone gutter `space-16`.
- **Desktop.** Board centred, HUD one row under it at the board's width, nothing wider than the board. **Phone.** Board on top at full width, HUD stacked under it, D-pad last.
- The title painting gets its own band. Menus go under it on `void`, never over its lettering.
- Panels are centred on `scrim`, at most 480px wide (the wardrobe 720px), and scroll inside themselves with the page scrollbar hidden.

## Borders, corners, shadows

- **Corners are square.** `radius-none` is the only radius. Soften a seated box with a stepped notch: `notch-sm` on buttons and cards, `notch-md` on panels (class `me-notch`, built into `me-btn` and `me-panel`). No circles: the Knot and its ring are drawn as pixel art.
- **Borders** are `border-thin` (2px) for controls and cards and `border-thick` (4px) for panels, the HUD top edge and the equipped card. Always solid, always a token colour at full strength. No 1px hairlines, no translucent white borders, no dashed CSS borders (the forecast marks are pixel sprites).
- **Shadows are hard.** A button has a 4px lip inside its bottom edge (`lip-maze`, `lip-well`, `lip-gold`); pressing removes the lip and moves the label down 4px. A toast floating over the board has `drop-hard`. No blur, no glow, no drop shadows on panels.
- **Focus** is a solid 2px ring inset 4px from the edge: `ink` on dark fills, `on-maze` on `maze-400` and `gold` fills. Small controls (chips, tabs, checkboxes) take the same ring outside, offset 2px, on a dark ground.

## Motion

- Sprites animate by frames: 150ms per reptile frame, 100ms per item frame, both four frames, looping.
- UI state changes are instant or stepped (`steps()`); nothing eases a colour or a size. Movement between tiles stays linear, one step length.
- Busy states blink a square, two steps a second. No spinners.
- Reduced motion: stop the galaxy drift, the blink and the board shake; keep sprite frames.

## Iconography

There is no icon font. Icons are the game's own pixel sprites at `tile` size (24px) or a whole multiple.

- The player's own icon is their PFP, never a generic avatar.
- Stats use the gear that changes them: `gloves.gif` attack, `shield.gif` defense, `speed.gif` clock, `boots.gif` step cost.
- Arrows and the pause mark are drawn in CSS on the 2px grid (`me-arrow`, `me-pause-bars`).
- No emoji, no smooth vector icons, no Unicode arrows or symbols as icons. The three tool icons (`anchor.svg`, `twist.svg`, `cut.svg`) are smooth strokes today and are not part of this system: tool buttons show name, key and count until 24-pixel tool sprites are drawn to the Pixel art rules.

## Before and after

What the game looks like today, and the rule that replaces it.

| Today | Rule |
| --- | --- |
| Five unrelated greens: theme `#08412c`, UI `#1bbf85`, wall `#0b9363`, item teal `#2ad6c8`, plus a green-to-purple page gradient | One maze ramp (`maze-800` to `maze-400`) for structure, `energy` teal for pickups and the meter, flat `void` page |
| The energy bar is `#1bbf85` while the energy pickup is `#2ad6c8` | Both are `energy` |
| Two danger reds (`#ff3b30` in CSS, `#d80d17` in the enemy art) and three golds (`#ffd700`, `#ffd34d`, `#ffe9a8`) | `danger` / `danger-fill` and one `gold` |
| Overlay backgrounds in five near-blacks at 0.82 to 0.94 alpha, each panel its own | `scrim` behind, one `me-panel` on top |
| The same translucent-white button is copied into eight selectors with paddings of 4, 6, 8 and 10px; wallet and status buttons differ again | One `me-btn` with primary, secondary, danger, gold and disabled |
| Radii of 2, 3, 4, 5, 6, 8, 10px and 50% beside square pixel art | `radius-none` and stepped notches |
| 1px white borders at 0.25, 0.35, 0.4 and 0.6 alpha; 2px and 3px coloured ones; dashed ones | `border-thin` and `border-thick` in `line`, solid |
| Blurred glows (`0 0 10px` gold and green) on the Knot and tools | Hard lips and `drop-hard` only |
| One system font (Segoe UI) at more than 25 different sizes in px, em and rem; the countdown is a thin 300px numeral | Silkscreen in four sizes, Atkinson Hyperlegible in four styles |
| Emoji as stat icons in the HUD | The gear sprites at 24px |
| Smooth SVG tool icons and a CSS circle for the Knot next to pixel sprites | Pixel sprites only; text until they exist |
| Sprites sized to whatever the cell works out to (about 23px on a phone, 30px on desktop), Brute and Warden scaled by 1.15 and 1.3 | Whole multiples of 24 only; bigger enemies get their own sprite |
| Trait layers have no outline, floor items have a black outline, with no stated reason | Written down: worn layers have none, floor sprites have one (Pixel art) |
| The menu and mode picker sit on top of the title lettering; the painting's own "START" shows under the buttons | The painting keeps its band; `MenuList` sits below it |
| At 1280 wide the HUD collapses: the meters shrink to a square and the stats run off the bottom | `HudBar` is one wrapping row at the board's width |
| The pause button stays on top of the pause, game-over and wardrobe panels | Hide it whenever a panel is open |
| Panels scroll with the browser's white scrollbar | Panels scroll inside, scrollbar hidden or `line` on `well` |
| The 404 page renders unstyled: white page, Times, blue link | `StatusPage`, and the stylesheet must load on that route |
| Wardrobe is five rows of arrows with no view of what is locked | `TraitCard` grid by layer with locked, new and equipped states |
| Wallet box shows one status line; nothing exists for trait pickups, saving or minting | `WalletBox`, `Pickup`, `Toast`, `SaveToNft`, `Mint` |
| Each trait ships a portrait (`pfp`) and a 320px copy that the game never shows; the HUD shows the remote NFT image over the wallet button | The PFP is the reptile outside the board and the NFT image is built from the same PFP layers |

## Using the components

`components/bundle.css` holds every class, each built only from tokens; previews are plain HTML. Load Silkscreen and Atkinson Hyperlegible from Google Fonts, then the tokens, then the bundle. Class names start with `me-`; states are `is-*`. Apply one screen at a time and delete the old selector when its screen moves over.
