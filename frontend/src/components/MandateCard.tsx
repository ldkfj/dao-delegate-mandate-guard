import React, { useState, useEffect } from 'react';
import { useWallet } from '../wallet/WalletContext';
import { getMandate, revokeMandate } from '../contract/service';
import type { MandateView, TransactionLifecycleState } from '../contract/types';

interface MandateCardProps {
  initialMandateId?: string;
  onTransactionStateChange: (state: TransactionLifecycleState) => void;
  onRevoked?: (mandateId: string) => void;
}

export const MandateCard: React.FC<MandateCardProps> = ({
  initialMandateId = '0',
  onTransactionStateChange,
  onRevoked,
}) => {
  const { account, provider, isConnected, isCorrectNetwork, openChooser, switchNetwork } =
    useWallet();

  const [searchId, setSearchId] = useState(initialMandateId);
  const [mandate, setMandate] = useState<MandateView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revocation modal state
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState('Delegation terminated by DAO governance vote.');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const fetchMandate = async (idToFetch: string) => {
    if (!idToFetch.trim() || isNaN(Number(idToFetch))) {
      setError('Please enter a valid numeric Mandate ID');
      setMandate(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getMandate(idToFetch.trim());
      setMandate(data);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || `Failed to fetch mandate #${idToFetch}`;
      setError(msg);
      setMandate(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialMandateId) {
      setSearchId(initialMandateId);
      fetchMandate(initialMandateId);
    }
  }, [initialMandateId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMandate(searchId);
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevokeError(null);

    if (!mandate) return;
    if (!revokeReason.trim()) {
      setRevokeError('Revocation reason is required');
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
      setIsRevoking(true);
      await revokeMandate(
        mandate.id,
        revokeReason.trim(),
        provider,
        account,
        onTransactionStateChange
      );

      setShowRevokeModal(false);
      await fetchMandate(mandate.id);
      if (onRevoked) onRevoked(mandate.id);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to revoke mandate';
      setRevokeError(msg);
    } finally {
      setIsRevoking(false);
    }
  };

  const formatHash = (h: string) => {
    if (!h) return '';
    return `${h.slice(0, 12)}...${h.slice(-10)}`;
  };

  return (
    <section className="card-panel mandate-viewer-panel" aria-labelledby="mandate-card-title">
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <span className="panel-icon" aria-hidden="true">
            📋
          </span>
          <div>
            <h2 id="mandate-card-title" className="panel-title">
              Mandate Inspector
            </h2>
            <p className="panel-subtitle">
              Inspect on-chain mandate parameters, active status, cryptographic hash, and policy bounds.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="panel-search-form">
          <label htmlFor="search-mandate-id" className="visually-hidden">
            Mandate ID
          </label>
          <input
            id="search-mandate-id"
            type="number"
            min="0"
            step="1"
            className="form-input font-mono search-input"
            placeholder="Mandate ID"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
          />
          <button type="submit" className="btn-search" disabled={loading}>
            {loading ? 'Fetching...' : 'Lookup'}
          </button>
        </form>
      </div>

      {error && (
        <div className="form-alert-error" role="alert">
          <span className="alert-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {loading && !mandate && (
        <div className="panel-loading-state" aria-busy="true">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Querying GenLayer smart storage for Mandate #{searchId}...</p>
        </div>
      )}

      {mandate && (
        <article className="entity-card mandate-card-details">
          <div className="entity-card-header">
            <div className="entity-title-group">
              <span className="entity-id-tag">Mandate #{mandate.id}</span>
              <span
                className={`status-pill status-${mandate.status.toLowerCase()}`}
              >
                {mandate.status}
              </span>
              {mandate.is_expired && mandate.status !== 'EXPIRED' && (
                <span className="status-pill status-expired">PAST EXPIRY</span>
              )}
            </div>

            {/* Action buttons */}
            {mandate.status === 'ACTIVE' && (
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => setShowRevokeModal(true)}
              >
                Revoke Mandate
              </button>
            )}
          </div>

          <div className="entity-grid">
            <div className="grid-item">
              <span className="grid-label">Owner (Creator)</span>
              <span className="grid-value font-mono" title={mandate.owner}>
                {mandate.owner}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Authorized Delegate</span>
              <span className="grid-value font-mono" title={mandate.delegate}>
                {mandate.delegate}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Policy Metadata URI</span>
              <span className="grid-value font-mono truncate" title={mandate.policy_uri}>
                {mandate.policy_uri}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Cryptographic Content Hash (SHA-256)</span>
              <span className="grid-value font-mono" title={mandate.content_hash}>
                {formatHash(mandate.content_hash)}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Expires At (UTC)</span>
              <span className="grid-value font-mono">{mandate.expires_at}</span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Created At (UTC)</span>
              <span className="grid-value font-mono">{mandate.created_at}</span>
            </div>
          </div>

          {/* Text Areas */}
          <div className="entity-section">
            <h4 className="section-label">Authorized Policy Scope:</h4>
            <div className="text-content-box">{mandate.policy_text}</div>
          </div>

          <div className="entity-section">
            <h4 className="section-label">Exclusions & Restrictions:</h4>
            <div className="text-content-box exclusions-box">{mandate.exclusions_text}</div>
          </div>

          {mandate.status === 'REVOKED' && (
            <div className="revocation-banner" role="status">
              <h4 className="revocation-title">Revocation Details</h4>
              <p>
                <strong>Revoked At:</strong> {mandate.revoked_at || 'Recorded on-chain'}
              </p>
              <p>
                <strong>Reason:</strong> {mandate.revocation_reason}
              </p>
            </div>
          )}
        </article>
      )}

      {/* Revocation Modal */}
      {showRevokeModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="revoke-modal-title">
          <div className="modal-content modal-danger">
            <h3 id="revoke-modal-title" className="modal-title">
              Revoke Mandate #{mandate?.id}
            </h3>
            <p className="modal-desc">
              Revoking this mandate immediately invalidates all future capability evaluations and actions.
            </p>

            <form onSubmit={handleRevokeSubmit}>
              <div className="form-group">
                <label htmlFor="revoke-reason-input" className="form-label">
                  Revocation Reason <span className="req">*</span>
                </label>
                <textarea
                  id="revoke-reason-input"
                  className="form-textarea"
                  rows={3}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Enter reason for revocation..."
                  required
                />
              </div>

              {revokeError && (
                <div className="form-alert-error" role="alert">
                  <span className="alert-icon">⚠️</span>
                  <span>{revokeError}</span>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowRevokeModal(false)}
                  disabled={isRevoking}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={isRevoking}
                >
                  {isRevoking ? 'Revoking...' : 'Confirm Revocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
