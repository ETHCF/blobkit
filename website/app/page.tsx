export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">BLOBKIT</h1>
              <span className="ml-2 text-sm text-gray-500">v2.0.0</span>
            </div>
            <nav className="flex space-x-8">
              <a href="#quickstart" className="text-gray-700 hover:text-gray-900">Quick Start</a>
              <a href="#docs" className="text-gray-700 hover:text-gray-900">Docs</a>
              <a href="https://github.com/ETHCF/blobkit" className="text-gray-700 hover:text-gray-900">GitHub</a>
              <a href="https://www.npmjs.com/package/@blobkit/sdk" className="text-gray-700 hover:text-gray-900">NPM</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-5xl font-bold mb-6">BLOBKIT v2.0.0</h2>
          <p className="text-xl mb-4">[ETHEREUM/EIP-4844]</p>
          
          <div className="flex justify-center space-x-8 mb-8">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
              <span>ONLINE</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
              <span>NPM PUBLISHED</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
              <span>MAINNET READY</span>
            </div>
          </div>

          <p className="text-2xl mb-8">TypeScript SDK for Ethereum blob transactions (EIP-4844)</p>
          <p className="text-lg mb-12">Ephemeral data storage with cryptographic guarantees</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-2">128KB BLOB CAPACITY</h3>
              <p>Store up to 128KB of data per blob</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-2">~10-100X COST REDUCTION</h3>
              <p>Significantly cheaper than calldata</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-2">CRYPTOGRAPHIC PROOFS</h3>
              <p>KZG commitments ensure data integrity</p>
            </div>
          </div>

          <div className="flex justify-center space-x-4">
            <a 
              href="#quickstart" 
              className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Get Started
            </a>
            <a 
              href="https://github.com/ETHCF/blobkit" 
              className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Quick Start Section */}
      <section id="quickstart" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center mb-12">Quick Start</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-semibold mb-6">Installation</h3>
              <div className="bg-gray-900 text-gray-100 p-6 rounded-lg mb-6">
                <code>npm install @blobkit/sdk ethers</code>
              </div>
              
              <h3 className="text-2xl font-semibold mb-6">Basic Usage</h3>
              <div className="bg-gray-900 text-gray-100 p-6 rounded-lg text-sm">
                <pre>{`import { BlobKit, initializeKzg } from '@blobkit/sdk'
import { ethers } from 'ethers'

// Initialize KZG setup
await initializeKzg()

// Create wallet and BlobKit instance
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL)
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
const blobkit = await BlobKit.init({
  rpcUrl: process.env.RPC_URL,
  chainId: 1
}, wallet)

// Write data to blob space
const receipt = await blobkit.writeBlob({
  message: 'Hello, blob space!',
  timestamp: Date.now()
})

console.log('✓ Blob stored:', receipt.blobHash)

// Read data back
const data = await blobkit.readBlobAsJSON(receipt.blobTxHash)
console.log('✓ Data retrieved:', data)`}</pre>
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-semibold mb-6">Key Features</h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-4 mt-1">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Browser & Node.js Support</h4>
                    <p className="text-gray-600">Works in both environments with automatic detection</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-4 mt-1">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Proxy Architecture</h4>
                    <p className="text-gray-600">Browser clients use proxy servers for blob submission</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-4 mt-1">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Cost Control</h4>
                    <p className="text-gray-600">Built-in fee estimation and cost management</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-4 mt-1">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Archive Support</h4>
                    <p className="text-gray-600">Reads expired blobs from archive services</p>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center mr-4 mt-1">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <div>
                    <h4 className="font-semibold">Type Safety</h4>
                    <p className="text-gray-600">Full TypeScript support with comprehensive types</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center mb-12">Use Cases</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="text-3xl mb-4">💬</div>
              <h3 className="text-xl font-semibold mb-2">Ephemeral Messaging</h3>
              <p className="text-gray-600">Decentralized messaging with auto-expiry</p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Price Oracles</h3>
              <p className="text-gray-600">High-frequency data feeds with integrity</p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="text-3xl mb-4">🎮</div>
              <h3 className="text-xl font-semibold mb-2">Turn-Based Games</h3>
              <p className="text-gray-600">Store game moves with verifiable proofs</p>
            </div>
            
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="text-3xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold mb-2">Document Timestamping</h3>
              <p className="text-gray-600">Proof of existence without revealing content</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">BlobKit</h3>
              <p className="text-gray-400">TypeScript SDK for Ethereum blob transactions</p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <div className="space-y-2">
                <a href="https://github.com/ETHCF/blobkit" className="block text-gray-400 hover:text-white">GitHub</a>
                <a href="https://www.npmjs.com/package/@blobkit/sdk" className="block text-gray-400 hover:text-white">NPM</a>
                <a href="https://ceremony.ethereum.org/" className="block text-gray-400 hover:text-white">KZG Ceremony</a>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Documentation</h4>
              <div className="space-y-2">
                <span className="block text-gray-400">Quick Start</span>
                <span className="block text-gray-400">API Reference</span>
                <span className="block text-gray-400">Use Cases</span>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Community</h4>
              <div className="space-y-2">
                <span className="block text-gray-400">Built by Ethereum Community Foundation</span>
                <span className="block text-gray-400">Apache 2.0 License</span>
              </div>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>Built by Ethereum engineers for the cypherpunk future</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
