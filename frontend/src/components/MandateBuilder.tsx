import React, { useState } from 'react';
import { useWallet } from '../wallet/WalletContext';
import { createMandate } from '../contract/service';
import type { TransactionLifecycleState } from '../contract/types';

interface MandateBuilderProps {
  onTransactionStateChange: (state: TransactionLifecycleState) => void;
  onMandateCreated?: (mandateId: string) => void;
}

export const MandateBuilder: React.FC<MandateBuilderProps> = ({
  onTransactionStateChange,
  onMandateCreated,
}) => {
  const { account, provider, isConnected, isCorrectNetwork, openChooser, switchNetwork } =
    useWallet();

  const [delegate, setDelegate] = useState('');
  const [policyUri, setPolicyUri] = useState('ipfs://bafkreiauthorizeddelegatemandate2026');
  const [policyText, setPolicyText] = useState(
    'Vote YES on community treasury grants for security audits and bug bounty initiatives under $100k.'
  );
  const [exclusionsText, setExclusionsText] = useState(
    'Never vote to reduce protocol collateralization ratios or approve grants exceeding $100k without separate multisig approval.'
  );

  // Default to 90 days from now in ISO 8601 UTC
  const getDefaultExpiry = (daysFromNow = 90) => {
    const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };

  const [expiresAt, setExpiresAt] = useState(getDefaultExpiry(90));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addressRegex = /^0x[0-9a-fA-F]{40}$/;

  const handleSetPresetExpiry = (days: number) => {
    setExpiresAt(getDefaultExpiry(days));
  };

  const handleUseMyAddress = () => {
    if (account) {
      setDelegate(account);
      setFormError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedDelegate = delegate.trim();
    if (!addressRegex.test(trimmedDelegate)) {
      setFormError('Delegate must be a valid 20-byte hex address (0x...)');
      return;
    }

    if (!policyUri.trim()) {
      setFormError('Policy URI cannot be empty');
      return;
    }

    if (!policyText.trim()) {
      setFormError('Policy text cannot be empty');
      return;
    }

    if (!exclusionsText.trim()) {
      setFormError('Exclusions text cannot be empty');
      return;
    }

    if (!expiresAt.trim()) {
      setFormError('Expiration timestamp cannot be empty');
      return;
    }

    // Basic date validation
    const parsedDate = Date.parse(expiresAt);
    if (isNaN(parsedDate)) {
      setFormError('Expiration timestamp must be a valid ISO 8601 UTC date (e.g. 2026-12-31T00:00:00Z)');
      return;
    }

    if (parsedDate <= Date.now()) {
      setFormError('Expiration timestamp must be in the future');
      return;
    }

    if (!isConnected || !provider || !account) {
      openChooser();
      return;
    }

    if (!isCorrectNetwork) {
      await switchNetwork();
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createMandate(
        {
          delegate: trimmedDelegate,
          policyUri: policyUri.trim(),
          policyText,
          exclusionsText,
          expiresAt: expiresAt.trim(),
        },
        provider,
        account,
        onTransactionStateChange
      );

      if (onMandateCreated && res.mandateId) {
        onMandateCreated(res.mandateId);
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to create mandate';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card-panel mandate-builder-panel" aria-labelledby="mandate-builder-title">
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <span className="panel-icon" aria-hidden="true">
            📜
          </span>
          <div>
            <h2 id="mandate-builder-title" className="panel-title">
              Create Delegate Mandate
            </h2>
            <p className="panel-subtitle">
              Issue an immutable, AI-evaluated governance mandate for a delegate address.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="builder-form" noValidate>
        {/* Delegate Address */}
        <div className="form-group">
          <div className="form-label-row">
            <label htmlFor="input-delegate" className="form-label">
              Delegate Address (20-byte 0x hex) <span className="req">*</span>
            </label>
            {account && (
              <button
                type="button"
                className="btn-text-helper"
                onClick={handleUseMyAddress}
              >
                Use Connected Wallet
              </button>
            )}
          </div>
          <input
            id="input-delegate"
            type="text"
            className={`form-input font-mono ${
              delegate && !addressRegex.test(delegate.trim()) ? 'input-invalid' : ''
            }`}
            placeholder="0x1234567890123456789012345678901234567890"
            value={delegate}
            onChange={(e) => {
              setDelegate(e.target.value);
              setFormError(null);
            }}
            required
          />
        </div>

        {/* Policy URI */}
        <div className="form-group">
          <label htmlFor="input-policy-uri" className="form-label">
            Policy URI / Metadata <span className="req">*</span>
          </label>
          <input
            id="input-policy-uri"
            type="text"
            className="form-input"
            placeholder="ipfs://... or https://..."
            value={policyUri}
            onChange={(e) => setPolicyUri(e.target.value)}
            required
          />
        </div>

        {/* Policy Text */}
        <div className="form-group">
          <label htmlFor="input-policy-text" className="form-label">
            Mandate Policy Scope (Authorized Actions) <span className="req">*</span>
          </label>
          <textarea
            id="input-policy-text"
            className="form-textarea"
            rows={3}
            placeholder="Specify what proposals the delegate is authorized to support..."
            value={policyText}
            onChange={(e) => setPolicyText(e.target.value)}
            required
          />
        </div>

        {/* Exclusions Text */}
        <div className="form-group">
          <label htmlFor="input-exclusions-text" className="form-label">
            Exclusions & Restrictions (Forbidden Actions) <span className="req">*</span>
          </label>
          <textarea
            id="input-exclusions-text"
            className="form-textarea"
            rows={3}
            placeholder="Specify restrictions, red lines, or conditions where voting is forbidden..."
            value={exclusionsText}
            onChange={(e) => setExclusionsText(e.target.value)}
            required
          />
        </div>

        {/* Expiry Date */}
        <div className="form-group">
          <div className="form-label-row">
            <label htmlFor="input-expires-at" className="form-label">
              Expiration Timestamp (ISO 8601 UTC) <span className="req">*</span>
            </label>
            <div className="preset-buttons">
              <button
                type="button"
                className="btn-chip"
                onClick={() => handleSetPresetExpiry(7)}
              >
                +7 Days
              </button>
              <button
                type="button"
                className="btn-chip"
                onClick={() => handleSetPresetExpiry(30)}
              >
                +30 Days
              </button>
              <button
                type="button"
                className="btn-chip"
                onClick={() => handleSetPresetExpiry(90)}
              >
                +90 Days
              </button>
              <button
                type="button"
                className="btn-chip"
                onClick={() => handleSetPresetExpiry(365)}
              >
                +1 Year
              </button>
            </div>
          </div>
          <input
            id="input-expires-at"
            type="text"
            className="form-input font-mono"
            placeholder="2027-01-01T00:00:00Z"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            required
          />
        </div>

        {/* Form Error Alert */}
        {formError && (
          <div className="form-alert-error" role="alert">
            <span className="alert-icon">⚠️</span>
            <span>{formError}</span>
          </div>
        )}

        {/* Submit Actions */}
        <div className="form-actions">
          {!isConnected ? (
            <button
              type="button"
              className="btn-primary-action"
              onClick={openChooser}
            >
              Connect Wallet to Create Mandate
            </button>
          ) : !isCorrectNetwork ? (
            <button
              type="button"
              className="btn-warning-action"
              onClick={switchNetwork}
            >
              Switch to Studionet (0xF22F)
            </button>
          ) : (
            <button
              type="submit"
              className="btn-primary-action"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting Mandate...' : 'Create Mandate On-Chain'}
            </button>
          )}
        </div>
      </form>
    </section>
  );
};
