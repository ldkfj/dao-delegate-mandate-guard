import React, { useState } from 'react';
import { useWallet } from '../wallet/WalletContext';
import { submitProposal, evaluateCapability } from '../contract/service';
import type { TransactionLifecycleState } from '../contract/types';

interface ProposalEvaluatorProps {
  initialMandateId?: string;
  onTransactionStateChange: (state: TransactionLifecycleState) => void;
  onProposalSubmitted?: (capabilityId: string) => void;
}

export const ProposalEvaluator: React.FC<ProposalEvaluatorProps> = ({
  initialMandateId = '0',
  onTransactionStateChange,
  onProposalSubmitted,
}) => {
  const { account, provider, isConnected, isCorrectNetwork, openChooser, switchNetwork } =
    useWallet();

  const [mandateId, setMandateId] = useState(initialMandateId);
  const [proposalUrl, setProposalUrl] = useState('https://snapshot.org/#/dao.eth/proposal/0x9876');
  const [proposalTitle, setProposalTitle] = useState('Security Bug Bounty Program - Q3 Funding');
  const [proposalText, setProposalText] = useState(
    'Allocate $45,000 from the community treasury to fund the Q3 smart contract bug bounty program on Immunefi.'
  );

  const [evalCapabilityId, setEvalCapabilityId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Preset Proposals
  const loadPreset = (type: 'compliant' | 'violation') => {
    if (type === 'compliant') {
      setProposalTitle('Security Bug Bounty Program - Q3 Funding');
      setProposalUrl('https://snapshot.org/#/dao.eth/proposal/0x9876');
      setProposalText(
        'Allocate $45,000 from the community treasury to fund the Q3 smart contract bug bounty program on Immunefi.'
      );
    } else {
      setProposalTitle('Emergency Collateralization Ratio Reduction');
      setProposalUrl('https://snapshot.org/#/dao.eth/proposal/0x5432');
      setProposalText(
        'Reduce the global protocol minimum collateralization ratio from 150% to 110% to boost liquidity utilization.'
      );
    }
  };

  const handleProposalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!mandateId.trim() || isNaN(Number(mandateId)) || Number(mandateId) < 0) {
      setFormError('Mandate ID must be a non-negative integer');
      return;
    }

    if (!proposalUrl.trim()) {
      setFormError('Proposal URL cannot be empty');
      return;
    }

    if (!proposalTitle.trim()) {
      setFormError('Proposal title cannot be empty');
      return;
    }

    if (!proposalText.trim()) {
      setFormError('Proposal text cannot be empty');
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
      const res = await submitProposal(
        {
          mandateId: mandateId.trim(),
          proposalUrl: proposalUrl.trim(),
          proposalTitle: proposalTitle.trim(),
          proposalText,
        },
        provider,
        account,
        onTransactionStateChange
      );

      if (onProposalSubmitted && res.capabilityId) {
        onProposalSubmitted(res.capabilityId);
        setEvalCapabilityId(res.capabilityId);
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to submit proposal';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEvaluateCapability = async () => {
    setFormError(null);

    if (!evalCapabilityId.trim() || isNaN(Number(evalCapabilityId)) || Number(evalCapabilityId) < 0) {
      setFormError('Capability ID must be a valid non-negative integer');
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
      setIsEvaluating(true);
      await evaluateCapability(
        evalCapabilityId.trim(),
        provider,
        account,
        onTransactionStateChange
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to evaluate capability';
      setFormError(msg);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <section className="card-panel proposal-evaluator-panel" aria-labelledby="proposal-evaluator-title">
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <span className="panel-icon" aria-hidden="true">
            ⚖️
          </span>
          <div>
            <h2 id="proposal-evaluator-title" className="panel-title">
              Proposal Evaluator & Submission
            </h2>
            <p className="panel-subtitle">
              Submit a DAO proposal against an active mandate and trigger GenLayer intelligent consensus.
            </p>
          </div>
        </div>
      </div>

      <div className="preset-selector-row">
        <span className="preset-label">Load Template:</span>
        <button
          type="button"
          className="btn-preset btn-preset-compliant"
          onClick={() => loadPreset('compliant')}
        >
          ✓ Compliant Grant ($45k Bounty)
        </button>
        <button
          type="button"
          className="btn-preset btn-preset-violation"
          onClick={() => loadPreset('violation')}
        >
          ✕ Policy Violation (Collateral Drop)
        </button>
      </div>

      <form onSubmit={handleProposalSubmit} className="builder-form" noValidate>
        {/* Mandate Target ID */}
        <div className="form-group">
          <label htmlFor="input-mandate-id" className="form-label">
            Target Mandate ID <span className="req">*</span>
          </label>
          <input
            id="input-mandate-id"
            type="number"
            min="0"
            step="1"
            className="form-input font-mono"
            placeholder="0"
            value={mandateId}
            onChange={(e) => setMandateId(e.target.value)}
            required
          />
        </div>

        {/* Proposal Title */}
        <div className="form-group">
          <label htmlFor="input-proposal-title" className="form-label">
            Proposal Title <span className="req">*</span>
          </label>
          <input
            id="input-proposal-title"
            type="text"
            className="form-input"
            placeholder="e.g. Treasury Grant for Q3 Audits"
            value={proposalTitle}
            onChange={(e) => setProposalTitle(e.target.value)}
            required
          />
        </div>

        {/* Proposal URL */}
        <div className="form-group">
          <label htmlFor="input-proposal-url" className="form-label">
            Proposal Snapshot/Governance URL <span className="req">*</span>
          </label>
          <input
            id="input-proposal-url"
            type="text"
            className="form-input font-mono"
            placeholder="https://snapshot.org/#/dao.eth/proposal/..."
            value={proposalUrl}
            onChange={(e) => setProposalUrl(e.target.value)}
            required
          />
        </div>

        {/* Proposal Text */}
        <div className="form-group">
          <label htmlFor="input-proposal-text" className="form-label">
            Proposal Full Text / Specification <span className="req">*</span>
          </label>
          <textarea
            id="input-proposal-text"
            className="form-textarea"
            rows={4}
            placeholder="Paste full text of the proposal to evaluate against delegate mandate and exclusions..."
            value={proposalText}
            onChange={(e) => setProposalText(e.target.value)}
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
              Connect Wallet to Submit Proposal
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
              {isSubmitting ? 'Submitting Proposal...' : 'Submit Proposal for Evaluation'}
            </button>
          )}
        </div>
      </form>

      {/* Direct AI Consensus Evaluator Trigger */}
      <div className="direct-eval-box">
        <h3 className="direct-eval-title">⚡ Trigger AI Consensus Evaluation</h3>
        <p className="direct-eval-desc">
          Evaluate an existing PENDING capability using GenLayer LLM intelligent validator consensus.
        </p>
        <div className="direct-eval-input-row">
          <input
            type="number"
            min="0"
            step="1"
            className="form-input font-mono"
            placeholder="Capability ID (e.g. 0)"
            value={evalCapabilityId}
            onChange={(e) => setEvalCapabilityId(e.target.value)}
            aria-label="Capability ID to evaluate"
          />
          <button
            type="button"
            className="btn-secondary-action"
            onClick={handleEvaluateCapability}
            disabled={isEvaluating || !evalCapabilityId.trim()}
          >
            {isEvaluating ? 'Evaluating with AI...' : 'Run Consensus Evaluation'}
          </button>
        </div>
      </div>
    </section>
  );
};
