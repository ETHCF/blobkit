import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BlobKit - TypeScript SDK for Ethereum blob transactions',
  description: 'TypeScript SDK for working with Ethereum blob transactions (EIP-4844). Blob space is useful for temporary data storage with cryptographic guarantees.',
  authors: [{ name: 'BlobKit Contributors' }],
  keywords: ['ethereum', 'blob', 'eip-4844', 'typescript', 'sdk', 'blockchain'],
  creator: 'BlobKit',
  publisher: 'BlobKit',
  robots: 'index, follow',
  openGraph: {
    title: 'BlobKit - TypeScript SDK for Ethereum blob transactions',
    description: 'TypeScript SDK for working with Ethereum blob transactions (EIP-4844)',
    url: 'https://blobkit.org/',
    siteName: 'BlobKit',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BlobKit - TypeScript SDK for Ethereum blob transactions',
    description: 'TypeScript SDK for working with Ethereum blob transactions (EIP-4844)',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-green-400 font-mono antialiased">{children}</body>
    </html>
  )
}
