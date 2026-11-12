Game Live @ https://www.manic-entanglement.com/
Repo @ https://github.com/ritrafa/manic-entanglement

# Manic Entanglement

Are you ready to dive into an ever-shifting labyrinth where survival is fleeting,
and wisdom and prior attempts are your greatest assets? Welcome to **Manic
Entanglement**, a rogue-lite maze run where every step you take rewires the
labyrinth around the Knot, challenging your wits while you collect gear and
items to stave off your eventual return to the cosmic mist. Each time you
re-enter, you do so a little wiser, a little stronger and better prepared for
the infinite entanglement.

A key feature of Manic Entanglement is the origin shift algorithm, created by
[CaptainLuma](https://github.com/CaptainLuma). This algorithm ensures the maze
continuously evolves, providing a unique challenge with every step.

## How to play

Reach the exit to descend to the next level; each exit drops you deeper, and
the maze grows the further you go.

- **Move**: arrows or WASD, hold to run; on touch, swipe (an optional D-pad and
  a pause button appear on phones and tablets). Esc pauses, M mutes.
- **Energy**: you start with 100 energy. It drains all the time and with every
  step; run out and the run ends. Energy pickups and the exit bonus refill it,
  and gear raises how much you can carry.
- **The Knot and the forecast**: the maze rewires itself around the Knot each
  time you move. Before you step, the forecast marks which walls will open
  (dashed) and which will seal (hatched) — read it, then go.
- **Enemies**: wisps, brutes and wardens charge the toll shown on them when you
  walk into them; a stalker stalks you between your own steps. Beating one
  drops gear.
- **Gear**: boots make steps cheaper, gloves hit harder, shields take the toll,
  speed slows the energy clock and a backpack carries more energy. Gear banked
  at an exit is kept for the rest of the run; dying loses what you carried.
- **Tools**: the Anchor freezes the maze for your next 6 moves, the Twist
  rerolls the forecast and the Cut calls the Knot through the wall you face
  (from depth 3). Pick them up and fire them with keys 1, 2 and 3 or the
  toolbar.
- **Modes**: Descent (endless, with gear), Sprint (five levels, no gear,
  fastest time wins), Zen (no clock, steps cost double) and Daily (one seed a
  day, the same maze for everyone).
- **Feats and wardrobe**: twelve feats (first-exit, depth-5, photo-finish,
  warden, ...) are evaluated on every finished run, and feats unlock traits in
  the wardrobe, where you dress your runner layer by layer.

## Wallet (optional)

The Solana wallet is entirely optional and read-only: connect it and the game
looks up your assets in the Entangled Reptiles collection (id
`Dj5gDUph6CuUiQBjh31HhpmJTXhhfHzbMTNK89wNHzvz`) and, if you own one, loads its
traits as your playable character's look. Nothing is signed, minted or sent,
and the game plays exactly the same without a wallet — your look from the
wardrobe is used instead.

## Develop

Node comes from `.nvmrc`:

```
nvm use
npm ci
npm run dev      # http://localhost:3000
npm test         # vitest, the pure-rule suites
npm run check    # build + type-check + tests, the same as CI
```

## Project layout

- `game/` — the pure rules (maze, shifts, combat, gear, tools, modes, feats,
  wardrobe, ...), no DOM and no clocks, covered by the vitest suites beside
  each file.
- `lib/` — the browser shell: `GameState` drives a run from the pure rules,
  `board.ts` paints the DOM, and the wallet-asset fetch lives here too.
- `components/` — the React pieces (HUD, menu, overlays, wardrobe, ...).
- `public/` — art and sounds, plus `public/images/title.png` as the share
  image and app icon.

## Environment variables

- `NEXT_PUBLIC_SITE_URL` — the canonical site URL used for the share metadata;
  when unset or invalid the metadata falls back to `http://localhost:3000`.
  Nothing else is required to build or run.

The wallet's RPC endpoint is currently a constant in the wallet code
(`lib/` and `components/WalletContextProvider.tsx`); the game needs no key
for anything.

## Deploy

The site is deployed by Vercel's Git integration: pushing a branch gets a
preview deployment, and merging to `main` publishes. Set
`NEXT_PUBLIC_SITE_URL` to the live URL in the Vercel project settings and
check the preview deployment before merging.
