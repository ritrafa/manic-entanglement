# Mint

First mint for a player with no reptile: locked until a verified run reaches the goal depth, then a starter-trait picker with a live preview and the mint action.

- **You provide** the goal depth, the player's best verified depth, the starter traits per layer and the current step.
- **Locked.** Panel "Mint a reptile" with a PFP silhouette on the stage, the `Locked` tag, the goal as one line ("Reach depth 5 in one run"), a `gold` meter with "3/5", and the terms: "One reptile per wallet. You pay only the network fee." The button is disabled and reads "Mint locked". The goal depth in the preview is an example; use the game's value.
- **Picker.** The stage shows the stacked PFP at 144px, labelled "This gets minted": it is exactly the NFT image. Under it the runner at 48px, labelled "In the maze". Both update as chips change. One `me-chip` row per layer that has starter traits, each a radio group; the chosen chip is `is-on`. Only free starter traits appear (today Body Green and Blue, Eye Regular and Asleep, Head None and Hood).
- One hint: "Everything else is found in the maze or won through feats." Action: `Mint this reptile` (gold, full width).
- **Steps.** `me-steps` shows Approve, Mint.

| State | Status line | Button |
| --- | --- | --- |
| Approve in wallet | Approve in your wallet | Waiting for wallet (disabled) |
| Minting | Minting your reptile | Minting (disabled) |
| Minted | Minted. This reptile is yours. (with the new PFP at 48px) | Play (primary) |
| Failed | Mint failed. Nothing was charged. | Close, Try again (gold) |

- Entry points: the WalletBox "None found" state. Do not put Mint in the title menu.
- A wallet that already holds a reptile never sees this component.
- No price, countdown, supply counter or rarity odds. It is a reward for play, not a sale.
