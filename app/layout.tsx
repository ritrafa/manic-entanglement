import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '../design/tokens.css';
import '../design/components.css';
import '../styles/globals.css';
import { siteUrl } from "./meta";

const DESCRIPTION =
  'Run a maze that rewires itself with every step. Read the Knot, mind your energy, go deeper.';

export const metadata = {
  title: 'Manic Entanglement',
  description: DESCRIPTION,
  // Canonical base for the share tags; NEXT_PUBLIC_SITE_URL is set on the
  // deployment and the helper falls back to the dev address when it is not.
  metadataBase: siteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'Manic Entanglement',
    description: DESCRIPTION,
    siteName: 'Manic Entanglement',
    type: 'website',
    images: [
      {
        url: '/images/title.png',
        width: 500,
        height: 500,
        alt: 'Manic Entanglement title art',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Manic Entanglement',
    description: DESCRIPTION,
    images: ['/images/title.png'],
  },
}

// The page runs edge to edge (notches and browser bars included) and the CSS
// pads with env(safe-area-inset-*); pinch zoom stays allowed on purpose.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08412c',
}

// The wallet is not wrapped around the app any more: the HUD's Wallet button
// pulls in the provider on demand (components/WalletGate.tsx), so visitors
// who never open the wallet box never download the wallet code.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (

      <html lang="en">
        <body>
          <noscript>
            <p style={{ margin: '1rem', fontFamily: 'sans-serif' }}>
              Manic Entanglement is a game: it needs JavaScript to run.
              Please enable it and reload.
            </p>
          </noscript>
          {children}
        </body>
      </html>

  )
}
