'use client'

import { useState, useEffect, useCallback } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Custom theme for terminal aesthetic
const customTheme = {
  ...atomDark,
  'pre[class*="language-"]': {
    ...atomDark['pre[class*="language-"]'],
    background: '#0a0a0a',
    fontSize: '13px',
    fontFamily: '"SF Mono", Consolas, "Liberation Mono", Menlo, Courier, monospace',
  },
  'code[class*="language-"]': {
    ...atomDark['code[class*="language-"]'],
    background: '#0a0a0a',
    fontSize: '13px',
  },
}

// Error codes for quick reference
const ERROR_CODES = [
  { code: 'UnauthorizedProxy', message: 'Proxy not authorized to complete job', section: 'escrow-management' },
  { code: 'JobNotFound', message: 'Job ID not found in escrow', section: 'escrow-management' },
  { code: 'JobExpired', message: 'Job has expired (>5 minutes)', section: 'escrow-management' },
  { code: 'InvalidProof', message: 'Transaction hash does not match', section: 'escrow-management' },
  { code: 'TransferFailed', message: 'ETH transfer to proxy failed', section: 'escrow-management' },
  { code: 'InsufficientBalance', message: 'Not enough ETH in escrow', section: 'escrow-management' },
  { code: 'BLOB_TOO_LARGE', message: 'Data exceeds blob size limit', section: 'error-handling' },
  { code: 'KZG_ERROR', message: 'KZG operation failed', section: 'error-handling' },
  { code: 'NETWORK_ERROR', message: 'Network request failed', section: 'error-handling' },
  { code: 'BLOB_NOT_FOUND', message: 'Blob not found (may have expired)', section: 'error-handling' },
]

// Quick reference data
const QUICK_REFERENCE = {
  mainnet: {
    proxy: 'https://proxy.blobkit.org',
    escrow: '0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838',
    chainId: 1,
  },
  sepolia: {
    proxy: 'https://proxy-sepolia.blobkit.org', 
    escrow: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77',
    chainId: 11155111,
  },
  limits: {
    blobSize: '~124KB usable per blob',
    maxBlobs: '6 per transaction',
    retention: '18 days',
    rateLimit: '10 requests/minute (default)',
    proxyFee: '0% (hosted proxy is FREE)',
  }
}

export default function Home() {
  const [copied, setCopied] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('introduction')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  
  // Close sidebar on mobile when window is resized to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{id: string, title: string, content: string, type: string}>>([])
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showQuickRef, setShowQuickRef] = useState(false)
  const [readingProgress, setReadingProgress] = useState(0)
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)
  const [showToc, setShowToc] = useState(false)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)

  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout
    
    const handleScroll = () => {
      // Debounce the scroll handler for smoother updates
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => {
        // Get all sections and subsections
        const allSections = document.querySelectorAll('section[id], div[id]')
        let current = ''
        const scrollPosition = window.scrollY
        const offset = 150 // Account for fixed header
        
        // Find the section that's most prominently in view
        interface SectionMatch { id: string; score: number }
        let bestMatch: SectionMatch | null = null
        
        allSections.forEach((element) => {
          const htmlElement = element as HTMLElement
          // Skip elements that are not actual content sections
          if (htmlElement.id.includes('modal') || htmlElement.id.includes('search') || 
              htmlElement.id.includes('quick-ref') || htmlElement.id.includes('toc')) {
            return
          }
          
          const rect = htmlElement.getBoundingClientRect()
          const elementTop = rect.top + scrollPosition
          const elementBottom = elementTop + rect.height
          const elementMiddle = elementTop + rect.height / 2
          
          // Calculate how much of the element is in the viewport
          const viewportTop = scrollPosition + offset
          const viewportBottom = scrollPosition + window.innerHeight
          const viewportMiddle = scrollPosition + window.innerHeight / 2
          
          // Score based on how centered the element is in the viewport
          if (elementTop <= viewportMiddle && elementBottom >= viewportTop) {
            // Calculate distance from element middle to viewport middle
            const distanceFromCenter = Math.abs(elementMiddle - viewportMiddle)
            const maxDistance = window.innerHeight
            const score = 1 - (distanceFromCenter / maxDistance)
            
            // Prefer smaller elements (subsections) when scores are close
            const sizeBonus = rect.height < 500 ? 0.1 : 0
            const finalScore = score + sizeBonus
            
            if (!bestMatch || finalScore > bestMatch.score) {
              bestMatch = { id: htmlElement.id, score: finalScore }
            }
          }
        })
        
        if (bestMatch !== null && bestMatch) {
          current = (bestMatch as SectionMatch).id
        }
        
        if (current && current !== activeSection) {
          setActiveSection(current)
          
          // Update current section index for prev/next navigation
          const sectionIndex = sections.findIndex(s => 
            s.id === current || s.subsections?.some(sub => sub.id === current)
          )
          if (sectionIndex !== -1) {
            setCurrentSectionIndex(sectionIndex)
          }
          
          // Auto-scroll sidebar to show active item
          const activeNavButton = document.querySelector(`[data-nav-id="${current}"]`)
          if (activeNavButton) {
            activeNavButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }
        }
      }, 50) // 50ms debounce
      
      // These don't need debouncing
      setShowBackToTop(window.scrollY > 500)
      
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight
      const scrolled = (winScroll / height) * 100
      setReadingProgress(scrolled)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimeout)
    }
  }, [activeSection])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      // Escape to close modals
      if (e.key === 'Escape') {
        if (searchOpen) {
          setSearchOpen(false)
          setSearchQuery('')
          setSearchResults([])
        }
        if (showQuickRef) setShowQuickRef(false)
        if (showToc) setShowToc(false)
      }
      // Arrow keys for navigation (when not in input)
      if (!searchOpen && document.activeElement?.tagName !== 'INPUT') {
        if (e.key === 'ArrowLeft' && currentSectionIndex > 0) {
          e.preventDefault()
          scrollToSection(sections[currentSectionIndex - 1].id)
        }
        if (e.key === 'ArrowRight' && currentSectionIndex < sections.length - 1) {
          e.preventDefault()
          scrollToSection(sections[currentSectionIndex + 1].id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen, showQuickRef, showToc, currentSectionIndex])

  // Search functionality
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    const results: Array<{id: string, title: string, content: string, type: string}> = []
    const lowerQuery = query.toLowerCase()

    // Search in error codes
    ERROR_CODES.forEach(error => {
      if (error.code.toLowerCase().includes(lowerQuery) || 
          error.message.toLowerCase().includes(lowerQuery)) {
        results.push({
          id: error.section,
          title: error.code,
          content: error.message,
          type: 'error'
        })
      }
    })

    // Search in sections
    const searchableContent = [
      { id: 'introduction', title: 'Introduction', content: 'blob storage ethereum eip-4844 cheap storage' },
      { id: 'quickstart', title: 'Quickstart', content: 'getting started first blob hello world' },
      { id: 'installation', title: 'Installation', content: 'npm install package setup environment' },
      { id: 'initialization', title: 'Initialization', content: 'blobkit init setup configuration' },
      { id: 'writing-data', title: 'Writing Data', content: 'write blob submit store data' },
      { id: 'reading-data', title: 'Reading Data', content: 'read blob fetch retrieve data' },
      { id: 'cost-management', title: 'Cost Management', content: 'estimate costs fees pricing gas' },
      { id: 'hosted-proxy', title: 'Hosted Proxy', content: 'proxy server mainnet sepolia urls' },
      { id: 'escrow-management', title: 'Escrow Management', content: 'deposit balance refund insufficient' },
      { id: 'production-checklist', title: 'Production Checklist', content: 'deploy production mainnet security' },
      { id: 'monitoring', title: 'Monitoring', content: 'metrics logging debug observability' },
      { id: 'cost-optimization', title: 'Cost Optimization', content: 'optimize reduce costs batch compress' },
      { id: 'error-handling', title: 'Error Handling', content: 'errors exceptions troubleshooting' },
      { id: 'api-reference', title: 'API Reference', content: 'api methods functions reference' },
      { id: 'troubleshooting', title: 'Troubleshooting', content: 'problems issues solutions debug' },
    ]

    searchableContent.forEach(item => {
      if (item.title.toLowerCase().includes(lowerQuery) || 
          item.content.toLowerCase().includes(lowerQuery)) {
        results.push({
          id: item.id,
          title: item.title,
          content: item.content,
          type: 'section'
        })
      }
    })

    setSearchResults(results.slice(0, 10)) // Limit to 10 results
  }, [])

  const copyToClipboard = async (text: string, id: string) => {
    try {
      // Try using the modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        // Fallback for non-secure contexts or older browsers
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      // Still show feedback even if copy failed
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.scrollY - offset
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
      
      // Immediately update active section for instant navigation feedback
      setActiveSection(id)
      
      // Also update the section index for prev/next buttons
      const sectionIndex = sections.findIndex(s => 
        s.id === id || s.subsections?.some(sub => sub.id === id)
      )
      if (sectionIndex !== -1) {
        setCurrentSectionIndex(sectionIndex)
      }
      
      // Scroll the sidebar to show the active navigation item
      setTimeout(() => {
        const activeNavButton = document.querySelector(`[data-nav-id="${id}"]`)
        if (activeNavButton) {
          activeNavButton.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      
      // Close mobile sidebar
      if (window.innerWidth < 1024) {
        setSidebarOpen(false)
      }
      
      // Close search if open
      if (searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
        setSearchResults([])
      }
    }
  }

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  const CodeBlock = ({ 
    code, 
    language = 'typescript',
    showLineNumbers = false,
    filename = ''
  }: { 
    code: string
    language?: string
    showLineNumbers?: boolean
    filename?: string
  }) => {
    const id = Math.random().toString(36).substring(7)
    
    return (
      <div className="relative group my-4">
        <div className="border border-green-400/20 rounded-lg overflow-x-auto bg-black/50">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-green-400/20 bg-black/70">
            <div className="text-xs">
              {filename ? (
                <span className="text-yellow-400">{filename}</span>
              ) : (
                <span className="text-green-400/70">{language.toUpperCase()}</span>
              )}
            </div>
            <button 
              onClick={() => copyToClipboard(code, id)}
              className={`text-xs px-2 py-1 border rounded transition-all ${
                copied === id 
                  ? 'border-green-400 bg-green-400/20 text-green-400' 
                  : 'border-green-400/50 hover:border-green-400 hover:bg-green-400/10'
              }`}
            >
              <span className="flex items-center gap-1">
                {copied === id ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    COPIED
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    COPY
                  </>
                )}
              </span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <SyntaxHighlighter
              language={language}
              style={customTheme}
              showLineNumbers={showLineNumbers}
              customStyle={{
                margin: 0,
                padding: '12px',
                background: 'transparent',
                fontSize: '0.75rem',
              }}
              wrapLongLines={false}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    )
  }

  const sections = [
    { 
      id: 'introduction', 
      title: 'Introduction', 
      icon: '🌟',
      subsections: [
        { id: 'what-are-blobs', title: 'What Are Blobs?' },
        { id: 'why-blobkit', title: 'Why BlobKit?' },
        { id: 'use-cases', title: 'Use Cases' },
      ]
    },
    { 
      id: 'quickstart', 
      title: 'Quickstart', 
      icon: '🚀',
      subsections: [
        { id: 'prerequisites', title: 'Prerequisites' },
        { id: 'first-blob', title: 'Your First Blob' },
      ]
    },
    { 
      id: 'architecture', 
      title: 'How It Works', 
      icon: '🔧',
      subsections: [
        { id: 'blob-transactions', title: 'Blob Transactions' },
        { id: 'wallet-problem', title: 'The Wallet Problem' },
        { id: 'proxy-solution', title: 'The Proxy Solution' },
        { id: 'escrow-system', title: 'Escrow System' },
      ]
    },
    { 
      id: 'installation', 
      title: 'Installation', 
      icon: '📦',
      subsections: [
        { id: 'package-install', title: 'Package Install' },
        { id: 'environment-setup', title: 'Environment Setup' },
      ]
    },
    { 
      id: 'usage', 
      title: 'Basic Usage', 
      icon: '💻',
      subsections: [
        { id: 'initialization', title: 'Initialization' },
        { id: 'writing-data', title: 'Writing Data' },
        { id: 'reading-data', title: 'Reading Data' },
        { id: 'cost-management', title: 'Cost Management' },
      ]
    },
    { 
      id: 'proxy', 
      title: 'Proxy System', 
      icon: '🔄',
      subsections: [
        { id: 'hosted-proxy', title: 'Using Hosted Proxy' },
        { id: 'escrow-management', title: 'Escrow Management' },
        { id: 'deploy-proxy', title: 'Deploy Your Own' },
      ]
    },
    { 
      id: 'production', 
      title: 'Production Guide', 
      icon: '🚀',
      subsections: [
        { id: 'production-checklist', title: 'Checklist' },
        { id: 'monitoring', title: 'Monitoring' },
        { id: 'cost-optimization', title: 'Cost Optimization' },
      ]
    },
    { 
      id: 'examples', 
      title: 'Examples', 
      icon: '📝',
      subsections: [
        { id: 'complete-app', title: 'Complete App' },
        { id: 'error-handling', title: 'Error Handling' },
      ]
    },
    { 
      id: 'troubleshooting', 
      title: 'Troubleshooting', 
      icon: '❓',
      subsections: [
        { id: 'error-index', title: 'Error Index' },
        { id: 'common-issues', title: 'Common Issues' }
      ]
    },
    {
      id: 'advanced-config',
      title: 'Advanced Config',
      icon: '⚙️',
      subsections: [
        { id: 'all-config-options', title: 'All Configuration Options' },
        { id: 'env-setup', title: 'Environment-Based Setup' },
        { id: 'compression', title: 'Compression Settings' }
      ]
    },
    {
      id: 'metrics',
      title: 'Metrics',
      icon: '📊',
      subsections: [
        { id: 'metrics-hooks', title: 'Metrics Hooks' }
      ]
    },
    {
      id: 'codecs',
      title: 'Codecs',
      icon: '🔄',
      subsections: [
        { id: 'built-in-codecs', title: 'Built-in Codecs' }
      ]
    },
    {
      id: 'utilities',
      title: 'Utilities',
      icon: '🔧',
      subsections: [
        { id: 'data-conversion', title: 'Data Conversion' },
        { id: 'validation', title: 'Validation Functions' },
        { id: 'job-management', title: 'Job Management' },
        { id: 'constants', title: 'Constants' }
      ]
    },
    {
      id: 'api-reference',
      title: 'API Reference',
      icon: '📖',
      subsections: [
        { id: 'blobkit-class', title: 'BlobKit Class' },
        { id: 'write-methods', title: 'Write Methods' },
        { id: 'read-methods', title: 'Read Methods' },
        { id: 'payment-methods', title: 'Payment Methods' },
        { id: 'direct-components', title: 'Direct Components' },
        { id: 'kzg-functions', title: 'KZG Functions' }
      ]
    },
    {
      id: 'limitations',
      title: 'Limitations',
      icon: '⚠️',
    },
    {
      id: 'faq',
      title: 'FAQ',
      icon: '💬',
    },
  ]

  // FAQ data
  const faqs = [
    {
      id: 'faq-1',
      question: 'Why do I need a proxy server?',
      answer: 'MetaMask and most wallets don\'t support EIP-4844 blob transactions yet. The proxy handles the complex KZG cryptography and Type 3 transaction format that wallets can\'t process.'
    },
    {
      id: 'faq-2', 
      question: 'How much does it cost to store data?',
      answer: 'Blob storage costs 10-100x less than regular Ethereum storage. Expect to pay $0.01-$1 for ~124KB of data, depending on network congestion.'
    },
    {
      id: 'faq-3',
      question: 'How long is my data available?',
      answer: 'Blob data is guaranteed available for 18 days. After that, nodes may delete it. Use an archive service like Blobscan for permanent storage.'
    },
    {
      id: 'faq-4',
      question: 'What\'s the maximum data size?',
      answer: 'Each blob can hold ~124KB of usable data after encoding overhead. You can submit up to 6 blobs in a single transaction for ~744KB total.'
    },
    {
      id: 'faq-5',
      question: 'Is the hosted proxy really free?',
      answer: 'Yes! The hosted proxy at proxy.blobkit.org has no fees. You only pay the Ethereum blob gas costs. Self-hosted proxies can configure their own fees.'
    }
  ]

  return (
    <div className="min-h-screen bg-black text-green-400">
      {/* Reading Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 bg-black/50 z-50">
        <div 
          className="h-full bg-gradient-to-r from-green-400 to-cyan-400 transition-all duration-300"
          style={{ width: `${readingProgress}%` }}
        />
      </div>
      {/* Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20">
          <div className="w-full max-w-2xl bg-black border border-green-400/30 rounded-lg shadow-2xl">
            <div className="p-4 border-b border-green-400/20">
              <div className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    performSearch(e.target.value)
                  }}
                  placeholder="Search documentation... (ESC to close)"
                  className="flex-1 bg-transparent outline-none text-green-400 placeholder-green-400/40"
                  autoFocus
                />
                <kbd className="px-2 py-1 text-xs border border-green-400/30 rounded">ESC</kbd>
              </div>
            </div>
            {searchResults.length > 0 && (
              <div className="max-h-96 overflow-y-auto">
                {searchResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToSection(result.id)}
                    className="w-full text-left p-4 hover:bg-green-400/10 border-b border-green-400/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {result.type === 'error' && (
                        <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded">ERROR</span>
                      )}
                      <span className="text-cyan-400 font-semibold">{result.title}</span>
                    </div>
                    <p className="text-xs text-green-400/60 mt-1">{result.content}</p>
                  </button>
                ))}
              </div>
            )}
            {searchQuery && searchResults.length === 0 && (
              <div className="p-8 text-center text-green-400/60">
                No results found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Reference Card */}
      {showQuickRef && (
        <div className="fixed top-24 right-4 z-50 w-80 bg-black border border-green-400/30 rounded-lg shadow-2xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-cyan-400 font-bold">Quick Reference</h3>
            <button
              onClick={() => setShowQuickRef(false)}
              className="text-green-400/60 hover:text-green-400"
            >
              ✕
            </button>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <h4 className="text-yellow-400 mb-1">Mainnet</h4>
              <div className="space-y-1 text-xs">
                <div><span className="text-green-400/70">Proxy:</span> <code className="text-cyan-400">{QUICK_REFERENCE.mainnet.proxy}</code></div>
                <div><span className="text-green-400/70">Escrow:</span> <code className="text-cyan-400">{QUICK_REFERENCE.mainnet.escrow}</code></div>
              </div>
            </div>
            <div>
              <h4 className="text-yellow-400 mb-1">Sepolia</h4>
              <div className="space-y-1 text-xs">
                <div><span className="text-green-400/70">Proxy:</span> <code className="text-cyan-400">{QUICK_REFERENCE.sepolia.proxy}</code></div>
                <div><span className="text-green-400/70">Escrow:</span> <code className="text-cyan-400">{QUICK_REFERENCE.sepolia.escrow}</code></div>
              </div>
            </div>
            <div>
              <h4 className="text-yellow-400 mb-1">Limits</h4>
              <div className="space-y-1 text-xs">
                {Object.entries(QUICK_REFERENCE.limits).map(([key, value]) => (
                  <div key={key}><span className="text-green-400/70">{key}:</span> <span className="text-cyan-400">{value}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Buttons - 2x2 Grid */}
      <div className="fixed bottom-20 sm:bottom-8 right-3 sm:right-8 z-50 grid grid-cols-2 gap-1 sm:gap-2">
        {/* Previous Button - Top Left */}
        <button
          onClick={() => currentSectionIndex > 0 && scrollToSection(sections[currentSectionIndex - 1].id)}
          className={`p-2 sm:p-3 border border-green-400/30 rounded-full transition-all group relative ${
            currentSectionIndex > 0 
              ? 'bg-green-400/20 hover:bg-green-400/30 cursor-pointer' 
              : 'bg-black/20 opacity-30 cursor-not-allowed'
          }`}
          aria-label="Previous section"
          disabled={currentSectionIndex === 0}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {currentSectionIndex > 0 && (
            <span className="hidden sm:block absolute right-full mr-3 px-2 py-1 bg-black border border-green-400/30 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              {sections[currentSectionIndex - 1]?.title}
            </span>
          )}
        </button>
        
        {/* Next Button - Top Right */}
        <button
          onClick={() => currentSectionIndex < sections.length - 1 && scrollToSection(sections[currentSectionIndex + 1].id)}
          className={`p-2 sm:p-3 border border-green-400/30 rounded-full transition-all group relative ${
            currentSectionIndex < sections.length - 1
              ? 'bg-green-400/20 hover:bg-green-400/30 cursor-pointer'
              : 'bg-black/20 opacity-30 cursor-not-allowed'
          }`}
          aria-label="Next section"
          disabled={currentSectionIndex === sections.length - 1}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {currentSectionIndex < sections.length - 1 && (
            <span className="hidden sm:block absolute right-full mr-3 px-2 py-1 bg-black border border-green-400/30 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              {sections[currentSectionIndex + 1]?.title}
            </span>
          )}
        </button>
        
        {/* Table of Contents - Bottom Left */}
        <button
          onClick={() => setShowToc(!showToc)}
          className="p-2 sm:p-3 bg-green-400/20 hover:bg-green-400/30 border border-green-400/30 rounded-full transition-all group relative"
          aria-label="Table of contents"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="hidden sm:block absolute right-full mr-3 px-2 py-1 bg-black border border-green-400/30 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            Table of Contents
          </span>
        </button>
        
        {/* Back to Top - Bottom Right */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={`p-2 sm:p-3 border border-green-400/30 rounded-full transition-all group relative ${
            showBackToTop
              ? 'bg-green-400/20 hover:bg-green-400/30 cursor-pointer'
              : 'bg-black/20 opacity-30 cursor-not-allowed'
          }`}
          aria-label="Back to top"
          disabled={!showBackToTop}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
          {showBackToTop && (
            <span className="hidden sm:block absolute right-full mr-3 px-2 py-1 bg-black border border-green-400/30 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              Back to Top
            </span>
          )}
        </button>
      </div>

      {/* Floating Table of Contents */}
      {showToc && (
        <div className="fixed bottom-24 right-8 w-64 max-h-96 bg-black border border-green-400/30 rounded-lg p-4 overflow-y-auto z-40">
          <h3 className="text-sm font-bold mb-3 text-cyan-400">On This Page</h3>
          <div className="space-y-1">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => {
                  scrollToSection(section.id)
                  setShowToc(false)
                }}
                className={`w-full text-left text-xs px-2 py-1 rounded hover:bg-green-400/10 transition-colors ${
                  activeSection === section.id ? 'bg-green-400/10 text-green-400' : 'text-gray-400'
                }`}
              >
                {section.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-sm border-b border-green-400/20">
        <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-1.5 sm:p-2 hover:bg-green-400/10 rounded"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-cyan-400">BLOBKIT v2.0.0</h1>
              <p className="hidden sm:block text-xs text-green-400/70">Ethereum Blob Storage SDK</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 text-xs sm:text-sm border border-green-400/30 rounded hover:bg-green-400/10 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline px-1 text-xs border border-green-400/20 rounded">⌘K</kbd>
            </button>
            <button
              onClick={() => setShowQuickRef(!showQuickRef)}
              className="hidden sm:block px-3 py-1 text-sm border border-green-400/30 rounded hover:bg-green-400/10 transition-colors"
            >
              Quick Ref
            </button>
            <div className="hidden sm:flex gap-4 text-sm">
              <a href="https://github.com/ETHCF/blobkit" className="text-cyan-400 hover:text-cyan-300">GitHub</a>
              <a href="https://npmjs.com/package/@blobkit/sdk" className="text-cyan-400 hover:text-cyan-300">NPM</a>
              <a href="https://eips.ethereum.org/EIPS/eip-4844" className="text-cyan-400 hover:text-cyan-300">EIP-4844</a>
            </div>
          </div>
        </div>
      </header>

      <div className="flex pt-14 sm:pt-20">
        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* Sidebar Navigation */}
        <aside className={`fixed left-0 top-14 sm:top-20 bottom-0 w-64 bg-black/95 lg:bg-black/50 border-r border-green-400/20 overflow-y-auto transition-transform z-40 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}>
          {/* Mobile Close Button */}
          <div className="lg:hidden flex justify-end p-4 border-b border-green-400/20">
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 hover:bg-green-400/10 rounded transition-colors"
              aria-label="Close navigation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <nav className="p-4">
            {sections.map((section) => (
              <div key={section.id} className="mb-4">
                <button
                  data-nav-id={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded transition-all duration-300 flex items-center gap-2 ${
                    activeSection === section.id || section.subsections?.some(s => s.id === activeSection)
                      ? 'bg-green-400/20 text-green-300 border-l-2 border-green-400'
                      : 'hover:bg-green-400/10 border-l-2 border-transparent'
                  }`}
                >
                  <span className="text-lg">{section.icon}</span>
                  <span className="text-sm font-semibold flex-1">{section.title}</span>
                  {section.subsections && (
                    <span className="text-xs text-green-400/40">▼</span>
                  )}
                </button>
                {section.subsections && (
                  <div className="ml-8 mt-1 space-y-1">
                    {section.subsections.map((sub) => (
                      <button
                        key={sub.id}
                        data-nav-id={sub.id}
                        onClick={() => scrollToSection(sub.id)}
                        className={`w-full text-left px-3 py-1.5 text-xs rounded transition-all duration-300 ${
                          activeSection === sub.id
                            ? 'text-cyan-400 bg-cyan-400/10 font-medium border-l-2 border-cyan-400 ml-[-2px]'
                            : 'text-green-400/60 hover:text-green-400 hover:bg-green-400/5 border-l-2 border-transparent ml-[-2px]'
                        }`}
                      >
                        {sub.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 transition-all lg:ml-64">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
            
            {/* Breadcrumb Navigation */}
            {activeSection && activeSection !== 'introduction' && (
              <div className="mb-6 text-xs text-green-400/60 flex items-center gap-2">
                <button 
                  onClick={() => scrollToSection('introduction')}
                  className="hover:text-green-400 transition-colors"
                >
                  Home
                </button>
                <span>{'>'}</span>
                {(() => {
                  const parentSection = sections.find(s => 
                    s.id === activeSection || s.subsections?.some(sub => sub.id === activeSection)
                  )
                  const isSubsection = parentSection?.subsections?.some(sub => sub.id === activeSection)
                  
                  if (isSubsection && parentSection) {
                    const subsection = parentSection.subsections?.find(sub => sub.id === activeSection)
                    return (
                      <>
                        <button 
                          onClick={() => scrollToSection(parentSection.id)}
                          className="hover:text-green-400 transition-colors"
                        >
                          {parentSection.title}
                        </button>
                        <span>{'>'}</span>
                        <span className="text-green-400">{subsection?.title}</span>
                      </>
                    )
                  }
                  return <span className="text-green-400">{parentSection?.title}</span>
                })()}
              </div>
            )}
            
            {/* Keyboard Shortcuts Hint */}
            <div className="hidden lg:block mb-4 text-xs text-green-400/40">
              <span className="mr-4">⌘K to search</span>
              <span className="mr-4">← → to navigate sections</span>
              <span>ESC to close modals</span>
            </div>
            
            {/* Introduction Section */}
            <section id="introduction" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">🌟 Introduction</h2>
              
              <div className="bg-gradient-to-r from-cyan-400/10 to-green-400/10 border border-cyan-400/30 rounded-lg p-6 mb-8">
                <h3 className="text-xl font-bold text-cyan-400 mb-3">10-100x Cheaper Ethereum Storage</h3>
                <p className="text-sm mb-4">
                  EIP-4844 introduced blob space to Ethereum. This is a new type of data storage that costs 10-100x less than regular transactions. 
                  BlobKit makes it easy to use this new storage layer, even though wallets don't support it yet.
                </p>
                <p className="text-sm">
                  <strong className="text-yellow-400">The numbers:</strong> Store ~124KB of data for $0.01-$1. 
                  Data stays available for 18 days, which is perfect for temporary storage needs.
                </p>
              </div>

              <div id="what-are-blobs" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">What Are Blobs?</h3>
                
                <div className="space-y-4">
                  <p className="text-sm">
                    Blobs are a new type of data attached to Ethereum transactions. They were added in March 2024 to make Ethereum cheaper for Layer 2 rollups.
                  </p>
                  
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">How Blobs Are Different</h4>
                    <ul className="space-y-2 text-sm">
                      <li><strong className="text-yellow-400">Size:</strong> <span className="text-green-400">Each blob is 128KB (131,072 bytes), but usable capacity is ~124KB after encoding overhead</span></li>
                      <li><strong className="text-yellow-400">Cost:</strong> <span className="text-green-400">Uses separate gas pricing that's much cheaper than regular gas</span></li>
                      <li><strong className="text-yellow-400">Storage:</strong> <span className="text-green-400">Data is guaranteed available for 18 days, then nodes can delete it</span></li>
                      <li><strong className="text-yellow-400">Commitment:</strong> <span className="text-green-400">Uses KZG cryptography to prove data availability without storing it forever</span></li>
                      <li><strong className="text-yellow-400">Access:</strong> <span className="text-green-400">Can't be accessed from smart contracts, only from consensus layer</span></li>
                    </ul>
                  </div>

                  <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Think of blobs like a bulletin board:</strong> You can post notices that everyone can read for a few weeks, 
                      then they get taken down. Much cheaper than carving messages in stone (permanent storage).
                    </p>
                  </div>
                </div>
              </div>

              <div id="why-blobkit" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Why BlobKit?</h3>
                
                <div className="space-y-4">
                  <p className="text-sm">
                    Blob transactions are powerful but complex. They require special cryptography (KZG commitments) and a new transaction format 
                    that wallets like MetaMask don't support yet. BlobKit solves these problems.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">Without BlobKit</h4>
                      <ul className="space-y-1 text-sm text-green-400/70">
                        <li>❌ Implement KZG cryptography yourself</li>
                        <li>❌ Build custom transaction encoding</li>
                        <li>❌ Can't use MetaMask or other wallets</li>
                        <li>❌ Handle blob gas pricing manually</li>
                        <li>❌ Write custom archival logic</li>
                      </ul>
                    </div>
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">With BlobKit</h4>
                      <ul className="space-y-1 text-sm">
                        <li>✅ One function to write blobs</li>
                        <li>✅ Works with any wallet</li>
                        <li>✅ Automatic KZG handling</li>
                        <li>✅ Built-in cost estimation</li>
                        <li>✅ Archive support included</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div id="use-cases" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">What Can You Build?</h3>
                
                <div className="space-y-4">
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Layer 2 Rollups</h4>
                    <p className="text-sm">
                      Rollups post transaction batches to blob space. This is why blob space was created. 
                      Arbitrum, Optimism, and others save millions in fees using blobs.
                    </p>
                  </div>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Decentralized Social Media</h4>
                    <p className="text-sm">
                      Store posts, comments, and media that need temporary blockchain guarantees. 
                      Perfect for content that needs censorship resistance for a few weeks.
                    </p>
                  </div>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Gaming & NFTs</h4>
                    <p className="text-sm">
                      Store game states, leaderboards, or NFT metadata during reveal events. 
                      Much cheaper than permanent storage for temporary data.
                    </p>
                  </div>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Data Availability</h4>
                    <p className="text-sm">
                      Build data availability layers for sidechains or validiums. 
                      Guarantee data is available without paying for permanent storage.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Quickstart Section */}
            <section id="quickstart" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">🚀 Quickstart</h2>
              
              <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-6 mb-8">
                <p className="text-sm">
                  Get your first blob on Ethereum in 5 minutes. We'll use the Sepolia testnet so it's free to try.
                </p>
              </div>

              <div id="prerequisites" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Prerequisites</h3>
                
                <div className="space-y-4">
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">You Need These</h4>
                    <ul className="space-y-2 text-sm">
                      <li>✓ <span className="text-yellow-400">Node.js v16+</span> (<a href="https://nodejs.org" className="text-cyan-400">nodejs.org</a>)</li>
                      <li>✓ <span className="text-yellow-400">A code editor</span> like VS Code</li>
                      <li>✓ <span className="text-yellow-400">An Ethereum RPC URL</span> (free from <a href="https://alchemy.com" className="text-cyan-400">Alchemy</a>)</li>
                      <li>✓ <span className="text-yellow-400">A test wallet</span> with private key</li>
                      <li>✓ <span className="text-yellow-400">Some Sepolia ETH</span> (free from <a href="https://sepoliafaucet.com" className="text-cyan-400">faucet</a>)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div id="first-blob" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Your First Blob</h3>
                
                <div className="space-y-6">
                  <div>
                    <p className="text-sm mb-3 text-green-400">Step 1: Set up project</p>
                    <CodeBlock 
                      code={`mkdir my-blob-app
cd my-blob-app
npm init -y
npm install @blobkit/sdk ethers dotenv`}
                      language="bash"
                    />
                  </div>

                  <div>
                    <p className="text-sm mb-3 text-green-400">Step 2: Configure environment</p>
                    <CodeBlock 
                      code={`# Create .env file with these values:
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
CHAIN_ID=11155111

# Use proxy because MetaMask can't send blob transactions
PROXY_URL=https://proxy-sepolia.blobkit.org`}
                      language="bash"
                      filename=".env"
                    />
                  </div>

                  <div>
                    <p className="text-sm mb-3 text-green-400">Step 3: Write and run code</p>
                    <CodeBlock 
                      code={`require('dotenv').config();
const { BlobKit, initializeKzg } = require('@blobkit/sdk');
const { ethers } = require('ethers');

async function main() {
  // Initialize KZG cryptography (required for blobs)
  await initializeKzg();
  
  // Connect to Ethereum
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  // Create BlobKit with proxy (because wallets can't send blobs)
  const blobkit = new BlobKit({
    rpcUrl: process.env.RPC_URL,
    chainId: parseInt(process.env.CHAIN_ID),
    proxyUrl: process.env.PROXY_URL  // Proxy handles blob transaction
  }, wallet);
  
  // Initialize async components
  await blobkit.initialize();
  
  // Write data to blob space
  const data = { message: 'Hello Blobs!', timestamp: Date.now() };
  const receipt = await blobkit.writeBlob(data);
  
  console.log('Blob stored! TX:', receipt.blobTxHash);
  
  // Read it back
  const retrieved = await blobkit.readBlobAsJSON(receipt.blobTxHash);
  console.log('Retrieved:', retrieved);
}

main().catch(console.error);`}
                      language="javascript"
                      filename="index.js"
                    />
                  </div>

                  <div>
                    <p className="text-sm mb-3 text-green-400">Run it:</p>
                    <CodeBlock code="node index.js" language="bash" />
                  </div>
                </div>
              </div>
            </section>

            {/* Architecture Section */}
            <section id="architecture" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">🔧 How It Works</h2>
              
              <div className="bg-blue-400/10 border border-blue-400/30 rounded-lg p-6 mb-8">
                <p className="text-sm">
                  Understanding how BlobKit works helps you use it effectively. Let's break down the architecture.
                </p>
              </div>

              <div id="blob-transactions" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Blob Transactions Explained</h3>
                
                <div className="space-y-4">
                  <p className="text-sm">
                    Blob transactions (Type 3) are special Ethereum transactions that carry blob data. They're different from regular transactions:
                  </p>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Transaction Structure</h4>
                    <CodeBlock 
                      code={`// Regular transaction (Type 2)
{
  to: "0x...",
  value: "1000000000000000000",
  data: "0x...",
  gasLimit: 21000,
  maxFeePerGas: "20000000000"
}

// Blob transaction (Type 3) 
{
  to: "0x...",
  value: "1000000000000000000",
  data: "0x...",
  gasLimit: 21000,
  maxFeePerGas: "20000000000",
  
  // New blob fields
  blobVersionedHashes: ["0x01..."],  // KZG commitments
  maxFeePerBlobGas: "1000000000",    // Blob gas price
  blobs: [/* 128KB blob data */],    // Actual data
  kzgCommitments: ["0x..."],         // Cryptographic commitments
  kzgProofs: ["0x..."]                // Cryptographic proofs
}`}
                      language="javascript"
                    />
                  </div>

                  <p className="text-sm">
                    The blob data isn't stored in blocks. Only the commitment (a cryptographic hash) goes on-chain. 
                    The actual blob data is shared separately and nodes keep it for 18 days.
                  </p>
                </div>
              </div>

              <div id="wallet-problem" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">The Wallet Problem</h3>
                
                <div className="space-y-4">
                  <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-4">
                    <h4 className="text-red-400 mb-2">Why Wallets Can't Send Blobs</h4>
                    <p className="text-sm">
                      MetaMask, Rainbow, and other wallets don't support Type 3 transactions yet. They can't:
                    </p>
                    <ul className="space-y-1 text-sm mt-2">
                      <li>• Generate KZG commitments and proofs</li>
                      <li>• Format blob transactions correctly</li>
                      <li>• Calculate blob gas costs</li>
                      <li>• Display blob data to users</li>
                    </ul>
                  </div>

                  <p className="text-sm">
                    This is a chicken-and-egg problem. Wallets won't add support until there are apps using blobs, 
                    but apps can't use blobs without wallet support. BlobKit solves this with a proxy system.
                  </p>
                </div>
              </div>

              <div id="proxy-solution" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">The Proxy Solution</h3>
                
                <div className="space-y-4">
                  <p className="text-sm">
                    Since wallets can't send blob transactions, BlobKit uses a proxy server that can. Here's how it works:
                  </p>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-3">Proxy Flow</h4>
                    <ol className="space-y-2 text-sm">
                      <li><strong className="text-yellow-400">1. You send data to proxy:</strong> <span className="text-green-400">Your app sends the blob data to the proxy server</span></li>
                      <li><strong className="text-yellow-400">2. Proxy creates blob transaction:</strong> <span className="text-green-400">Server generates KZG commitments and formats Type 3 transaction</span></li>
                      <li><strong className="text-yellow-400">3. Proxy pays gas:</strong> <span className="text-green-400">Server wallet pays the gas fees upfront</span></li>
                      <li><strong className="text-yellow-400">4. You reimburse proxy:</strong> <span className="text-green-400">Cost is deducted from your escrow deposit</span></li>
                      <li><strong className="text-yellow-400">5. You get receipt:</strong> <span className="text-green-400">Transaction hash returned for reading the blob</span></li>
                    </ol>
                  </div>

                  <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Why this works:</strong> The proxy has a regular Ethereum wallet that can send any transaction type. 
                      Your wallet just needs to deposit funds to the escrow contract (a regular transaction that any wallet can do).
                    </p>
                  </div>

                  <CodeBlock 
                    code={`// Without proxy (doesn't work with MetaMask)
const tx = await wallet.sendTransaction({
  type: 3,  // MetaMask: "Unknown transaction type"
  blobs: [blobData],
  kzgCommitments: [commitment],
  // ... more blob fields
});

// With proxy (works with any wallet)
const blobkit = await BlobKit.init({
  proxyUrl: 'https://proxy.blobkit.org'
}, wallet);

// Just send data, proxy handles everything
const receipt = await blobkit.writeBlob(data);`}
                    language="javascript"
                  />
                </div>
              </div>

              <div id="escrow-system" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Escrow System</h3>
                
                <div className="space-y-4">
                  <p className="text-sm">
                    The proxy needs payment for gas fees. This happens through an escrow smart contract:
                  </p>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">How Escrow Works</h4>
                    <ol className="space-y-2 text-sm">
                      <li><strong className="text-yellow-400">1. Deposit funds:</strong> <span className="text-green-400">You deposit ETH to the escrow contract</span></li>
                      <li><strong className="text-yellow-400">2. Submit blob:</strong> <span className="text-green-400">You request blob storage through proxy</span></li>
                      <li><strong className="text-yellow-400">3. Proxy executes:</strong> <span className="text-green-400">Proxy sends blob transaction and pays gas</span></li>
                      <li><strong className="text-yellow-400">4. Proxy claims payment:</strong> <span className="text-green-400">Proxy proves job completion to escrow</span></li>
                      <li><strong className="text-yellow-400">5. Escrow releases funds:</strong> <span className="text-green-400">Contract pays proxy from your deposit</span></li>
                    </ol>
                  </div>

                  <CodeBlock 
                    code={`// Escrow contract functions
contract BlobKitEscrow {
  // User deposits funds
  function deposit() payable {
    balances[msg.sender] += msg.value;
  }
  
  // User creates job (reserves funds)
  function createJob(jobId, amount) {
    require(balances[msg.sender] >= amount);
    balances[msg.sender] -= amount;
    jobs[jobId] = Job(msg.sender, amount, false);
  }
  
  // Proxy completes job (gets paid)
  function completeJob(jobId, blobTxHash, proof) {
    require(authorizedProxies[msg.sender]);
    require(verifyProof(jobId, blobTxHash, proof));
    
    Job storage job = jobs[jobId];
    require(!job.completed);
    
    job.completed = true;
    payable(msg.sender).transfer(job.amount);
  }
  
  // User can refund if job expires (5 minutes)
  function refundExpiredJob(jobId) {
    Job storage job = jobs[jobId];
    require(block.timestamp > job.timestamp + 5 minutes);
    require(!job.completed);
    
    balances[job.user] += job.amount;
  }
}`}
                    language="solidity"
                  />

                  <div className="bg-cyan-400/10 border border-cyan-400/30 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Trust model:</strong> The escrow contract ensures the proxy can only take payment after proving 
                      it submitted your blob. If the proxy fails, you get an automatic refund after 5 minutes.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Installation Section */}
            <section id="installation" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">📦 Installation</h2>
              
              <div id="package-install" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Package Installation</h3>
                
                <div className="space-y-4">
                  <CodeBlock 
                    code={`# NPM
npm install @blobkit/sdk ethers

# Yarn
yarn add @blobkit/sdk ethers

# PNPM
pnpm add @blobkit/sdk ethers`}
                    language="bash"
                  />

                  <div className="bg-blue-400/10 border border-blue-400/30 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Note:</strong> ethers.js is a peer dependency. BlobKit uses it for Ethereum interactions 
                      but doesn't bundle it to avoid version conflicts with your app.
                    </p>
                  </div>
                </div>
              </div>

              <div id="environment-setup" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Environment Setup</h3>
                
                <CodeBlock 
                  code={`# Required
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
CHAIN_ID=11155111  # Sepolia testnet

# Proxy (required because wallets don't support blobs)
PROXY_URL=https://proxy-sepolia.blobkit.org

# Optional BlobKit-specific variables
BLOBKIT_RPC_URL=...        # Override RPC for BlobKit
BLOBKIT_ARCHIVE_URL=...    # Archive service for old blobs
BLOBKIT_LOG_LEVEL=info     # debug, info, warn, error`}
                  language="bash"
                  filename=".env"
                />

                <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-4 mt-4">
                  <p className="text-sm">
                    <strong className="text-red-400">Security:</strong> Never commit .env files. Add to .gitignore immediately.
                  </p>
                </div>
              </div>
            </section>

            {/* Basic Usage Section */}
            <section id="usage" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">💻 Basic Usage</h2>
              
              <div id="initialization" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Initialization</h3>
                
                <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-4 mb-6">
                  <p className="text-sm">
                    <strong className="text-red-400">Important:</strong> Always call initializeKzg() first. 
                    This loads the cryptographic parameters needed for blob commitments.
                  </p>
                </div>

                <CodeBlock 
                  code={`import { BlobKit, initializeKzg } from '@blobkit/sdk';
import { ethers } from 'ethers';

// Step 1: Initialize KZG (once per app)
await initializeKzg();

// Step 2: Set up provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Step 3: Create BlobKit instance
const blobkit = await BlobKit.init({
  rpcUrl: process.env.RPC_URL,
  chainId: 11155111,  // Sepolia
  proxyUrl: process.env.PROXY_URL  // Required for wallet support
}, wallet);

// Alternative: Use environment variables
import { createFromEnv } from '@blobkit/sdk';
const blobkit = createFromEnv(wallet);  // Reads BLOBKIT_* env vars`}
                  language="typescript"
                />
              </div>

              <div id="writing-data" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Writing Data</h3>
                
                <CodeBlock 
                  code={`// Write any JSON-serializable data
const receipt = await blobkit.writeBlob({
  type: 'message',
  content: 'Hello World',
  timestamp: Date.now()
});

// Receipt contains:
console.log(receipt.jobId);        // Unique job ID
console.log(receipt.blobTxHash);   // Transaction hash
console.log(receipt.blobHash);     // Blob commitment hash
console.log(receipt.status);       // 'pending' | 'confirmed' | 'failed'

// Write with metadata (useful for indexing)
await blobkit.writeBlob(data, {
  appId: 'my-app',
  version: '1.0.0',
  contentType: 'application/json'
});`}
                  language="typescript"
                />
              </div>

              <div id="reading-data" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Reading Data</h3>
                
                <CodeBlock 
                  code={`// Read as JSON
const data = await blobkit.readBlobAsJSON(txHash);

// Read as string
const text = await blobkit.readBlobAsString(txHash);

// Read raw bytes
const result = await blobkit.readBlob(txHash);
console.log(result.data);    // Uint8Array
console.log(result.source);  // 'rpc' | 'archive'

// Note: Blobs expire after 18 days
// Configure archive for permanent access:
const blobkit = await BlobKit.init({
  rpcUrl: '...',
  archiveUrl: 'https://api.blobscan.com'
}, wallet);`}
                  language="typescript"
                />
              </div>

              <div id="cost-management" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Cost Management</h3>
                
                <CodeBlock 
                  code={`// Always estimate costs first
const data = { /* your data */ };
const bytes = new TextEncoder().encode(JSON.stringify(data));

const estimate = await blobkit.estimateCost(bytes);
console.log('Cost:', estimate.totalCostEth, 'ETH');

// Set a maximum cost
const MAX_COST = 0.01;  // 0.01 ETH
if (parseFloat(estimate.totalCostEth) > MAX_COST) {
  throw new Error('Cost too high, try again later');
}

// Proceed with write
await blobkit.writeBlob(data);`}
                  language="typescript"
                />
              </div>
            </section>

            {/* Proxy System Section */}
            <section id="proxy" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">🔄 Proxy System</h2>
              
              <div className="bg-cyan-400/10 border border-cyan-400/30 rounded-lg p-6 mb-8">
                <p className="text-sm">
                  The proxy system is essential because wallets can't send blob transactions. 
                  You can use the hosted proxy or deploy your own for full control.
                </p>
              </div>

              <div id="hosted-proxy" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Using the Hosted Proxy</h3>
                
                <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-4 mb-6">
                  <h4 className="text-green-400 font-bold mb-2">🎉 The Hosted Proxy is FREE!</h4>
                  <p className="text-sm">
                    We provide free hosted proxy servers for both mainnet and testnet. There are no fees, 
                    no registration required, and no hidden costs. You only pay for the actual blob gas costs on Ethereum.
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Hosted Proxy Details</h4>
                    <ul className="space-y-2 text-sm">
                      <li><strong className="text-yellow-400">Mainnet Proxy:</strong> <span className="text-cyan-400">https://proxy.blobkit.org</span></li>
                      <li><strong className="text-yellow-400">Mainnet Escrow:</strong> <span className="text-cyan-400">0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838</span></li>
                      <li><strong className="text-yellow-400">Sepolia Proxy:</strong> <span className="text-cyan-400">https://proxy-sepolia.blobkit.org</span></li>
                      <li><strong className="text-yellow-400">Sepolia Escrow:</strong> <span className="text-cyan-400">0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77</span></li>
                      <li><strong className="text-yellow-400">Proxy Fee:</strong> <span className="text-green-400">FREE (0%)</span> - Hosted proxy has no fees!</li>
                      <li><strong className="text-yellow-400">Rate Limit:</strong> <span className="text-cyan-400">10 requests per minute (default)</span></li>
                      <li><strong className="text-yellow-400">Max Blob Size:</strong> <span className="text-cyan-400">~124KB usable</span></li>
                      <li><strong className="text-yellow-400">Job Timeout:</strong> <span className="text-cyan-400">5 minutes (300 seconds)</span></li>
                    </ul>
                  </div>

                  <CodeBlock 
                    code={`// Step 1: Configure BlobKit with proxy
const blobkit = await BlobKit.init({
  rpcUrl: 'YOUR_RPC_URL',
  chainId: 11155111,  // Sepolia
  proxyUrl: 'https://proxy-sepolia.blobkit.org',
  escrowContract: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77'  // Sepolia escrow
}, wallet);

// Step 2: Write blob (deposit happens automatically!)
// BlobKit handles everything internally:
// - Estimates the cost
// - Deposits exact amount to escrow
// - Submits to proxy
// - Returns receipt
const receipt = await blobkit.writeBlob(data);
console.log('Blob written:', receipt.transactionHash);

// Optional: Check if you have any remaining balance in escrow
const balance = await blobkit.getBalance();
if (balance > 0n) {
  console.log('Remaining escrow balance:', ethers.formatEther(balance), 'ETH');
}

// Step 3: Blob is written!
console.log('Success! Transaction:', receipt.blobTxHash);
console.log('Job ID:', receipt.jobId);
console.log('Block number:', receipt.blockNumber);

// You can read it back
const readResult = await blobkit.readBlob(receipt.blobTxHash);
console.log('Read back data:', readResult.data);`}
                    language="typescript"
                  />
                </div>
              </div>

              <div id="escrow-management" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Escrow Management</h3>
                
                <div className="space-y-4">
                  <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4">
                    <h4 className="text-yellow-400 mb-2">How Much to Deposit?</h4>
                    <ul className="space-y-1 text-sm">
                      <li><strong className="text-yellow-400">Minimum:</strong> <span className="text-cyan-400">0.01 ETH (covers ~10-100 blobs depending on gas)</span></li>
                      <li><strong className="text-yellow-400">Recommended:</strong> <span className="text-cyan-400">0.1 ETH for regular usage</span></li>
                      <li><strong className="text-yellow-400">Calculate:</strong> <span className="text-cyan-400">Number of blobs × 0.001 ETH (average cost)</span></li>
                    </ul>
                  </div>

                  <CodeBlock 
                    code={`// Check your escrow balance
const balance = await blobkit.getEscrowBalance();
const address = await blobkit.getAddress();

console.log('Wallet:', address);
console.log('Escrow balance:', ethers.formatEther(balance), 'ETH');

// Estimate if you have enough for your data
const data = { /* your data */ };
const bytes = new TextEncoder().encode(JSON.stringify(data));
const estimate = await blobkit.estimateCost(bytes);

const estimatedCost = ethers.parseEther(estimate.totalCostEth);
// Hosted proxy is FREE - no additional fees!
const proxyFee = 0n;  // 0% for hosted proxy
const totalCost = estimatedCost;  // Just the blob gas cost

console.log('Blob cost:', estimate.totalCostEth, 'ETH');
console.log('Proxy fee:', 'FREE (hosted proxy)');
console.log('Total cost:', ethers.formatEther(totalCost), 'ETH');

if (balance < totalCost) {
  console.log('Insufficient escrow balance!');
  const needed = totalCost - balance;
  console.log('Need to deposit:', ethers.formatEther(needed), 'ETH');
}`}
                    language="typescript"
                  />

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">How Escrow Works</h4>
                    <CodeBlock 
                      code={`// IMPORTANT: Deposits are AUTOMATIC!
// You don't need to manually deposit - it happens during writeBlob

// Write a blob (deposit happens automatically)
const receipt = await blobkit.writeBlob(data);
console.log('Blob written:', receipt.blobTxHash);
console.log('Job ID:', receipt.jobId);

// The writeBlob method automatically:
// 1. Estimates the exact cost
// 2. Deposits that amount to escrow  
// 3. Proxy uses it to pay for blob gas
// 4. Returns receipt when complete

// Check if you have any balance from overpayment
const balance = await blobkit.getBalance();
if (balance > 0n) {
  console.log('Remaining balance:', ethers.formatEther(balance));
}

// If proxy fails, refund after 5 minute timeout
const expiredJobs = ['job1', 'job2'];  // Your expired job IDs
for (const jobId of expiredJobs) {
  try {
    const refundTx = await blobkit.refundIfExpired(jobId);
    await refundTx.wait();
    console.log('Refunded:', jobId);
  } catch (error) {
    console.log('Already refunded or not expired:', jobId);
  }
}`}
                      language="typescript"
                    />
                  </div>
                </div>
              </div>

              <div id="deploy-proxy" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Deploy Your Own Proxy</h3>
                
                <div className="space-y-4">
                  <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4 mb-4">
                    <h4 className="text-yellow-400 font-bold mb-2">💰 Set Your Own Fees</h4>
                    <p className="text-sm mb-2">
                      When you deploy your own proxy, you can set any fee percentage from 0% to 10%. 
                      This allows you to:
                    </p>
                    <ul className="space-y-1 text-sm ml-4">
                      <li>• Run it free for your users (0% fee)</li>
                      <li>• Monetize your proxy service (1-10% fee)</li>
                      <li>• Cover operational costs</li>
                      <li>• Create a sustainable business model</li>
                    </ul>
                  </div>
                  
                  <p className="text-sm">
                    Running your own proxy gives you full control. You need to deploy two components:
                  </p>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">1. Deploy Escrow Contract</h4>
                    <CodeBlock 
                      code={`# Clone BlobKit repository
git clone https://github.com/ETHCF/blobkit
cd blobkit/packages/contracts

# Install dependencies
npm install

# Configure deployment
export ESCROW_OWNER=0xYOUR_ADDRESS
export INITIAL_PROXIES=0xYOUR_PROXY_ADDRESS
export JOB_TIMEOUT=300  # 5 minutes in seconds

# Deploy contract
forge script script/Deploy.s.sol \\
  --rpc-url YOUR_RPC_URL \\
  --private-key YOUR_PRIVATE_KEY \\
  --broadcast

# Note the deployed contract address`}
                      language="bash"
                    />
                  </div>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">2. Run Proxy Server</h4>
                    <CodeBlock 
                      code={`# Using Docker
docker run -d \\
  --name blobkit-proxy \\
  -p 3001:3001 \\
  -e RPC_URL="YOUR_RPC_URL" \\
  -e PRIVATE_KEY="OPERATOR_PRIVATE_KEY" \\
  -e ESCROW_CONTRACT="DEPLOYED_CONTRACT_ADDRESS" \\
  -e REDIS_URL="redis://localhost:6379" \\
  blobkit/proxy-server:latest

# Or run manually
cd packages/proxy-server
npm install
npm run build

# Create .env file
RPC_URL=YOUR_RPC_URL
PRIVATE_KEY=OPERATOR_PRIVATE_KEY  # Wallet that pays gas
ESCROW_CONTRACT=DEPLOYED_ADDRESS
REDIS_URL=redis://localhost:6379
PORT=3001

# Start server
npm run start`}
                      language="bash"
                    />
                  </div>

                  <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Important:</strong> The proxy operator wallet needs ETH to pay for blob transactions. 
                      Users reimburse these costs through the escrow contract.
                    </p>
                  </div>
                </div>
              </div>

              <div id="proxy-operations" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Proxy Operations</h3>
                
                <div className="space-y-4">
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Managing the Escrow Contract</h4>
                    <CodeBlock 
                      code={`// Add authorized proxy
await escrow.addAuthorizedProxy(proxyAddress);

// Set proxy fee (0-10% - only for your own proxy!)
// The hosted proxy runs at 0% fee
await escrow.setProxyFee(proxyAddress, 5);  // Example: 5% fee for your proxy

// Update job timeout (if needed - default is 5 minutes)
await escrow.updateJobTimeout(300);  // 5 minutes

// Pause in emergency
await escrow.pause();

// Check contract state
const isProxyAuthorized = await escrow.authorizedProxies(proxyAddress);
const proxyFee = await escrow.proxyFees(proxyAddress);
const timeout = await escrow.jobTimeout();`}
                      language="javascript"
                    />
                  </div>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Monitoring Proxy Health</h4>
                    <CodeBlock 
                      code={`# Check proxy status
curl https://your-proxy.com/api/v1/health

# Response:
{
  "status": "healthy",
  "version": "2.0.0",
  "chainId": 1,
  "escrowContract": "0x...",
  "operatorAddress": "0x...",
  "operatorBalance": "1.5",
  "jobQueueSize": 3
}

# Monitor logs
docker logs -f blobkit-proxy

# Check metrics (Prometheus format)
curl https://your-proxy.com/metrics`}
                      language="bash"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Production Guide Section */}
            <section id="production" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">🚀 Production Guide</h2>
              
              <div className="bg-blue-400/10 border border-blue-400/30 rounded-lg p-6 mb-8">
                <p className="text-sm">
                  Everything you need to run BlobKit in production with confidence.
                </p>
              </div>

              <div id="production-checklist" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Production Checklist</h3>
                
                <div className="space-y-4">
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Before Going Live</h4>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Test on Sepolia testnet first</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Set up error monitoring (Sentry, DataDog)</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Implement retry logic with exponential backoff</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Add escrow balance monitoring</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Set cost limits per blob</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Handle proxy downtime gracefully</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Implement data archival for blobs older than 18 days</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Set up cost tracking and alerts</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Use environment variables for all secrets</span>
                      </li>
                      <li className="flex items-start">
                        <input type="checkbox" className="mr-2 mt-1" />
                        <span>Document blob data format for your team</span>
                      </li>
                    </ul>
                  </div>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Security Considerations</h4>
                    <ul className="space-y-2 text-sm">
                      <li><strong className="text-yellow-400">Private Keys:</strong> <span className="text-green-400">Never expose in code or logs</span></li>
                      <li><strong className="text-yellow-400">Escrow Deposits:</strong> <span className="text-green-400">Only deposit what you need</span></li>
                      <li><strong className="text-yellow-400">Data Validation:</strong> <span className="text-green-400">Always validate data before storing</span></li>
                      <li><strong className="text-yellow-400">Rate Limiting:</strong> <span className="text-green-400">Implement client-side rate limiting</span></li>
                      <li><strong className="text-yellow-400">Access Control:</strong> <span className="text-green-400">Restrict who can trigger blob writes</span></li>
                    </ul>
                  </div>
                </div>
              </div>

              <div id="monitoring" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Monitoring & Debugging</h3>
                
                <div className="space-y-4">
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Key Metrics to Track</h4>
                    <CodeBlock 
                      code={`// Monitoring setup
class BlobMonitor {
  constructor(blobkit) {
    this.blobkit = blobkit;
    this.metrics = {
      totalBlobs: 0,
      totalCost: 0,
      failures: 0,
      avgCostPerBlob: 0
    };
  }
  
  async trackWrite(data) {
    const startTime = Date.now();
    
    try {
      // Track cost
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      const estimate = await this.blobkit.estimateCost(bytes);
      
      // Write blob
      const receipt = await this.blobkit.writeBlob(data);
      
      // Update metrics
      this.metrics.totalBlobs++;
      this.metrics.totalCost += parseFloat(estimate.totalCostEth);
      this.metrics.avgCostPerBlob = this.metrics.totalCost / this.metrics.totalBlobs;
      
      // Log success
      console.log({
        event: 'blob_write_success',
        jobId: receipt.jobId,
        txHash: receipt.blobTxHash,
        cost: estimate.totalCostEth,
        duration: Date.now() - startTime,
        escrowBalance: await this.blobkit.getEscrowBalance()
      });
      
      return receipt;
      
    } catch (error) {
      this.metrics.failures++;
      
      // Log failure
      console.error({
        event: 'blob_write_failure',
        error: error.message,
        code: error.code,
        duration: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  getMetrics() {
    return this.metrics;
  }
}`}
                      language="typescript"
                    />
                  </div>

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Debug Mode</h4>
                    <CodeBlock 
                      code={`// Enable debug logging
const blobkit = await BlobKit.init({
  rpcUrl: process.env.RPC_URL,
  chainId: 1,
  proxyUrl: 'https://proxy.blobkit.org',
  logLevel: 'debug'  // Shows all internal operations
}, wallet);

// Add request interceptor for debugging
blobkit.on('request', (req) => {
  console.log('Request:', {
    method: req.method,
    url: req.url,
    data: req.data
  });
});

blobkit.on('response', (res) => {
  console.log('Response:', {
    status: res.status,
    data: res.data
  });
});

// Track escrow balance changes
setInterval(async () => {
  const balance = await blobkit.getEscrowBalance();
  console.log('Escrow balance check:', ethers.formatEther(balance), 'ETH');
}, 60000);  // Check every minute`}
                      language="typescript"
                    />
                  </div>
                </div>
              </div>

              <div id="cost-optimization" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Cost Optimization</h3>
                
                <div className="space-y-4">
                  <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-4">
                    <h4 className="text-green-400 mb-2">Cost Saving Strategies</h4>
                    <ul className="space-y-2 text-sm">
                      <li><strong className="text-yellow-400">1. Batch small items:</strong> <span className="text-green-400">Combine multiple small pieces into one blob</span></li>
                      <li><strong className="text-yellow-400">2. Compress data:</strong> <span className="text-green-400">Use gzip to reduce size by 50-90%</span></li>
                      <li><strong className="text-yellow-400">3. Time submissions:</strong> <span className="text-green-400">Submit during low gas periods (weekends, nights)</span></li>
                      <li><strong className="text-yellow-400">4. Set max costs:</strong> <span className="text-green-400">Skip high fee periods automatically</span></li>
                      <li><strong className="text-yellow-400">5. Use testnet:</strong> <span className="text-green-400">Develop and test on Sepolia first</span></li>
                    </ul>
                  </div>

                  <CodeBlock 
                    code={`// Cost optimization implementation
class OptimizedBlobWriter {
  constructor(blobkit, options = {}) {
    this.blobkit = blobkit;
    this.maxCostEth = options.maxCostEth || 0.01;
    this.batchSize = options.batchSize || 50000;  // 50KB batches
    this.batch = [];
    this.batchBytes = 0;
  }
  
  // Add item to batch
  async add(item) {
    const itemBytes = new TextEncoder().encode(JSON.stringify(item));
    
    // If item alone is too big, compress it
    if (itemBytes.length > 100000) {
      return this.writeCompressed(item);
    }
    
    // If batch would exceed size, flush first
    if (this.batchBytes + itemBytes.length > this.batchSize) {
      await this.flush();
    }
    
    this.batch.push(item);
    this.batchBytes += itemBytes.length;
  }
  
  // Write batch to blob
  async flush() {
    if (this.batch.length === 0) return;
    
    const data = { 
      items: this.batch,
      count: this.batch.length,
      timestamp: Date.now()
    };
    
    // Check cost
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const estimate = await this.blobkit.estimateCost(bytes);
    
    if (parseFloat(estimate.totalCostEth) > this.maxCostEth) {
      console.log('Cost too high, waiting...');
      // Store locally and retry later
      await this.saveForLater(data);
      return;
    }
    
    // Write blob
    const receipt = await this.blobkit.writeBlob(data);
    console.log(\`Flushed \${this.batch.length} items in 1 blob\`);
    
    // Reset batch
    this.batch = [];
    this.batchBytes = 0;
    
    return receipt;
  }
  
  // Compress large items
  async writeCompressed(item) {
    const compressed = await gzip(JSON.stringify(item));
    return this.blobkit.writeBlob({
      compressed: true,
      data: compressed.toString('base64')
    });
  }
}`}
                    language="typescript"
                  />

                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Gas Price Monitoring</h4>
                    <CodeBlock 
                      code={`// Monitor blob gas prices
async function getBlobGasPrice(provider) {
  const block = await provider.getBlock('latest');
  return block.blobGasPrice;  // In wei
}

// Wait for low gas
async function waitForLowGas(provider, maxGwei = 10) {
  while (true) {
    const gasPrice = await getBlobGasPrice(provider);
    const gwei = Number(gasPrice) / 1e9;
    
    if (gwei <= maxGwei) {
      console.log(\`Gas price OK: \${gwei} gwei\`);
      return;
    }
    
    console.log(\`Gas too high: \${gwei} gwei, waiting...\`);
    await new Promise(r => setTimeout(r, 60000));  // Check every minute
  }
}

// Use it
await waitForLowGas(provider, 10);  // Wait for <10 gwei
await blobkit.writeBlob(data);`}
                      language="typescript"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Examples Section */}
            <section id="examples" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">📝 Examples</h2>
              
              <div id="complete-app" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Complete Application</h3>
                
                <CodeBlock 
                  code={`import { BlobKit, initializeKzg, BlobKitError, BlobKitErrorCode } from '@blobkit/sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

class BlobStorage {
  private blobkit: BlobKit;
  
  constructor(blobkit: BlobKit) {
    this.blobkit = blobkit;
  }
  
  async store(data: any, maxCost = 0.01): Promise<string> {
    // Check size
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    if (bytes.length > 128000) {
      throw new Error('Data too large for single blob');
    }
    
    // Check cost
    const estimate = await this.blobkit.estimateCost(bytes);
    if (parseFloat(estimate.totalCostEth) > maxCost) {
      throw new Error(\`Cost too high: \${estimate.totalCostEth} ETH\`);
    }
    
    // Store with retries
    let lastError;
    for (let i = 0; i < 3; i++) {
      try {
        const receipt = await this.blobkit.writeBlob(data);
        
        // Wait for confirmation if using proxy
        if (receipt.status === 'pending') {
          let status = receipt.status;
          let attempts = 0;
          
          while (status === 'pending' && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            status = await this.blobkit.getJobStatus(receipt.jobId);
            attempts++;
          }
          
          if (status !== 'confirmed') {
            throw new Error('Job failed: ' + status);
          }
        }
        
        return receipt.blobTxHash!;
        
      } catch (error) {
        lastError = error;
        console.error(\`Attempt \${i + 1} failed:\`, error.message);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
    
    throw lastError;
  }
  
  async retrieve(txHash: string): Promise<any> {
    try {
      return await this.blobkit.readBlobAsJSON(txHash);
    } catch (error) {
      if (error.code === BlobKitErrorCode.BLOB_NOT_FOUND) {
        throw new Error('Blob expired or not found');
      }
      throw error;
    }
  }
}

async function main() {
  // Initialize
  await initializeKzg();
  
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  
  const blobkit = await BlobKit.init({
    rpcUrl: process.env.RPC_URL!,
    chainId: parseInt(process.env.CHAIN_ID!),
    proxyUrl: process.env.PROXY_URL
  }, wallet);
  
  const storage = new BlobStorage(blobkit);
  
  // Store data
  const txHash = await storage.store({
    message: 'Hello from BlobKit!',
    timestamp: Date.now()
  });
  
  console.log('Stored at:', txHash);
  
  // Retrieve data
  const data = await storage.retrieve(txHash);
  console.log('Retrieved:', data);
}

main().catch(console.error);`}
                  language="typescript"
                  filename="blob-app.ts"
                />
              </div>

              <div id="error-handling" className="mb-12">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Error Handling</h3>
                
                <CodeBlock 
                  code={`import { BlobKitError, BlobKitErrorCode } from '@blobkit/sdk';

try {
  await blobkit.writeBlob(data);
} catch (error) {
  if (error instanceof BlobKitError) {
    switch (error.code) {
      case BlobKitErrorCode.KZG_ERROR:
        // KZG operation failed
        console.error('KZG error - may need to reinitialize');
        await initializeKzg();
        break;
        
      case BlobKitErrorCode.BLOB_TOO_LARGE:
        // Data exceeds blob capacity (~124KB usable)
        console.error('Data too large, need to split or compress');
        break;
        
      case BlobKitErrorCode.INSUFFICIENT_BALANCE:
        // Not enough ETH
        console.error('Insufficient balance in escrow');
        break;
        
      case BlobKitErrorCode.BLOB_NOT_FOUND:
        // Blob expired (>18 days)
        console.error('Blob has expired');
        break;
        
      case BlobKitErrorCode.PROXY_UNAVAILABLE:
        // Proxy server is down
        console.error('Proxy server unavailable');
        break;
        
      default:
        console.error('Unknown error:', error.message);
    }
  } else {
    // Non-BlobKit error
    console.error('Unexpected error:', error);
  }
}`}
                  language="typescript"
                />
              </div>
            </section>

            {/* API Reference Section */}
            <section id="api" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">📖 API Reference</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-yellow-400 mb-3">Core Methods</h3>
                  <CodeBlock 
                    code={`class BlobKit {
  // Initialize BlobKit
  static async init(config: BlobKitConfig, signer?: Signer): Promise<BlobKit>
  
  // Write blob
  async writeBlob(
    data: Uint8Array | string | object,
    meta?: Partial<BlobMeta>,
    jobId?: string,
    maxRetries?: number
  ): Promise<BlobReceipt>
  
  // Read blob
  async readBlob(txHash: string, index?: number): Promise<BlobReadResult>
  async readBlobAsString(txHash: string): Promise<string>
  async readBlobAsJSON(txHash: string): Promise<any>
  
  // Cost estimation
  async estimateCost(data: Uint8Array): Promise<CostEstimate>
  
  // Proxy & escrow operations  
  async getJobStatus(jobId: string): Promise<JobStatus>
  async refundIfExpired(jobId: string): Promise<TransactionResponse>
  async getBalance(): Promise<bigint>
  async getAddress(): Promise<string>
}`}
                    language="typescript"
                  />
                </div>

                <div>
                  <h3 className="text-yellow-400 mb-3">Configuration</h3>
                  <CodeBlock 
                    code={`interface BlobKitConfig {
  rpcUrl: string           // Ethereum RPC endpoint
  chainId?: number         // Network ID (1 = mainnet, 11155111 = sepolia)
  proxyUrl?: string        // Proxy server URL (required for wallet support)
  archiveUrl?: string      // Archive service for old blobs
  escrowContract?: string  // Custom escrow contract address
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}`}
                    language="typescript"
                  />
                </div>

                <div>
                  <h3 className="text-yellow-400 mb-3">Types</h3>
                  <CodeBlock 
                    code={`interface BlobReceipt {
  jobId: string
  blobHash?: string
  blobTxHash?: string
  status: 'pending' | 'confirmed' | 'failed'
  error?: string
}

interface CostEstimate {
  blobGasPrice: string
  baseFee: string
  totalCostWei: string
  totalCostEth: string
  totalCostUsd?: string
}`}
                    language="typescript"
                  />
                </div>
              </div>
            </section>

            {/* Troubleshooting Section */}
            <section id="troubleshooting" className="mb-16">
              <h2 className="text-3xl font-bold text-cyan-400 mb-8">❓ Troubleshooting</h2>
              
              {/* Error Index */}
              <div id="error-index" className="mb-8">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Error Index</h3>
                <div className="p-4 bg-black/50 border border-green-400/20 rounded-lg">
                  <p className="text-sm text-green-400/70 mb-4">Quick reference for all error codes. Click any error to jump to its documentation.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {ERROR_CODES.map((error, index) => (
                      <button
                        key={index}
                        onClick={() => scrollToSection(error.section)}
                        className="text-left p-3 bg-black/30 hover:bg-green-400/10 border border-green-400/20 rounded transition-all"
                      >
                        <code className="text-red-400 font-semibold">{error.code}</code>
                        <p className="text-xs text-green-400/60 mt-1">{error.message}</p>
                        <p className="text-xs text-cyan-400/60 mt-1">→ See: {error.section.replace(/-/g, ' ')}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div id="common-issues">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">Common Issues & Solutions</h3>
                
                <div className="space-y-6">
                <div className="border border-red-400/30 rounded-lg p-4">
                  <h4 className="text-red-400 font-bold mb-2">KZG_ERROR</h4>
                  <p className="text-sm mb-3">KZG operation failed. Ensure KZG is initialized.</p>
                  <CodeBlock 
                    code={`// Always do this first
import { initializeKzg } from '@blobkit/sdk';
await initializeKzg();`}
                    language="typescript"
                  />
                </div>

                <div className="border border-red-400/30 rounded-lg p-4">
                  <h4 className="text-red-400 font-bold mb-2">BLOB_TOO_LARGE</h4>
                  <p className="text-sm mb-3">Data exceeds blob capacity (~124KB usable after encoding).</p>
                  <CodeBlock 
                    code={`const bytes = new TextEncoder().encode(JSON.stringify(data));
// Actual usable capacity is ~124KB due to encoding overhead
if (bytes.length > 126972) {
  // Split into multiple blobs or compress
}`}
                    language="typescript"
                  />
                </div>

                <div className="border border-red-400/30 rounded-lg p-4">
                  <h4 className="text-red-400 font-bold mb-2">BLOB_NOT_FOUND</h4>
                  <p className="text-sm mb-3">Blobs expire after 18 days. Use an archive service for permanent storage.</p>
                  <CodeBlock 
                    code={`const blobkit = await BlobKit.init({
  rpcUrl: '...',
  archiveUrl: 'https://api.blobscan.com'  // Archive for old blobs
}, wallet);`}
                    language="typescript"
                  />
                </div>

                <div className="border border-yellow-400/30 rounded-lg p-4">
                  <h4 className="text-yellow-400 font-bold mb-2">Common Production Issues</h4>
                  <p className="text-sm mb-3">Proxy returns 429 Too Many Requests</p>
                  <CodeBlock 
                    code={`// You're hitting rate limits (100 req/min)
// Solution: Add rate limiting
const queue = [];
let processing = false;

async function rateLimitedWrite(data) {
  queue.push(data);
  if (!processing) {
    processing = true;
    while (queue.length > 0) {
      const item = queue.shift();
      await blobkit.writeBlob(item);
      await new Promise(r => setTimeout(r, 600));  // 100 req/min = 600ms between
    }
    processing = false;
  }
}`}
                    language="typescript"
                  />
                </div>

                <div className="border border-yellow-400/30 rounded-lg p-4">
                  <h4 className="text-yellow-400 font-bold mb-2">Escrow Balance Runs Out Mid-Operation</h4>
                  <CodeBlock 
                    code={`// Implement auto-deposit on failure
// Note: Deposits are automatic!
// writeBlob handles the entire flow:
async function writeBlob(data) {
  // This automatically:
  // 1. Estimates cost
  // 2. Deposits to escrow
  // 3. Submits to proxy
  // 4. Returns receipt
  const receipt = await blobkit.writeBlob(data);
  console.log('Success!', receipt.blobTxHash);
  return receipt;
}`}
                    language="typescript"
                  />
                </div>

                <div className="bg-green-400/10 border border-green-400/30 rounded-lg p-4">
                  <h4 className="text-green-400 font-bold mb-2">Get Help</h4>
                  <ul className="space-y-1 text-sm">
                    <li>• <span className="text-yellow-400">GitHub Issues:</span> <a href="https://github.com/ETHCF/blobkit/issues" className="text-cyan-400">Report bugs</a></li>
                    <li>• <span className="text-yellow-400">Discussions:</span> <a href="https://github.com/ETHCF/blobkit/discussions" className="text-cyan-400">Ask questions</a></li>
                    <li>• <span className="text-yellow-400">Stack Overflow:</span> Tag with <code className="text-cyan-400">blobkit</code></li>
                  </ul>
                </div>
                </div>
              </div>
            </section>

            {/* Advanced Configuration */}
            <section id="advanced-config" className="mb-16">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6">⚙️ Advanced Configuration</h2>
              
              <div className="space-y-6">
                <div id="all-config-options">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">All Configuration Options</h3>
                  <p className="text-sm mb-4">
                    The BlobKit constructor accepts a configuration object with these options:
                  </p>
                  
                  <CodeBlock 
                    code={`import { BlobKit } from '@blobkit/sdk';

const blobkit = new BlobKit({
  // Core configuration
  rpcUrl: string,                    // Required: Ethereum RPC endpoint
  chainId?: number,                  // Chain ID (default: 1)
  archiveUrl?: string,               // Archive service URL (default: rpcUrl)
  defaultCodec?: string,             // Default data encoding (default: 'application/json')
  
  // Proxy configuration  
  proxyUrl?: string,                 // Proxy server URL (default: '')
  escrowContract?: string,           // Custom escrow address (default: auto-detected)
  maxProxyFeePercent?: number,       // Max acceptable proxy fee (default: 5)
  callbackUrl?: string,              // Webhook for async notifications (default: '')
  
  // Logging
  logLevel?: 'debug' | 'info' | 'silent',  // Log verbosity (default: 'info')
  
  // KZG setup
  kzgSetup?: {
    trustedSetupData?: Uint8Array,   // Pre-loaded setup data
    trustedSetupUrl?: string,         // URL to load setup (browser)
    trustedSetupPath?: string,        // File path to setup (Node.js)
    expectedHash?: string             // Hash for integrity check
  },
  
  // Metrics hooks
  metricsHooks?: {
    onBlobWrite?: (size: number, duration: number, success: boolean) => void,
    onBlobRead?: (size: number, duration: number, success: boolean, source: string) => void,
    onProxyRequest?: (url: string, duration: number, success: boolean) => void,
    onKzgOperation?: (operation: string, duration: number, success: boolean) => void,
    onError?: (error: Error, context: string) => void
  }
}, signer);`}
                    language="typescript"
                  />
                </div>

                <div id="env-setup">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Environment-Based Setup</h3>
                  <p className="text-sm mb-4">
                    Initialize BlobKit from environment variables:
                  </p>
                  
                  <CodeBlock 
                    code={`import { createFromEnv } from '@blobkit/sdk';
import { ethers } from 'ethers';

// Set environment variables
process.env.BLOBKIT_RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY';
process.env.BLOBKIT_ARCHIVE_URL = 'https://api.blobscan.com';
process.env.BLOBKIT_CHAIN_ID = '1';
process.env.BLOBKIT_PROXY_URL = 'https://proxy.blobkit.org';
process.env.BLOBKIT_LOG_LEVEL = 'debug';

// Create BlobKit instance
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const blobkit = createFromEnv(wallet);`}
                    language="typescript"
                  />
                  
                  <div className="border border-green-400/20 rounded-lg p-4 mt-4">
                    <h4 className="text-cyan-400 mb-2">Environment Variables</h4>
                    <ul className="space-y-2 text-sm">
                      <li><strong className="text-yellow-400">BLOBKIT_RPC_URL:</strong> <span className="text-cyan-400">Ethereum RPC endpoint (default: 'http://localhost:8545')</span></li>
                      <li><strong className="text-yellow-400">BLOBKIT_ARCHIVE_URL:</strong> <span className="text-cyan-400">Archive service URL (default: 'https://api.blobscan.com')</span></li>
                      <li><strong className="text-yellow-400">BLOBKIT_CHAIN_ID:</strong> <span className="text-cyan-400">Chain ID number (default: 31337)</span></li>
                      <li><strong className="text-yellow-400">BLOBKIT_PROXY_URL:</strong> <span className="text-cyan-400">Proxy server URL</span></li>
                      <li><strong className="text-yellow-400">BLOBKIT_LOG_LEVEL:</strong> <span className="text-cyan-400">Log level (default: 'info')</span></li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Metrics and Monitoring */}
            <section id="metrics" className="mb-16">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6">📊 Metrics and Monitoring</h2>
              
              <div className="space-y-6">
                <div id="metrics-hooks">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Metrics Hooks</h3>
                  <p className="text-sm mb-4">
                    Track performance and errors with custom metrics hooks:
                  </p>
                  
                  <CodeBlock 
                    code={`const blobkit = new BlobKit({
  rpcUrl: '...',
  metricsHooks: {
    // Track blob writes
    onBlobWrite: (size, duration, success) => {
      console.log(\`Blob write: \${size} bytes in \${duration}ms, success: \${success}\`);
      // Send to your metrics service
      metrics.track('blob.write', { size, duration, success });
    },
    
    // Track blob reads
    onBlobRead: (size, duration, success, source) => {
      console.log(\`Blob read: \${size} bytes from \${source} in \${duration}ms\`);
      metrics.track('blob.read', { size, duration, success, source });
    },
    
    // Track proxy requests
    onProxyRequest: (url, duration, success) => {
      console.log(\`Proxy request to \${url}: \${duration}ms, success: \${success}\`);
      metrics.track('proxy.request', { url, duration, success });
    },
    
    // Track KZG operations
    onKzgOperation: (operation, duration, success) => {
      console.log(\`KZG \${operation}: \${duration}ms, success: \${success}\`);
      metrics.track('kzg.operation', { operation, duration, success });
    },
    
    // Track errors
    onError: (error, context) => {
      console.error(\`Error in \${context}:\`, error);
      errorReporter.report(error, { context });
    }
  }
});`}
                    language="typescript"
                  />
                </div>

                <div id="compression">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Compression Settings</h3>
                  <CodeBlock 
                    code={`// Custom archive URL
const blobkit = new BlobKit({
  rpcUrl: '...',
  archiveUrl: 'https://archive.example.com'  // Use different archive service
});

// Custom default codec
const blobkit = new BlobKit({
  rpcUrl: '...',
  defaultCodec: 'text/plain'  // Default to plain text encoding
});`}
                    language="typescript"
                  />
                </div>
              </div>
            </section>

            {/* Codec System */}
            <section id="codecs" className="mb-16">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6">🔄 Codec System</h2>
              
              <div className="space-y-6">
                <div id="built-in-codecs">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Built-in Codecs</h3>
                  <p className="text-sm mb-4">
                    BlobKit includes three built-in codecs for data encoding:
                  </p>
                  
                  <div className="space-y-4">
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">JsonCodec</h4>
                      <p className="text-sm mb-2">Serializes JavaScript objects to JSON</p>
                      <CodeBlock 
                        code={`import { JsonCodec } from '@blobkit/sdk';

const codec = new JsonCodec();
const encoded = codec.encode({ hello: 'world' });  // Uint8Array
const decoded = codec.decode(encoded);              // { hello: 'world' }`}
                        language="typescript"
                      />
                    </div>
                    
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">TextCodec</h4>
                      <p className="text-sm mb-2">Handles UTF-8 text strings</p>
                      <CodeBlock 
                        code={`import { TextCodec } from '@blobkit/sdk';

const codec = new TextCodec();
const encoded = codec.encode('Hello, world!');  // Uint8Array
const decoded = codec.decode(encoded);          // 'Hello, world!'`}
                        language="typescript"
                      />
                    </div>
                    
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">RawCodec</h4>
                      <p className="text-sm mb-2">Direct binary data (no transformation)</p>
                      <CodeBlock 
                        code={`import { RawCodec } from '@blobkit/sdk';

const codec = new RawCodec();
const data = new Uint8Array([1, 2, 3, 4]);
const encoded = codec.encode(data);     // Returns same Uint8Array
const decoded = codec.decode(encoded);  // Returns same Uint8Array`}
                        language="typescript"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Utility Functions */}
            <section id="utilities" className="mb-16">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6">🔧 Utility Functions</h2>
              
              <div className="space-y-6">
                <div id="data-conversion">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Data Conversion</h3>
                  
                  <CodeBlock 
                    code={`import { 
  bytesToHex, 
  hexToBytes,
  formatEther,
  parseEther
} from '@blobkit/sdk';

// Convert bytes to hex string
const bytes = new Uint8Array([1, 2, 3, 4]);
const hex = bytesToHex(bytes);  // '0x01020304'

// Convert hex string to bytes
const restored = hexToBytes(hex);  // Uint8Array([1, 2, 3, 4])

// Format wei to ETH string
const wei = BigInt('1000000000000000000');
const eth = formatEther(wei);  // '1'

// Parse ETH string to wei
const weiValue = parseEther('1.5');  // 1500000000000000000n`}
                    language="typescript"
                  />
                </div>

                <div id="validation">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Validation Functions</h3>
                  
                  <CodeBlock 
                    code={`import { 
  isValidAddress,
  validateBlobSize
} from '@blobkit/sdk';

// Validate Ethereum address
const valid = isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77');  // true
const invalid = isValidAddress('not-an-address');  // false

// Validate blob size (throws if too large)
const data = new Uint8Array(100000);  // 100KB
try {
  validateBlobSize(data);  // OK
} catch (error) {
  console.error('Blob too large');
}`}
                    language="typescript"
                  />
                </div>

                <div id="job-management">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Job Management</h3>
                  
                  <CodeBlock 
                    code={`import { 
  generateJobId,
  calculatePayloadHash
} from '@blobkit/sdk';

// Calculate hash of payload
const data = new Uint8Array([1, 2, 3, 4]);
const hash = calculatePayloadHash(data);  // '0x...' keccak256 hash

// Generate unique job ID
const userAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77';
const jobId = generateJobId(userAddress, hash, 0);  // Unique job ID`}
                    language="typescript"
                  />
                </div>

                <div id="constants">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Constants</h3>
                  
                  <CodeBlock 
                    code={`import { 
  FIELD_ELEMENTS_PER_BLOB,
  BYTES_PER_FIELD_ELEMENT,
  BLOB_SIZE
} from '@blobkit/sdk';

console.log(FIELD_ELEMENTS_PER_BLOB);  // 4096
console.log(BYTES_PER_FIELD_ELEMENT);  // 31
console.log(BLOB_SIZE);                 // 131072`}
                    language="typescript"
                  />
                </div>
              </div>
            </section>

            {/* API Reference */}
            <section id="api-reference" className="mb-16">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6">📖 Complete API Reference</h2>
              
              <div className="space-y-6">
                <div id="blobkit-class">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">BlobKit Class</h3>
                  
                  <div className="border border-green-400/20 rounded-lg p-4">
                    <h4 className="text-cyan-400 mb-2">Constructor</h4>
                    <CodeBlock 
                      code={`const blobkit = new BlobKit(config: BlobKitConfig, signer?: Signer)

// Initialize async components (KZG, proxy)
await blobkit.initialize()`}
                      language="typescript"
                    />
                    <p className="text-sm mt-2 text-gray-400">
                      Note: There is no static init() method. Use the constructor directly.
                    </p>
                  </div>
                </div>

                <div id="write-methods">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Write Methods</h3>
                  
                  <div className="space-y-4">
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">writeBlob()</h4>
                      <CodeBlock 
                        code={`async writeBlob(
  data: Uint8Array | string | object,
  meta?: Partial<BlobMeta>,
  jobId?: string,
  maxRetries?: number = 3
): Promise<BlobReceipt>

// Example
const receipt = await blobkit.writeBlob(
  { message: 'Hello, blobs!' },
  { 
    appId: 'my-app',
    codec: 'application/json'
  }
);`}
                        language="typescript"
                      />
                      <p className="text-sm mt-2 text-gray-400">
                        Writes data to a blob. Automatically handles escrow deposits when using proxy.
                      </p>
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">estimateCost()</h4>
                      <CodeBlock 
                        code={`async estimateCost(payload: Uint8Array): Promise<CostEstimate>

// Returns
{
  blobFee: string,      // ETH for blob storage
  gasFee: string,       // ETH for transaction
  proxyFee: string,     // ETH for proxy (if used)
  totalETH: string      // Total ETH required
}`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">generateJobId()</h4>
                      <CodeBlock 
                        code={`generateJobId(
  userAddress: string,
  payloadHash: string,
  nonce: number
): string

// Generate deterministic job ID
const jobId = blobkit.generateJobId(
  await blobkit.getAddress(),
  calculatePayloadHash(data),
  0
);`}
                        language="typescript"
                      />
                    </div>
                  </div>
                </div>

                <div id="read-methods">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Read Methods</h3>
                  
                  <div className="space-y-4">
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">readBlob()</h4>
                      <CodeBlock 
                        code={`async readBlob(
  blobTxHash: string,
  blobIndex?: number = 0
): Promise<BlobReadResult>

// Returns
{
  data: Uint8Array,
  commitment: string,
  proof: string,
  versionedHash: string,
  blockNumber: number,
  source: 'rpc' | 'archive' | 'fallback'
}`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">readBlobAsString()</h4>
                      <CodeBlock 
                        code={`async readBlobAsString(
  blobTxHash: string,
  blobIndex?: number = 0
): Promise<string>

// Decodes blob data as UTF-8 string
const text = await blobkit.readBlobAsString(txHash);`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">readBlobAsJSON()</h4>
                      <CodeBlock 
                        code={`async readBlobAsJSON(
  blobTxHash: string,
  blobIndex?: number = 0
): Promise<unknown>

// Decodes blob data as JSON
const data = await blobkit.readBlobAsJSON(txHash);`}
                        language="typescript"
                      />
                    </div>
                  </div>
                </div>

                <div id="payment-methods">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Payment & Job Methods</h3>
                  
                  <div className="space-y-4">
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">getJobStatus()</h4>
                      <CodeBlock 
                        code={`async getJobStatus(jobId: string): Promise<JobStatus>

// Returns
{
  exists: boolean,
  user: string,
  amount: bigint,
  completed: boolean,
  timestamp: number,
  blobTxHash: string
}`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">refundIfExpired()</h4>
                      <CodeBlock 
                        code={`async refundIfExpired(jobId: string): Promise<TransactionResponse>

// Refund expired job (after 5 minutes)
const tx = await blobkit.refundIfExpired(jobId);
await tx.wait();`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">getAddress()</h4>
                      <CodeBlock 
                        code={`async getAddress(): Promise<string>

// Get current wallet address
const address = await blobkit.getAddress();`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">getBalance()</h4>
                      <CodeBlock 
                        code={`async getBalance(): Promise<bigint>

// Get ETH balance of current wallet
const balance = await blobkit.getBalance();
console.log(formatEther(balance), 'ETH');`}
                        language="typescript"
                      />
                    </div>
                  </div>
                </div>

                <div id="direct-components">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">Direct Component Access</h3>
                  
                  <div className="space-y-4">
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">PaymentManager</h4>
                      <CodeBlock 
                        code={`import { PaymentManager } from '@blobkit/sdk';

const paymentManager = new PaymentManager(
  rpcUrl: string,
  escrowContract: string,
  signer: Signer
);

// Direct escrow operations
await paymentManager.depositForBlob(jobId, amount);
await paymentManager.getBalance(address);
await paymentManager.getJobStatus(jobId);
await paymentManager.refundIfExpired(jobId);`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">ProxyClient</h4>
                      <CodeBlock 
                        code={`import { ProxyClient } from '@blobkit/sdk';

const proxyClient = new ProxyClient({
  proxyUrl: string,
  escrowContract?: string,
  logLevel?: 'debug' | 'info' | 'silent'
});

// Submit blob via proxy
const result = await proxyClient.submitBlob({
  jobId: string,
  paymentTxHash: string,
  payload: Uint8Array,
  signature: Uint8Array,
  meta: BlobMeta
});

// Check proxy health
const health = await proxyClient.getHealth();`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">BlobReader</h4>
                      <CodeBlock 
                        code={`import { BlobReader } from '@blobkit/sdk';

const reader = new BlobReader({
  rpcUrl: string,
  archiveUrl?: string,
  logLevel?: 'debug' | 'info' | 'silent'
});

// Read blob data
const result = await reader.readBlob(txHash, blobIndex);

// Static decode methods
const text = BlobReader.decodeToString(data);
const json = BlobReader.decodeToJSON(data);`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">BlobSubmitter (Node.js only)</h4>
                      <CodeBlock 
                        code={`import { BlobSubmitter } from '@blobkit/sdk';

const submitter = new BlobSubmitter({
  rpcUrl: string,
  chainId: number,
  escrowAddress?: string
});

// Submit blob directly (requires KZG)
const result = await submitter.submitBlob(
  signer: Signer,
  payload: Uint8Array,
  kzg: KzgLibrary
);

// Estimate costs
const costs = await submitter.estimateCost(payloadSize);`}
                        language="typescript"
                      />
                    </div>
                  </div>
                </div>

                <div id="kzg-functions">
                  <h3 className="text-xl font-bold text-yellow-400 mb-4">KZG Functions</h3>
                  
                  <div className="space-y-4">
                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">KZG Setup</h4>
                      <CodeBlock 
                        code={`import { 
  initializeKzg,
  loadTrustedSetupFromURL,
  loadTrustedSetupFromFile
} from '@blobkit/sdk';

// Initialize KZG (required before blob operations)
await initializeKzg();

// Or with custom setup
await initializeKzg({
  trustedSetupPath: './ceremony.txt',
  expectedHash: '0x...'
});

// Load setup manually
const setupData = await loadTrustedSetupFromURL(url);
const setupFile = await loadTrustedSetupFromFile(path);`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">Blob Encoding</h4>
                      <CodeBlock 
                        code={`import { 
  encodeBlob,
  decodeBlob
} from '@blobkit/sdk';

// Encode data to blob format (131072 bytes)
const blob = encodeBlob(data);

// Decode blob back to original data
const decoded = decodeBlob(blob);`}
                        language="typescript"
                      />
                    </div>

                    <div className="border border-green-400/20 rounded-lg p-4">
                      <h4 className="text-cyan-400 mb-2">KZG Operations</h4>
                      <CodeBlock 
                        code={`import { 
  blobToKzgCommitment,
  computeKzgProof,
  commitmentToVersionedHash
} from '@blobkit/sdk';

// Generate commitment (48 bytes)
const commitment = blobToKzgCommitment(blob);

// Generate proof (48 bytes)
const proof = computeKzgProof(blob, commitment);

// Get versioned hash
const versionedHash = await commitmentToVersionedHash(commitment);`}
                        language="typescript"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Limitations */}
            <section id="limitations" className="mb-16">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6">⚠️ Current Limitations</h2>
              
              <div className="space-y-4">
                <div className="border border-yellow-400/30 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-bold mb-2">No Batch Operations</h3>
                  <p className="text-sm mb-3">
                    The SDK currently only supports writing one blob at a time. While EIP-4844 allows up to 6 blobs per transaction,
                    batch operations are not yet implemented.
                  </p>
                  <CodeBlock 
                    code={`// Current: One blob at a time
await blobkit.writeBlob(data1);
await blobkit.writeBlob(data2);

// Future: Batch operations (not yet available)
// await blobkit.writeBatch([data1, data2, data3]);`}
                    language="typescript"
                  />
                </div>

                <div className="border border-yellow-400/30 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-bold mb-2">Maximum Data Size</h3>
                  <p className="text-sm">
                    <strong className="text-yellow-400">Single blob:</strong> <span className="text-cyan-400">~124KB usable (after encoding overhead)</span><br/>
                    <strong className="text-yellow-400">Per transaction:</strong> <span className="text-cyan-400">6 blobs max (~744KB total) - not yet supported</span><br/>
                    <strong className="text-yellow-400">Actual blob size:</strong> <span className="text-cyan-400">131,072 bytes (128KB)</span><br/>
                    <strong className="text-yellow-400">Encoding overhead:</strong> <span className="text-cyan-400">4-byte header + field element padding</span>
                  </p>
                </div>

                <div className="border border-yellow-400/30 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-bold mb-2">Wallet Support</h3>
                  <p className="text-sm">
                    Most wallets (MetaMask, WalletConnect, etc.) do not support EIP-4844 blob transactions.
                    This is why the proxy system is required for browser environments.
                  </p>
                </div>

                <div className="border border-yellow-400/30 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-bold mb-2">Data Retention</h3>
                  <p className="text-sm">
                    Blob data is only guaranteed to be available for 18 days. After that, nodes may delete it.
                    Use an archive service for permanent storage.
                  </p>
                </div>

                <div className="border border-yellow-400/30 rounded-lg p-4">
                  <h3 className="text-yellow-400 font-bold mb-2">Smart Contract Access</h3>
                  <p className="text-sm">
                    Blob data cannot be accessed from within smart contracts. It's only available to external applications.
                  </p>
                </div>
              </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className="mb-16">
              <h2 className="text-2xl font-bold text-cyan-400 mb-6">❓ Frequently Asked Questions</h2>
              
              <div className="space-y-4">
                {faqs.map((faq) => (
                  <div 
                    key={faq.id}
                    className="border border-green-400/20 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                      className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-green-400/5 transition-colors"
                    >
                      <span className="text-sm font-medium text-yellow-400">{faq.question}</span>
                      <svg 
                        className={`w-4 h-4 transition-transform ${expandedFaq === faq.id ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedFaq === faq.id && (
                      <div className="px-4 pb-3">
                        <p className="text-sm text-gray-400">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-green-400/20 pt-8 mt-16">
              <div className="text-center text-sm">
                <p className="mb-2">
                  Built by <a href="https://x.com/0xzak" className="text-cyan-400">Zak Cole</a> (<a href="https://github.com/zscole" className="text-cyan-400">GitHub</a>) 
                  at <a href="https://numbergroup.xyz" className="text-cyan-400">Number Group</a> for 
                  the <a href="https://ethcf.org" className="text-cyan-400">Ethereum Community Foundation</a>
                </p>
                <p className="text-green-400/50">
                  BlobKit v2.0.0 • Apache 2.0 License
                </p>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}