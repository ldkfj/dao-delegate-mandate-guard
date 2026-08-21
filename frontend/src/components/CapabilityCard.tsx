import React, { useState, useEffect } from 'react';
import { useWallet } from '../wallet/WalletContext';
import {
  getCapability,
  evaluateCapability,
  recordIntent,
  useCapability,
} from '../contract/service';
import type { CapabilityView, TransactionLifecycleState } from '../contract/types';

interface CapabilityCardProps {
  initialCapabilityId?: string;
  onTransactionStateChange: (state: TransactionLifecycleState) => void;
  onStateUpdated?: (capabilityId: string) => void;
}

export const CapabilityCard: React.FC<CapabilityCardProps> = ({
  initialCapabilityId = '0',
  onTransactionStateChange,
  onStateUpdated,
}) => {
  const { account, provider, isConnected, isCorrectNetwork, openChooser, switchNetwork } =
    useWallet();

  const [searchId, setSearchId] = useState(initialCapabilityId);
  const [capability, setCapability] = useState<CapabilityView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Intent modal state
  const [showIntentModal, setShowIntentModal] = useState(false);
  const [intentText, setIntentText] = useState('Voting YES with 50,000 voting power based on verified bug bounty scope.');
  const [isSubmittingIntent, setIsSubmittingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  // Use capability modal state
  const [showUseModal, setShowUseModal] = useState(false);
  const [useNote, setUseNote] = useState('Cast vote on Snapshot proposal #0x9876 with tx 0xabcd1234');
  const [isSubmittingUse, setIsSubmittingUse] = useState(false);
  const [useError, setUseError] = useState<string | null>(null);

  const [isEvaluating, setIsEvaluating] = useState(false);

  const fetchCapability = async (idToFetch: string) => {
    if (!idToFetch.trim() || isNaN(Number(idToFetch))) {
      setError('Please enter a valid numeric Capability ID');
      setCapability(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getCapability(idToFetch.trim());
      setCapability(data);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || `Failed to fetch capability #${idToFetch}`;
      setError(msg);
      setCapability(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCapabilityId) {
      setSearchId(initialCapabilityId);
      fetchCapability(initialCapabilityId);
    }
  }, [initialCapabilityId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCapability(searchId);
  };

  const handleEvaluate = async () => {
    if (!capability) return;
    setError(null);

    if (!isConnected || !provider || !account) {
      openChooser();
      return;
    }

    if (!isCorrectNetwork) {
      await switchNetwork();
      return;
    }

    try {
      setIsEvaluating(true);
      await evaluateCapability(
        capability.id,
        provider,
        account,
        onTransactionStateChange
      );
      await fetchCapability(capability.id);
      if (onStateUpdated) onStateUpdated(capability.id);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to evaluate capability';
      setError(msg);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleIntentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntentError(null);

    if (!capability) return;
    if (!intentText.trim()) {
      setIntentError('Intent text cannot be empty');
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
      setIsSubmittingIntent(true);
      await recordIntent(
        capability.id,
        intentText.trim(),
        provider,
        account,
        onTransactionStateChange
      );
      setShowIntentModal(false);
      await fetchCapability(capability.id);
      if (onStateUpdated) onStateUpdated(capability.id);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to record intent';
      setIntentError(msg);
    } finally {
      setIsSubmittingIntent(false);
    }
  };

  const handleUseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUseError(null);

    if (!capability) return;
    if (!useNote.trim()) {
      setUseError('Use note cannot be empty');
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
      setIsSubmittingUse(true);
      await useCapability(
        capability.id,
        useNote.trim(),
        provider,
        account,
        onTransactionStateChange
      );
      setShowUseModal(false);
      await fetchCapability(capability.id);
      if (onStateUpdated) onStateUpdated(capability.id);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to use capability';
      setUseError(msg);
    } finally {
      setIsSubmittingUse(false);
    }
  };

  const formatHash = (h: string) => {
    if (!h) return '';
    return `${h.slice(0, 12)}...${h.slice(-10)}`;
  };

  return (
    <section className="card-panel capability-viewer-panel" aria-labelledby="capability-card-title">
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <span className="panel-icon" aria-hidden="true">
            🔑
          </span>
          <div>
            <h2 id="capability-card-title" className="panel-title">
              Capability & Verdict Inspector
            </h2>
            <p className="panel-subtitle">
              Inspect AI consensus verdicts, reasoning traces, conditional bounds, intent logs, and execution state.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="panel-search-form">
          <label htmlFor="search-capability-id" className="visually-hidden">
            Capability ID
          </label>
          <input
            id="search-capability-id"
            type="number"
            min="0"
            step="1"
            className="form-input font-mono search-input"
            placeholder="Capability ID"
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

      {loading && !capability && (
        <div className="panel-loading-state" aria-busy="true">
          <span className="loading-spinner" aria-hidden="true" />
          <p>Querying GenLayer smart storage for Capability #{searchId}...</p>
        </div>
      )}

      {capability && (
        <article className="entity-card capability-card-details">
          <div className="entity-card-header">
            <div className="entity-title-group">
              <span className="entity-id-tag">Capability #{capability.id}</span>
              <span
                className={`status-pill status-${capability.status.toLowerCase()}`}
              >
                {capability.status}
              </span>
              {capability.verdict && (
                <span
                  className={`verdict-pill verdict-${capability.verdict.toLowerCase().replace(/_/g, '-')}`}
                >
                  Verdict: {capability.verdict}
                </span>
              )}
            </div>

            {/* Action Buttons based on status */}
            <div className="entity-action-group">
              {capability.status === 'PENDING' && (
                <button
                  type="button"
                  className="btn-primary-action btn-sm"
                  onClick={handleEvaluate}
                  disabled={isEvaluating}
                >
                  {isEvaluating ? 'Evaluating...' : '⚡ Run AI Consensus'}
                </button>
              )}

              {capability.status === 'GRANTED' && (
                <>
                  <button
                    type="button"
                    className="btn-secondary-action btn-sm"
                    onClick={() => setShowIntentModal(true)}
                  >
                    📝 Record Intent
                  </button>
                  <button
                    type="button"
                    className="btn-primary-action btn-sm"
                    onClick={() => setShowUseModal(true)}
                  >
                    🚀 Use Capability
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Proposal Details */}
          <div className="proposal-summary-box">
            <h3 className="proposal-title-text">{capability.proposal_title}</h3>
            <p className="proposal-url-text font-mono truncate">
              <strong>URL:</strong>{' '}
              <a href={capability.proposal_url} target="_blank" rel="noreferrer">
                {capability.proposal_url} ↗
              </a>
            </p>
          </div>

          <div className="entity-grid">
            <div className="grid-item">
              <span className="grid-label">Target Mandate ID</span>
              <span className="grid-value font-mono">
                Mandate #{capability.mandate_id}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Mandate Content Hash (Pinned)</span>
              <span className="grid-value font-mono" title={capability.mandate_content_hash}>
                {formatHash(capability.mandate_content_hash)}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Proposal Hash (SHA-256)</span>
              <span className="grid-value font-mono" title={capability.proposal_hash}>
                {formatHash(capability.proposal_hash)}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Condition Category</span>
              <span className="grid-value">
                {capability.condition_category || 'None (Unconditional)'}
              </span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Created At (UTC)</span>
              <span className="grid-value font-mono">{capability.created_at}</span>
            </div>

            <div className="grid-item">
              <span className="grid-label">Evaluated At (UTC)</span>
              <span className="grid-value font-mono">
                {capability.evaluated_at || 'Pending Evaluation'}
              </span>
            </div>
          </div>

          {/* Condition Summary */}
          {capability.condition_summary && (
            <div className="entity-section">
              <h4 className="section-label">Condition Constraint Summary:</h4>
              <div className="condition-summary-box">
                {capability.condition_summary}
              </div>
            </div>
          )}

          {/* AI Consensus Reasoning */}
          {capability.reasoning && (
            <div className="entity-section">
              <h4 className="section-label">GenLayer AI Validator Consensus Reasoning:</h4>
              <div className="reasoning-box">{capability.reasoning}</div>
            </div>
          )}

          {/* Proposal Full Text */}
          <div className="entity-section">
            <h4 className="section-label">Submitted Proposal Text:</h4>
            <div className="text-content-box">{capability.proposal_text}</div>
          </div>

          {/* Intent Recorded */}
          {capability.intent_text && (
            <div className="entity-section">
              <h4 className="section-label">Recorded Delegate Intent:</h4>
              <div className="intent-box font-mono">{capability.intent_text}</div>
            </div>
          )}

          {/* Used Details */}
          {capability.status === 'USED' && (
            <div className="used-banner" role="status">
              <h4 className="used-title">Capability Execution Record</h4>
              <p>
                <strong>Used At (UTC):</strong> {capability.used_at || 'Recorded on-chain'}
              </p>
              <p>
                <strong>Execution Note / Tx Proof:</strong> {capability.use_note}
              </p>
            </div>
          )}
        </article>
      )}

      {/* Record Intent Modal */}
      {showIntentModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="intent-modal-title">
          <div className="modal-content">
            <h3 id="intent-modal-title" className="modal-title">
              Record Voting Intent for Capability #{capability?.id}
            </h3>
            <p className="modal-desc">
              Declare your intended voting direction and alignment before broadcasting your transaction.
            </p>

            <form onSubmit={handleIntentSubmit}>
              <div className="form-group">
                <label htmlFor="intent-text-input" className="form-label">
                  Intent Statement <span className="req">*</span>
                </label>
                <textarea
                  id="intent-text-input"
                  className="form-textarea"
                  rows={3}
                  value={intentText}
                  onChange={(e) => setIntentText(e.target.value)}
                  placeholder="e.g. Voting YES on Snapshot with 50,000 votes..."
                  required
                />
              </div>

              {intentError && (
                <div className="form-alert-error" role="alert">
                  <span className="alert-icon">⚠️</span>
                  <span>{intentError}</span>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowIntentModal(false)}
                  disabled={isSubmittingIntent}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmittingIntent}
                >
                  {isSubmittingIntent ? 'Recording...' : 'Save Intent On-Chain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Use Capability Modal */}
      {showUseModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="use-modal-title">
          <div className="modal-content">
            <h3 id="use-modal-title" className="modal-title">
              Execute Capability #{capability?.id}
            </h3>
            <p className="modal-desc">
              Finalize this capability on-chain with proof or a transaction reference note.
            </p>

            <form onSubmit={handleUseSubmit}>
              <div className="form-group">
                <label htmlFor="use-note-input" className="form-label">
                  Execution Note / Vote Proof <span className="req">*</span>
                </label>
                <textarea
                  id="use-note-input"
                  className="form-textarea"
                  rows={3}
                  value={useNote}
                  onChange={(e) => setUseNote(e.target.value)}
                  placeholder="e.g. Cast vote on Snapshot proposal #0x9876..."
                  required
                />
              </div>

              {useError && (
                <div className="form-alert-error" role="alert">
                  <span className="alert-icon">⚠️</span>
                  <span>{useError}</span>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowUseModal(false)}
                  disabled={isSubmittingUse}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmittingUse}
                >
                  {isSubmittingUse ? 'Executing...' : 'Confirm Capability Use'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
