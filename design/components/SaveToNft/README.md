# SaveToNft

One action, "Save progress to my NFT", that writes the loadout and the stats together: a review panel first, then one state at a time.

- **You provide** the on-chain values and the current values for: each changed layer, high score, best depth, feats, traits unlocked and the stat attributes; and the current step.
- **Review (ready).** A Panel titled "Save progress to my NFT". Two PFP stages side by side at 96px: "On chain now" (the PFP as last saved) and "After saving" (the PFP of the current loadout, gold border), with the pixel arrow between. The second one is the new NFT image, pixel for pixel. The runner is not shown here. Then `me-changes`: one row per value, old in `ink-dim`, arrow, new in `gold`. Unchanged values come last as "No change" in `ink-muted`; leave them out if there are more than three.
- One hint line: "Writes your loadout and stats together. Your wallet pays the network fee." Actions: `Not now` and `Save to my NFT` (gold).
- If nothing changed, the gold button is disabled and the hint reads "Nothing new to save."
- **Steps.** `me-steps` shows Approve, Verify, Save: done is `energy`, current is `gold`, failed is `danger`.

| State | Status line | Button |
| --- | --- | --- |
| Approve in wallet | Approve in your wallet | Waiting for wallet (disabled) |
| Verifying run | Verifying your run | Verifying (disabled) |
| Saving | Saving to your NFT | Saving (disabled) |
| Saved | Saved. Your reptile carries this progress. | Done (primary) |
| Failed | Save failed. Nothing changed. | Close, Try again (gold) |

- On failure add one plain reason under the status: "The run could not be verified.", "You declined in your wallet.", "Could not reach the network."
- The player can save whenever they want, from the WalletBox or the Wardrobe. Never save without the review step.
- Progress is restored from the reptile on load: see WalletBox and Toast.
- No transaction hashes, fee amounts or explorer links in the flow; a "View on chain" text link may follow "Saved".
