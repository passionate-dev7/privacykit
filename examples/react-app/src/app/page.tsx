'use client';

import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { PrivateTransfer } from '@/components/PrivateTransfer';
import { BalanceOverview } from '@/components/Balance';
import { usePrivacyKit } from '@/context/PrivacyKitContext';

type Tab = 'transfer' | 'balances';

/**
 * Tab navigation component
 */
function TabNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    {
      id: 'transfer',
      label: 'Transfer',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        </svg>
      ),
    },
    {
      id: 'balances',
      label: 'Balances',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all ${
            activeTab === tab.id
              ? 'bg-white dark:bg-slate-700 text-privacy-600 dark:text-privacy-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {tab.icon}
          <span className="font-medium">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Network status indicator
 */
function NetworkStatus() {
  const { network, isInitialized, availableProviders } = usePrivacyKit();

  return (
    <div className="flex items-center space-x-4 text-sm">
      <div className="flex items-center space-x-2">
        <span
          className={`w-2 h-2 rounded-full ${
            isInitialized ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
          }`}
        />
        <span className="text-slate-600 dark:text-slate-400">
          {isInitialized ? 'Connected' : 'Connecting...'}
        </span>
      </div>
      <div className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <span className="text-slate-600 dark:text-slate-400 capitalize">{network}</span>
      </div>
      {availableProviders.length > 0 && (
        <div className="px-2 py-1 bg-privacy-100 dark:bg-privacy-900 rounded-lg">
          <span className="text-privacy-700 dark:text-privacy-300">
            {availableProviders.length} provider{availableProviders.length !== 1 ? 's' : ''} active
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Hero section with introduction
 */
function HeroSection() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
        Private Transfers on Solana
      </h1>
      <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
        Send and receive tokens privately using zero-knowledge proofs.
        Your financial activity stays confidential with PrivacyKit.
      </p>

      {/* Feature highlights */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        <FeatureCard
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          }
          title="Amount Privacy"
          description="Hide transfer amounts with ZK proofs"
        />
        <FeatureCard
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          }
          title="Sender Anonymity"
          description="Anonymize your identity as sender"
        />
        <FeatureCard
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          }
          title="Full Encryption"
          description="MPC-based complete encryption"
        />
      </div>
    </div>
  );
}

/**
 * Feature card component
 */
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: JSX.Element;
  title: string;
  description: string;
}) {
  return (
    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="w-12 h-12 bg-privacy-100 dark:bg-privacy-900 rounded-lg flex items-center justify-center text-privacy-600 dark:text-privacy-400 mx-auto mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
    </div>
  );
}

/**
 * Provider info section
 */
function ProvidersInfo() {
  const providers = [
    {
      name: 'ShadowWire',
      description: 'Bulletproof-based privacy for amount hiding',
      features: ['Amount Hidden', 'Sender Hidden'],
      color: 'green',
    },
    {
      name: 'Arcium',
      description: 'Multi-Party Computation for full encryption',
      features: ['Full Encryption', 'MPC Network'],
      color: 'purple',
    },
    {
      name: 'Privacy Cash',
      description: 'Compliant privacy with proof of innocence',
      features: ['Compliance Ready', 'Regulated'],
      color: 'orange',
    },
  ];

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-6">
        Powered by Leading Privacy Protocols
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {providers.map((provider) => (
          <div
            key={provider.name}
            className="p-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              {provider.name}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {provider.description}
            </p>
            <div className="flex flex-wrap gap-2">
              {provider.features.map((feature) => (
                <span
                  key={feature}
                  className={`px-2 py-1 text-xs rounded-full bg-${provider.color}-100 dark:bg-${provider.color}-900/30 text-${provider.color}-700 dark:text-${provider.color}-300`}
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Main page component
 */
export default function Home() {
  const { connected } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('transfer');

  return (
    <div className="space-y-8">
      {/* Wallet connection section */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <NetworkStatus />
        <WalletMultiButton />
      </div>

      {/* Show hero for non-connected users */}
      {!connected && <HeroSection />}

      {/* Main content area */}
      {connected && (
        <>
          {/* Tab navigation */}
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab content */}
          <div className="min-h-[500px]">
            {activeTab === 'transfer' && <PrivateTransfer />}
            {activeTab === 'balances' && <BalanceOverview />}
          </div>
        </>
      )}

      {/* Provider information */}
      <ProvidersInfo />

      {/* Documentation link */}
      <div className="text-center p-8 bg-gradient-to-r from-privacy-600 to-privacy-800 rounded-xl text-white">
        <h2 className="text-2xl font-bold mb-2">Ready to Build?</h2>
        <p className="text-privacy-100 mb-6">
          Integrate private transfers into your dApp with just a few lines of code.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="https://docs.privacykit.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-white text-privacy-700 font-medium rounded-lg hover:bg-privacy-50 transition-colors"
          >
            View Documentation
          </a>
          <a
            href="https://github.com/privacykit/privacykit"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-privacy-700 text-white font-medium rounded-lg hover:bg-privacy-800 transition-colors border border-privacy-500"
          >
            GitHub Repository
          </a>
        </div>
      </div>
    </div>
  );
}
