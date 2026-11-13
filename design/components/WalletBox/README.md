# WalletBox

The wallet corner of the HUD: closed by default, then one small box with one status line.

- **You provide** the state, the shortened wallet address and, when found, the reptile's portrait layers and number.
- **Closed.** A secondary `Wallet` button. Nothing loads until it is pressed.
- **Loading.** The action button disabled and the status "Loading..." with the busy square (`me-status is-busy`).
- **Reptile found.** The stacked PFP at 48px (16px art at 3x), built from the reptile's traits, "Reptile #<n>", the wallet address in `body-sm`, and actions: `Save` (gold, small) and `Disconnect`. When saved progress was loaded, the status reads "Progress restored" (`is-ok`) and a Toast says the same once.
- **None found.** Status "No Entangled Reptile in this wallet" and a `Mint a reptile` button that opens Mint.
- **Network error.** Status "Could not reach the network" (`is-bad`, `role="alert"`) and `Try again`.
- The status square is grey, teal, gold (blinking) or red, always beside the words.
- The wallet picker from the wallet library is restyled to this system: square, `surface`, `line` border, Silkscreen labels. No third-party purple button.
- Show an address only shortened (first four, last four). Never show balances.
