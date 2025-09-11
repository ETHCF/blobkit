import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BlobKit - TypeScript SDK for Ethereum Blob Transactions',
  description: 'TypeScript SDK for Ethereum blob transactions (EIP-4844). Ephemeral data storage with cryptographic guarantees.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  )
}
