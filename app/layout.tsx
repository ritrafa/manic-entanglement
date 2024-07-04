import type { AppProps } from "next/app";
import WalletContextProvider from "@/components/WalletContextProvider";

export const metadata = {
  title: 'Manic Entanglement',
  description: '',
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
