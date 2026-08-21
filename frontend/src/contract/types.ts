// Domain types for Mandate Guard

export type MandateStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export interface MandateView {
  id: string;
  owner: string;
  delegate: string;
  policy_uri: string;
  policy_text: string;
  exclusions_text: string;
  content_hash: string;
  expires_at: string;
  status: MandateStatus;
  is_expired: boolean;
  created_at: string;
  revoked_at: string;
  revocation_reason: string;
}

export type CapabilityStatus = 'PENDING' | 'GRANTED' | 'USED' | 'DENIED' | 'EXPIRED';
export type CapabilityVerdict = 'WITHIN_MANDATE' | 'CONDITIONAL' | 'OUTSIDE_MANDATE' | 'AMBIGUOUS' | '';
export type ConditionCategory =
  | 'BUDGET_CAP'
  | 'REPORTING_REQUIRED'
  | 'TIMELINE_CONSTRAINT'
  | 'SCOPE_LIMITATION'
  | 'GOVERNANCE_ALIGNMENT'
  | '';

export interface CapabilityView {
  id: string;
  mandate_id: string;
  mandate_content_hash: string;
  proposal_url: string;
  proposal_title: string;
  proposal_text: string;
  proposal_hash: string;
  status: CapabilityStatus;
  verdict: CapabilityVerdict;
  condition_category: ConditionCategory;
  condition_summary: string;
  reasoning: string;
  intent_text: string;
  use_note: string;
  created_at: string;
  evaluated_at: string;
  used_at: string;
}

export type AuditEventKind =
  | 'MANDATE_CREATED'
  | 'PROPOSAL_SUBMITTED'
  | 'CAPABILITY_EVALUATED'
  | 'INTENT_RECORDED'
  | 'CAPABILITY_USED'
  | 'MANDATE_REVOKED';

export interface AuditEntryView {
  index: number;
  event_kind: AuditEventKind;
  actor: string;
  mandate_id: string;
  capability_id: string;
  timestamp: string;
  prior_state: string;
  new_state: string;
  content_hash: string;
}

export type TransactionStage =
  | 'IDLE'
  | 'SIGNING'
  | 'SUBMITTED'
  | 'CONSENSUS_PENDING'
  | 'FINALIZED'
  | 'EXECUTION_SUCCESS'
  | 'READBACK_CONFIRMED'
  | 'EXECUTION_FAILED'
  | 'RECONCILIATION_REQUIRED'
  | 'TIMEOUT'
  | 'ERROR';

export interface TransactionLifecycleState {
  stage: TransactionStage;
  txHash: string | null;
  returnedId: string | null;
  message: string;
  error: string | null;
  timestamp: string;
  methodName: string;
}
