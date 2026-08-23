import type {
  MandateView,
  CapabilityView,
  AuditEntryView,
  MandateStatus,
  CapabilityStatus,
  CapabilityVerdict,
  ConditionCategory,
  AuditEventKind,
} from './types';

export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (typeof err === 'bigint') {
    return err.toString();
  }
  if (err && typeof err === 'object') {
    try {
      return JSON.stringify(err, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export function safeJsonParse(raw: string): Record<string, unknown> {
  if (typeof raw !== 'string') {
    throw new Error('Input must be a JSON string');
  }
  // Preserve 16+ digit integer tokens without precision loss
  const safeStr = raw.replace(
    /("id"|"mandate_id"|"capability_id"|"index")\s*:\s*(\d{16,})/g,
    '$1: "$2"'
  );
  try {
    const parsed = JSON.parse(safeStr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Parsed JSON is not an object');
    }
    return parsed as Record<string, unknown>;
  } catch (err: unknown) {
    throw new Error(`Failed to parse canonical JSON: ${formatErrorMessage(err)}`);
  }
}

export function parseCanonicalMandate(raw: unknown): MandateView {
  let data: Record<string, unknown>;

  if (typeof raw === 'string') {
    data = safeJsonParse(raw);
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    data = raw as Record<string, unknown>;
  } else {
    throw new Error('Invalid mandate data type returned from contract view');
  }

  const requiredKeys = [
    'id',
    'owner',
    'delegate',
    'policy_uri',
    'policy_text',
    'exclusions_text',
    'content_hash',
    'expires_at',
    'status',
    'is_expired',
    'created_at',
    'revoked_at',
    'revocation_reason',
  ];

  for (const key of requiredKeys) {
    if (!(key in data) || data[key] === undefined) {
      throw new Error(`Malformed mandate view: missing key "${key}"`);
    }
  }

  const status = String(data.status).toUpperCase() as MandateStatus;
  if (!['ACTIVE', 'REVOKED', 'EXPIRED'].includes(status)) {
    throw new Error(`Invalid mandate status: "${data.status}"`);
  }

  const owner = String(data.owner).trim();
  const delegate = String(data.delegate).trim();
  const addressRegex = /^0x[0-9a-fA-F]{40}$/;
  if (!addressRegex.test(owner)) {
    throw new Error(`Malformed mandate owner address: "${owner}"`);
  }
  if (!addressRegex.test(delegate)) {
    throw new Error(`Malformed mandate delegate address: "${delegate}"`);
  }

  return {
    id: typeof data.id === 'bigint' ? data.id.toString() : String(data.id),
    owner,
    delegate,
    policy_uri: String(data.policy_uri),
    policy_text: String(data.policy_text),
    exclusions_text: String(data.exclusions_text),
    content_hash: String(data.content_hash),
    expires_at: String(data.expires_at),
    status,
    is_expired: Boolean(data.is_expired),
    created_at: String(data.created_at),
    revoked_at: String(data.revoked_at || ''),
    revocation_reason: String(data.revocation_reason || ''),
  };
}

export function parseCanonicalCapability(raw: unknown): CapabilityView {
  let data: Record<string, unknown>;

  if (typeof raw === 'string') {
    data = safeJsonParse(raw);
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    data = raw as Record<string, unknown>;
  } else {
    throw new Error('Invalid capability data type returned from contract view');
  }

  const requiredKeys = [
    'id',
    'mandate_id',
    'mandate_content_hash',
    'proposal_url',
    'proposal_title',
    'proposal_text',
    'proposal_hash',
    'status',
    'verdict',
    'condition_category',
    'condition_summary',
    'reasoning',
    'intent_text',
    'use_note',
    'created_at',
    'evaluated_at',
    'used_at',
  ];

  for (const key of requiredKeys) {
    if (!(key in data) || data[key] === undefined) {
      throw new Error(`Malformed capability view: missing key "${key}"`);
    }
  }

  const status = String(data.status).toUpperCase() as CapabilityStatus;
  if (!['PENDING', 'GRANTED', 'USED', 'DENIED', 'EXPIRED'].includes(status)) {
    throw new Error(`Invalid capability status: "${data.status}"`);
  }

  const verdictStr = String(data.verdict || '').toUpperCase();
  if (verdictStr !== '' && !['WITHIN_MANDATE', 'CONDITIONAL', 'OUTSIDE_MANDATE', 'AMBIGUOUS'].includes(verdictStr)) {
    throw new Error(`Invalid capability verdict: "${data.verdict}"`);
  }

  const catStr = String(data.condition_category || '').toUpperCase();
  if (catStr !== '' && !['BUDGET_CAP', 'REPORTING_REQUIRED', 'TIMELINE_CONSTRAINT', 'SCOPE_LIMITATION', 'GOVERNANCE_ALIGNMENT'].includes(catStr)) {
    throw new Error(`Invalid condition category: "${data.condition_category}"`);
  }

  return {
    id: typeof data.id === 'bigint' ? data.id.toString() : String(data.id),
    mandate_id: typeof data.mandate_id === 'bigint' ? data.mandate_id.toString() : String(data.mandate_id),
    mandate_content_hash: String(data.mandate_content_hash),
    proposal_url: String(data.proposal_url),
    proposal_title: String(data.proposal_title),
    proposal_text: String(data.proposal_text),
    proposal_hash: String(data.proposal_hash),
    status,
    verdict: verdictStr as CapabilityVerdict,
    condition_category: catStr as ConditionCategory,
    condition_summary: String(data.condition_summary || ''),
    reasoning: String(data.reasoning || ''),
    intent_text: String(data.intent_text || ''),
    use_note: String(data.use_note || ''),
    created_at: String(data.created_at),
    evaluated_at: String(data.evaluated_at || ''),
    used_at: String(data.used_at || ''),
  };
}

export function parseCanonicalAuditEntry(raw: unknown): AuditEntryView {
  let data: Record<string, unknown>;

  if (typeof raw === 'string') {
    data = safeJsonParse(raw);
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    data = raw as Record<string, unknown>;
  } else {
    throw new Error('Invalid audit entry data type returned from contract view');
  }

  const requiredKeys = [
    'index',
    'event_kind',
    'actor',
    'mandate_id',
    'capability_id',
    'timestamp',
    'prior_state',
    'new_state',
    'content_hash',
  ];

  for (const key of requiredKeys) {
    if (!(key in data) || data[key] === undefined) {
      throw new Error(`Malformed audit entry view: missing key "${key}"`);
    }
  }

  const eventKind = String(data.event_kind).toUpperCase() as AuditEventKind;
  const validEventKinds = [
    'MANDATE_CREATED',
    'MANDATE_REVOKED',
    'PROPOSAL_SUBMITTED',
    'CAPABILITY_EVALUATED',
    'INTENT_RECORDED',
    'CAPABILITY_USED',
  ];
  if (!validEventKinds.includes(eventKind)) {
    throw new Error(`Invalid audit event kind: "${data.event_kind}"`);
  }

  return {
    index: Number(data.index),
    event_kind: eventKind,
    actor: String(data.actor),
    mandate_id: typeof data.mandate_id === 'bigint' ? data.mandate_id.toString() : String(data.mandate_id),
    capability_id: typeof data.capability_id === 'bigint' ? data.capability_id.toString() : String(data.capability_id),
    timestamp: String(data.timestamp),
    prior_state: String(data.prior_state),
    new_state: String(data.new_state),
    content_hash: String(data.content_hash),
  };
}

export function parseReturnedIdFromTransaction(tx: Record<string, any>): string {
  if (!tx || typeof tx !== 'object') {
    throw new Error('RECONCILIATION_REQUIRED: Transaction data missing or invalid');
  }

  const parseId = (value: unknown): string | null => {
    if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
    }
    if (typeof value !== 'string') return null;

    let candidate = value.trim();
    if (!candidate) return null;
    try {
      const decoded = JSON.parse(candidate);
      if (typeof decoded === 'string' || typeof decoded === 'number') {
        candidate = String(decoded).trim();
      }
    } catch {
      // Plain decimal string.
    }
    return /^(0|[1-9]\d*)$/.test(candidate) ? candidate : null;
  };

  const parseExecutionReturn = (value: unknown): string | null => {
    const direct = parseId(value);
    if (direct !== null) return direct;
    if (!value || typeof value !== 'object') return null;

    const result = value as Record<string, any>;
    if (result.status && String(result.status).toLowerCase() !== 'return') return null;
    return parseId(result.payload?.readable ?? result.readable);
  };

  // 1. Direct return value if present in SDK result
  const directReturn = parseId(tx.returnValue);
  if (directReturn !== null) return directReturn;

  // 2. Check leader_receipt in consensus_data
  const leaderReceipts = tx.consensus_data?.leader_receipt;
  if (Array.isArray(leaderReceipts) && leaderReceipts.length > 0) {
    const leader = leaderReceipts[0];
    const leaderReturn = parseExecutionReturn(leader?.result);
    if (leaderReturn !== null) return leaderReturn;
  }

  // tx.result is transaction-result metadata in genlayer-js, never a contract return value.

  // 3. Check return_data
  const returnData = Array.isArray(tx.return_data) && tx.return_data.length === 1
    ? tx.return_data[0]
    : tx.return_data;
  const parsedReturnData = parseExecutionReturn(returnData);
  if (parsedReturnData !== null) return parsedReturnData;

  // 4. Check nested SDK return fields
  if (tx.data && typeof tx.data === 'object') {
    const nested = parseId(tx.data.returnValue) ?? parseExecutionReturn(tx.data.result);
    if (nested !== null) return nested;
  }

  throw new Error('RECONCILIATION_REQUIRED: Unable to extract returned ID from transaction receipt');
}
