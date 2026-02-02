'use client';

import { ReactNode, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  BackpackWalletAdapter,
  LedgerWalletAdapter,
  TorusWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

import { PrivacyKitProvider } from '@/context/PrivacyKitContext';
import './globals.css';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  // Configure RPC endpoint - use environment variable or default to devnet
  const endpoint = useMemo(() => {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    if (rpcUrl) return rpcUrl;
    return clusterApiUrl('devnet');
  }, []);

  // Configure supported wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new BackpackWalletAdapter(),
      new LedgerWalletAdapter(),
      new TorusWalletAdapter(),
    ],
    []
  );

  return (
    <html lang="en">
      <head>
        <title>PrivacyKit Demo - Private Transfers on Solana</title>
        <meta
          name="description"
          content="Demonstration of PrivacyKit SDK for private transfers on Solana"
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="antialiased">
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>
              <PrivacyKitProvider network="devnet">
                <div className="min-h-screen">
                  <Header />
                  <main className="container mx-auto px-4 py-8">
                    {children}
                  </main>
                  <Footer />
                </div>
              </PrivacyKitProvider>
            </WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <svg
            className="w-8 h-8 text-privacy-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="text-xl font-bold text-slate-900 dark:text-white">
            PrivacyKit
          </span>
          <span className="text-xs bg-privacy-100 text-privacy-800 px-2 py-0.5 rounded-full font-medium">
            Demo
          </span>
        </div>
        <nav className="flex items-center space-x-6">
          <a
            href="https://docs.privacykit.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            Docs
          </a>
          <a
            href="https://github.com/privacykit/privacykit"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 py-8 mt-auto">
      <div className="container mx-auto px-4 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>
          Built with PrivacyKit SDK - Unified Privacy for Solana
        </p>
        <p className="mt-2">
          Powered by ShadowWire, Arcium, Noir, and Privacy Cash
        </p>
      </div>
    </footer>
  );
}
