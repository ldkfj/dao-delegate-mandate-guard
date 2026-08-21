import React from 'react';
import { useWallet } from '../wallet/WalletContext';
import { getContractConfig } from '../contract/config';

export const Header: React.FC = () => {
  const {
    account,
    chainId,
    isCorrectNetwork,
    selectedProviderName,
    isConnected,
    isConnecting,
    openChooser,
    disconnect,
    switchNetwork,
  } = useWallet();

  const contractConfig = getContractConfig();

  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon" aria-hidden="true">
          🛡️
        </div>
        <div className="brand-text">
          <h1 className="brand-title">DAO Delegate Mandate Guard</h1>
          <span className="brand-subtitle">GenLayer AI Governance Enforcer</span>
        </div>
      </div>

      <div className="header-actions">
        {/* Network status */}
        <div className="status-badge-group">
          {isConnected && (
            <div
              className={`network-badge ${
                isCorrectNetwork ? 'network-badge-success' : 'network-badge-warning'
              }`}
              title={`Connected Chain ID: ${chainId || 'Unknown'}`}
            >
              <span className="status-dot" aria-hidden="true" />
              {isCorrectNetwork ? (
                <span>Studionet (0xF22F)</span>
              ) : (
                <button
                  type="button"
                  className="btn-switch-network"
                  onClick={switchNetwork}
                  aria-label="Switch to Studionet Network"
                >
                  Wrong Network ({chainId}) - Switch to Studionet
                </button>
              )}
            </div>
          )}

          {/* Contract Address Status */}
          <div
            className={`contract-badge ${
              contractConfig.isConfigured ? 'contract-configured' : 'contract-unconfigured'
            }`}
            title={contractConfig.contractAddress || contractConfig.configError || ''}
          >
            <span className="badge-label">Contract:</span>
            {contractConfig.isConfigured && contractConfig.contractAddress ? (
              <a
                href={`${contractConfig.explorerUrl}/address/${contractConfig.contractAddress}`}
                target="_blank"
                rel="noreferrer"
                className="contract-address-link"
                title="View on GenLayer Explorer"
              >
                {formatAddress(contractConfig.contractAddress)} ↗
              </a>
            ) : (
              <span className="badge-warning-text" role="status">
                Not Configured
              </span>
            )}
          </div>
        </div>

        {/* Wallet Connect/Disconnect */}
        <div className="wallet-actions">
          {isConnected && account ? (
            <div className="wallet-connected-pill">
              <span className="provider-name-badge" title="Active Wallet Provider">
                {selectedProviderName || 'Wallet'}
              </span>
              <span className="account-address" title={account}>
                {formatAddress(account)}
              </span>
              <button
                type="button"
                className="btn-disconnect"
                onClick={disconnect}
                aria-label="Disconnect Wallet"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-connect-wallet"
              onClick={openChooser}
              disabled={isConnecting}
              aria-label="Connect Web3 Wallet"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
