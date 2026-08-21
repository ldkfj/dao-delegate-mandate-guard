import React from 'react';
import type { TransactionLifecycleState, TransactionStage } from '../contract/types';
import { getContractConfig } from '../contract/config';

interface TransactionLifecyclePanelProps {
  txState: TransactionLifecycleState | null;
  onClear: () => void;
}

const STAGES_ORDER: TransactionStage[] = [
  'SIGNING',
  'SUBMITTED',
  'CONSENSUS_PENDING',
  'FINALIZED',
  'EXECUTION_SUCCESS',
  'READBACK_CONFIRMED',
];

export const TransactionLifecyclePanel: React.FC<TransactionLifecyclePanelProps> = ({
  txState,
  onClear,
}) => {
  if (!txState || txState.stage === 'IDLE') {
    return null;
  }

  const contractConfig = getContractConfig();
  const isErrorStage = [
    'ERROR',
    'TIMEOUT',
    'EXECUTION_FAILED',
    'RECONCILIATION_REQUIRED',
  ].includes(txState.stage);

  const isCompleted = txState.stage === 'READBACK_CONFIRMED';
  const currentStageIndex = STAGES_ORDER.indexOf(txState.stage as any);

  const formatHash = (h: string) => `${h.slice(0, 10)}...${h.slice(-8)}`;

  return (
    <aside
      className={`tx-panel ${isErrorStage ? 'tx-panel-error' : isCompleted ? 'tx-panel-success' : 'tx-panel-active'}`}
      aria-live="polite"
      aria-labelledby="tx-panel-title"
    >
      <div className="tx-panel-header">
        <div className="tx-panel-title-group">
          <span className="tx-status-icon" aria-hidden="true">
            {isCompleted ? '✅' : isErrorStage ? '⚠️' : '⏳'}
          </span>
          <h2 id="tx-panel-title" className="tx-panel-title">
            {txState.methodName
              ? `Transaction: ${txState.methodName}`
              : 'Transaction In Progress'}
          </h2>
          <span className={`tx-stage-badge tx-badge-${txState.stage.toLowerCase()}`}>
            {txState.stage.replace(/_/g, ' ')}
          </span>
        </div>
        <button
          type="button"
          className="btn-tx-dismiss"
          onClick={onClear}
          aria-label="Dismiss transaction notification"
        >
          ✕
        </button>
      </div>

      {/* Lifecycle Progress Stepper */}
      {!isErrorStage && (
        <nav className="tx-stepper" aria-label="Transaction progress stages">
          <ol className="tx-stepper-list">
            {STAGES_ORDER.map((stage, idx) => {
              const isStepDone = currentStageIndex > idx || isCompleted;
              const isStepCurrent = currentStageIndex === idx && !isCompleted;
              return (
                <li
                  key={stage}
                  className={`tx-step-item ${
                    isStepDone ? 'step-done' : isStepCurrent ? 'step-current' : 'step-pending'
                  }`}
                  aria-current={isStepCurrent ? 'step' : undefined}
                >
                  <div className="step-circle" aria-hidden="true">
                    {isStepDone ? '✓' : idx + 1}
                  </div>
                  <span className="step-label">{stage.replace(/_/g, ' ')}</span>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {/* Details Box */}
      <div className="tx-panel-body">
        <p className="tx-message">{txState.message}</p>

        {txState.txHash && (
          <div className="tx-meta-row">
            <span className="tx-meta-label">Transaction Hash:</span>
            <span className="tx-meta-val">
              {contractConfig.explorerUrl ? (
                <a
                  href={`${contractConfig.explorerUrl}/tx/${txState.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tx-hash-link"
                >
                  {formatHash(txState.txHash)} ↗
                </a>
              ) : (
                <code>{txState.txHash}</code>
              )}
            </span>
          </div>
        )}

        {txState.returnedId !== null && (
          <div className="tx-meta-row">
            <span className="tx-meta-label">Returned Entity ID:</span>
            <span className="tx-meta-val">
              <strong className="returned-id-pill">ID #{txState.returnedId}</strong>
            </span>
          </div>
        )}

        {txState.error && (
          <div className="tx-error-box" role="alert">
            <strong>Error Details:</strong>
            <pre>{txState.error}</pre>
          </div>
        )}

        <div className="tx-timestamp">
          <time dateTime={txState.timestamp}>{new Date(txState.timestamp).toLocaleTimeString()}</time>
        </div>
      </div>
    </aside>
  );
};
