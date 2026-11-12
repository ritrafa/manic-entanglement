import WalletContextProvider from "@/components/WalletContextProvider";

export const metadata = {
  title: 'Manic Entanglement',
  description: '',
}

// The page runs edge to edge (notches and browser bars included) and the CSS
// pads with env(safe-area-inset-*); pinch zoom stays allowed on purpose.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (

      <html lang="en">
        <body>
          <WalletContextProvider>
            {children}
          </WalletContextProvider>
        </body>
      </html>

  )
}
