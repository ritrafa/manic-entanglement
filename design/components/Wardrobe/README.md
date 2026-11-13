# Wardrobe

The wardrobe panel: the PFP and the runner on a stage, layer tabs, a grid of TraitCards and the save bar.

- **You provide** the current look, the traits per layer with their states, the unlocked count and whether there is unsaved progress.
- **Stage.** `me-stagebox` holding a `me-duo`: the stacked PFP at 144px (16px art at 9x) labelled "Your NFT", and the stacked runner at 96px (frames at 2x, animated through frames 1 to 4) labelled "In the maze". Both change together. Under it the count ("6 of 22 traits") in `display-sm` and a `gold` meter.
- **Tabs.** `me-tabs` in draw order: Back, Body, Clothes, Eye, Head. The open tab is `is-on`.
- **Grid.** `me-grid` of 120px TraitCards for the open layer: equipped first, then unlocked, then locked. `None` is a card too, for layers that can be bare.
- **Save bar.** Below a divider: a hint ("1 new trait since your last save.") and the actions. `Save to my NFT` (gold) shows only when a reptile is connected and something changed; it opens SaveToNft. `Back` is always there.
- With no wallet the bar shows only `Back`; do not advertise chain features inside the wardrobe.
- On a phone the stage goes above the tabs, the PFP drops to 96px and the runner to 48px, and the grid is three cards wide.
- Choosing a card updates the stage at once. Locked cards never change the stage.
