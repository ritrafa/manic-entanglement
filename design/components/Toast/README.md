# Toast

A short announcement that floats over the board and leaves by itself: level banner, new trait, feat earned, progress restored, warnings.

- **You provide** a headline (`me-toast-head`, at most three words), at most one line (`me-toast-body`), and optionally a 48px sprite on the left.
- **Kinds** set the border only: `is-reward` gold (level, new trait), `is-feat` purple (a feat and what it unlocked), `is-energy` teal (progress restored, saved), `is-danger` (energy low, a failure). Plain is `line`.
- **New trait picked up.** Sprite: the trait's PFP layer over a ghost of the body PFP, at 48px. Lines: the `New trait` tag, the trait name with its rarity pips, then "Head. Reach the exit to keep it." Show it at pickup; show "Kept" wording in the run summary, not a second toast.
- **Feat unlock.** Headline "Feat: <name>" in `feat`, then the trait it unlocked and "Unlocked for good."
- **Progress restored.** When a connected reptile's saved progress is loaded: the reptile's PFP, "Progress restored" and one line listing best, depth, feats and traits. Show once per load.
- **Placement.** Top centre of the board, `space-24` from its top edge, one at a time; queue the rest. 2.5 seconds, or until the next step for the level banner.
- Square corners and `drop-hard`. `role="status"`, or `role="alert"` for danger.
- Floating numbers over a tile (`me-float`) are `display-sm` in `gold` with a 2px hard shadow; they are not toasts.
- Do not put buttons in a toast. Anything that needs a decision is a Panel.
