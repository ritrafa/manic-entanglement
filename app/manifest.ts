import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest (referenced by metadata.manifest). The
// title art doubles as the app icon: it is a square 500 x 500 PNG.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Manic Entanglement',
    short_name: 'Manic',
    description:
      'Run a maze that rewires itself with every step. Read the Knot, mind your energy, go deeper.',
    start_url: '/',
    display: 'standalone',
    background_color: '#08412c',
    theme_color: '#08412c',
    icons: [
      { src: '/images/title.png', sizes: '500x500', type: 'image/png' },
    ],
  };
}
