import React, { useState } from 'react';
import { Header } from './components/Header';
import { TransactionLifecyclePanel } from './components/TransactionLifecyclePanel';
import { MandateBuilder } from './components/MandateBuilder';
import { ProposalEvaluator } from './components/ProposalEvaluator';
import { MandateCard } from './components/MandateCard';
import { CapabilityCard } from './components/CapabilityCard';
import { AuditTimeline } from './components/AuditTimeline';
import { WalletChooserModal } from './wallet/WalletChooserModal';
import { useWallet } from './wallet/WalletContext';
import { getContractConfig } from './contract/config';
import type { TransactionLifecycleState } from './contract/types';

export const App: React.FC = () => {
  const contractConfig = getContractConfig();
  const { isChooserOpen } = useWallet();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'mandates' | 'proposals' | 'timeline'>('mandates');

  // Transaction Lifecycle state
  const [txState, setTxState] = useState<TransactionLifecycleState | null>(null);

  // Selected Entities across components
  const [selectedMandateId, setSelectedMandateId] = useState<string>('0');
  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string>('0');
  const [auditRefreshTrigger, setAuditRefreshTrigger] = useState<number>(0);

  const handleMandateCreated = (mandateId: string) => {
    setSelectedMandateId(mandateId);
    setAuditRefreshTrigger((prev) => prev + 1);
  };

  const handleProposalSubmitted = (capabilityId: string) => {
    setSelectedCapabilityId(capabilityId);
    setActiveTab('proposals');
    setAuditRefreshTrigger((prev) => prev + 1);
  };

  const handleStateUpdated = () => {
    setAuditRefreshTrigger((prev) => prev + 1);
  };

  const handleSelectMandateFromTimeline = (mandateId: string) => {
    setSelectedMandateId(mandateId);
    setActiveTab('mandates');
  };

  const handleSelectCapabilityFromTimeline = (capabilityId: string) => {
    setSelectedCapabilityId(capabilityId);
    setActiveTab('proposals');
  };

  return (
    <div className="app-layout">
      {/* Wallet Chooser Dialog Modal - Outside inert application shell */}
      <WalletChooserModal />

      {/* Application Shell - Inert while modal is active */}
      <div
        className="app-shell"
        data-testid="app-shell"
        inert={isChooserOpen ? true : undefined}
        aria-hidden={isChooserOpen ? 'true' : undefined}
      >
        {/* Header Bar */}
        <Header />

        {/* Contract Configuration Warning if not configured */}
        {!contractConfig.isConfigured && (
          <div className="banner-config-warning" role="alert">
            <div className="banner-icon">ℹ️</div>
            <div className="banner-text">
              <strong>Contract Address Not Configured:</strong> Set{' '}
              <code>VITE_CONTRACT_ADDRESS=0x...</code> in <code>frontend/.env</code> to point to a
              deployed GenLayer Studionet contract. Live read and write transactions require a valid
              20-byte contract address.
            </div>
          </div>
        )}

        {/* Transaction Lifecycle Monitor Panel */}
        <TransactionLifecyclePanel
          txState={txState}
          onClear={() => setTxState(null)}
        />

        {/* Navigation Tabs */}
        <main className="main-content">
          <nav className="tab-navigation" aria-label="Dashboard views">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'mandates' ? 'tab-btn-active' : ''}`}
              onClick={() => setActiveTab('mandates')}
              aria-selected={activeTab === 'mandates'}
              role="tab"
            >
              📜 Mandate Studio
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'proposals' ? 'tab-btn-active' : ''}`}
              onClick={() => setActiveTab('proposals')}
              aria-selected={activeTab === 'proposals'}
              role="tab"
            >
              ⚖️ Proposal & AI Consensus
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'timeline' ? 'tab-btn-active' : ''}`}
              onClick={() => setActiveTab('timeline')}
              aria-selected={activeTab === 'timeline'}
              role="tab"
            >
              📊 Audit Timeline
            </button>
          </nav>

          {/* Tab 1: Mandates */}
          {activeTab === 'mandates' && (
            <div className="dashboard-grid">
              <div className="grid-col">
                <MandateBuilder
                  onTransactionStateChange={setTxState}
                  onMandateCreated={handleMandateCreated}
                />
              </div>
              <div className="grid-col">
                <MandateCard
                  initialMandateId={selectedMandateId}
                  onTransactionStateChange={setTxState}
                  onRevoked={handleStateUpdated}
                />
              </div>
            </div>
          )}

          {/* Tab 2: Proposals & Capability Consensus */}
          {activeTab === 'proposals' && (
            <div className="dashboard-grid">
              <div className="grid-col">
                <ProposalEvaluator
                  initialMandateId={selectedMandateId}
                  onTransactionStateChange={setTxState}
                  onProposalSubmitted={handleProposalSubmitted}
                />
              </div>
              <div className="grid-col">
                <CapabilityCard
                  initialCapabilityId={selectedCapabilityId}
                  onTransactionStateChange={setTxState}
                  onStateUpdated={handleStateUpdated}
                />
              </div>
            </div>
          )}

          {/* Tab 3: Audit Timeline */}
          {activeTab === 'timeline' && (
            <div className="dashboard-single">
              <AuditTimeline
                refreshTrigger={auditRefreshTrigger}
                onSelectMandate={handleSelectMandateFromTimeline}
                onSelectCapability={handleSelectCapabilityFromTimeline}
              />
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <div className="footer-content">
            <span>
              GenLayer Studionet (<code>0xF22F</code>) &bull; Intelligent Contract Governance Guard
            </span>
            <span>
              Compliant with EIP-6963, EIP-1193, and Deterministic AI Validator Consensus
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};
