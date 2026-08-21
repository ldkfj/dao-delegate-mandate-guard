import React, { useEffect, useRef } from 'react';
import { useWallet } from './WalletContext';

interface WalletChooserModalProps {
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const WalletChooserModal: React.FC<WalletChooserModalProps> = ({ triggerRef }) => {
  const {
    isChooserOpen,
    closeChooser,
    discoveredWallets,
    connect,
    isConnecting,
    error,
    clearError,
  } = useWallet();

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus trap, keyboard handling, and focus restoration
  useEffect(() => {
    if (!isChooserOpen) return;

    // Capture active element before opening modal for later restoration
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Focus close button initially
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeChooser();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      // Restore focus on close / unmount
      if (triggerRef?.current) {
        triggerRef.current.focus();
      } else if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isChooserOpen, closeChooser, triggerRef]);

  if (!isChooserOpen) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeChooser();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      data-testid="wallet-modal-backdrop"
    >
      <div
        ref={dialogRef}
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-chooser-title"
        data-testid="wallet-chooser-dialog"
      >
        <div className="modal-header">
          <h2 id="wallet-chooser-title" className="modal-title">
            Connect Governance Wallet
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn btn-icon btn-close"
            onClick={closeChooser}
            aria-label="Close wallet connection dialog"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Select an authorized EIP-6963 provider to interact with GenLayer Studionet (0xF22F). Supported wallets: MetaMask, OKX Wallet, Rabby.
          </p>

          {error && (
            <div className="alert alert-error" role="alert" data-testid="wallet-error-alert">
              <div className="alert-message">{error}</div>
              <button
                type="button"
                className="btn btn-link btn-sm"
                onClick={clearError}
                aria-label="Dismiss error"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="wallet-list" role="menu" aria-label="Available Wallets">
            {discoveredWallets.length === 0 ? (
              <div className="empty-state" data-testid="no-wallets-found">
                <p>No supported wallet extensions detected.</p>
                <p className="text-muted text-sm">
                  Please install or enable MetaMask, OKX Wallet, or Rabby in your browser.
                </p>
              </div>
            ) : (
              discoveredWallets.map((wallet) => (
                <button
                  key={wallet.id}
                  type="button"
                  role="menuitem"
                  className="wallet-item-btn"
                  disabled={isConnecting}
                  onClick={() => connect(wallet)}
                  data-testid={`wallet-option-${wallet.rdns}`}
                >
                  <div className="wallet-item-content">
                    {wallet.icon ? (
                      <img
                        src={wallet.icon}
                        alt=""
                        className="wallet-icon"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="wallet-icon-placeholder" aria-hidden="true">
                        ⬡
                      </span>
                    )}
                    <div className="wallet-info">
                      <span className="wallet-name">{wallet.name}</span>
                      <span className="wallet-rdns text-muted text-xs">
                        {wallet.isFallback ? 'Injected fallback' : wallet.rdns}
                      </span>
                    </div>
                  </div>
                  {isConnecting && (
                    <span className="spinner-sm" aria-label="Connecting..." />
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={closeChooser}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
