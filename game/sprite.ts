// Pure sprite composition for the reptile player: no DOM here.
// The trait art lives at public/images/nft/<Layer>/<Trait><frame>.png (48x48, frames 1-4).

export type Layer = 'Back' | 'Body' | 'Clothes' | 'Eye' | 'Head';

// Draw order: back first, head last.
export const LAYER_ORDER: readonly Layer[] = ['Back', 'Body', 'Clothes', 'Eye', 'Head'];

export const TRAITS: Record<Layer, readonly string[]> = {
  Back: ['None', 'Wings', 'Jetpack', 'Billhook', 'Oxygen', 'Panel', 'Shell', 'Quiver', 'Sword', 'Antenna', 'Balloon', 'Cape', 'Dish', 'Lantern', 'Rucksack', 'Mushroom', 'Sail', 'Tentacles', 'Crystal', 'Drone'],
  Body: ['Blue', 'Chrome', 'Ember', 'Gold', 'Green', 'Pink', 'Purple', 'Skeleton', 'Solana', 'Frost', 'Coral', 'Camo', 'Copper', 'Lunar', 'Tide', 'Garnet', 'Mint', 'Dune', 'Nebula', 'Toxic', 'Circuit', 'Glitch', 'Opal'],
  Clothes: ['Astronaut', 'None', 'Plate', 'Robe', 'Scarf', 'Tank', 'Poncho', 'Vest', 'Trench', 'Mail', 'Bandolier', 'Aloha', 'Overalls', 'Toga', 'Parka', 'Tabard', 'Kimono', 'Tuxedo', 'Lamellar', 'Circuit', 'Crystal'],
  Eye: ['Asleep', 'Eclipse', 'One', 'Regular', 'Scanner', 'Visor', 'Zero', 'Monocle', 'Goggles', 'Shades', 'Wide', 'Glare', 'Slit', 'Patch', 'Dazed', 'Bored', 'Target', 'Glint', 'Bionic', 'Alien', 'Blaze'],
  Head: ['Cosmonaut', 'Cowboy', 'Crown', 'Halo', 'Hood', 'Miner', 'None', 'Beanie', 'Tophat', 'Bandana', 'Straw', 'Toque', 'Fez', 'Headset', 'Mohawk', 'Propeller', 'Knight', 'Wizard', 'Viking', 'Jester', 'Pharaoh', 'Saucer'],
};

export type Look = Record<Layer, string>;

export const DEFAULT_LOOK: Look = {
  Back: 'None',
  Body: 'Green',
  Clothes: 'None',
  Eye: 'Regular',
  Head: 'None',
};

const FRAME_MS = 150;

/** Replace any missing or unknown trait with the default for that layer.
 *  Trait names are matched exactly against TRAITS, so nothing else can reach a URL. */
export function sanitizeLook(value: unknown): Look {
  const look: Look = { ...DEFAULT_LOOK };
  if (typeof value !== 'object' || value === null) return look;
  const source = value as Record<string, unknown>;
  for (const layer of LAYER_ORDER) {
    const trait = source[layer];
    if (typeof trait === 'string' && TRAITS[layer].includes(trait)) {
      look[layer] = trait;
    }
  }
  return look;
}

/** Layer image URLs in draw order (back first). `None` traits are skipped. */
export function spriteLayers(look: Look, frame: number): string[] {
  const urls: string[] = [];
  const safeLook = sanitizeLook(look);
  const safeFrame = Math.min(4, Math.max(1, Math.trunc(frame) || 1)); // clamp to 1..4
  for (const layer of LAYER_ORDER) {
    const trait = safeLook[layer];
    if (trait === 'None') continue;
    urls.push(`/images/nft/${layer}/${trait}${safeFrame}.png`);
  }
  return urls;
}

/** Which animation frame to show at `ms` milliseconds: 150 ms per frame, looping 1-4. */
export function frameAt(ms: number): 1 | 2 | 3 | 4 {
  const step = Math.floor(Math.max(0, ms) / FRAME_MS);
  return (((step % 4) + 4) % 4 + 1) as 1 | 2 | 3 | 4;
}

/** PFP layer image URLs in draw order (back first): the 16x16 portrait masters
 *  at <Layer>/<Trait>pfp.png, stacked like the runner frames. `None` traits are
 *  skipped and unknown traits fall back exactly as they do in spriteLayers. */
export function pfpLayers(look: Look): string[] {
  const urls: string[] = [];
  const safeLook = sanitizeLook(look);
  for (const layer of LAYER_ORDER) {
    const trait = safeLook[layer];
    if (trait === 'None') continue;
    urls.push(`/images/nft/${layer}/${trait}pfp.png`);
  }
  return urls;
}
