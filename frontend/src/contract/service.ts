import type { EIP1193Provider } from '../wallet/types';
import { getContractConfig } from './config';
import { getReadClient, getWriteClient } from './client';
import {
  formatErrorMessage,
  parseCanonicalMandate,
  parseCanonicalCapability,
  parseCanonicalAuditEntry,
  parseReturnedIdFromTransaction,
} from './parser';
import type {
  MandateView,
  CapabilityView,
  AuditEntryView,
  TransactionStage,
  TransactionLifecycleState,
} from './types';

export type StageCallback = (state: TransactionLifecycleState) => void;

export interface LifecycleOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onStageChange?: StageCallback;
  readbackFn?: (tx: any, returnedId: string | null) => Promise<void>;
}

function requireConfiguredContract(): string {
  const config = getContractConfig();
  if (!config.isConfigured || !config.contractAddress) {
    throw new Error(
      config.configError ||
        'VITE_CONTRACT_ADDRESS is not set. A deployed Studionet contract address is required for live operations.'
    );
  }
  return config.contractAddress;
}

// ---------------------------------------------------------------------------
// Pure Terminal Classifier Grounded in genlayer-js@1.1.8 Runtime Shapes
// ---------------------------------------------------------------------------

export type TransactionClassification =
  | { kind: 'PENDING'; statusName: string; message: string }
  | { kind: 'FINALIZED'; statusName: string; tx: any }
  | { kind: 'TERMINAL_FAILURE'; statusName: string; error: string }
  | { kind: 'MALFORMED'; error: string };

export function classifyTransactionStatus(tx: unknown): TransactionClassification {
  if (!tx || typeof tx !== 'object') {
    return { kind: 'MALFORMED', error: 'Transaction receipt payload is missing or not an object' };
  }

  const txObj = tx as Record<string, any>;
  const rawStatus = txObj.statusName ?? txObj.status;

  if (rawStatus === undefined || rawStatus === null) {
    return { kind: 'MALFORMED', error: 'Transaction status field is missing' };
  }

  const statusStr = String(rawStatus).trim().toUpperCase();

  // Known PENDING / consensus states (genlayer-js TransactionStatus)
  // Note: ACCEPTED (5 / "ACCEPTED") is intermediate consensus acceptance, NOT finality!
  const pendingStates: Record<string, string> = {
    '0': 'UNINITIALIZED',
    UNINITIALIZED: 'UNINITIALIZED',
    '1': 'PENDING',
    PENDING: 'PENDING',
    '2': 'PROPOSING',
    PROPOSING: 'PROPOSING',
    '3': 'COMMITTING',
    COMMITTING: 'COMMITTING',
    '4': 'REVEALING',
    REVEALING: 'REVEALING',
    '5': 'ACCEPTED',
    ACCEPTED: 'ACCEPTED',
    '9': 'APPEAL_REVEALING',
    APPEAL_REVEALING: 'APPEAL_REVEALING',
    '10': 'APPEAL_COMMITTING',
    APPEAL_COMMITTING: 'APPEAL_COMMITTING',
    '11': 'READY_TO_FINALIZE',
    READY_TO_FINALIZE: 'READY_TO_FINALIZE',
  };

  if (statusStr in pendingStates) {
    const canonicalName = pendingStates[statusStr];
    return {
      kind: 'PENDING',
      statusName: canonicalName,
      message: `Transaction is in consensus stage: ${canonicalName}`,
    };
  }

  // Known FINALIZED state (7 / "FINALIZED")
  if (statusStr === '7' || statusStr === 'FINALIZED') {
    return {
      kind: 'FINALIZED',
      statusName: 'FINALIZED',
      tx: txObj,
    };
  }

  // Known TERMINAL FAILURE states
  const terminalFailureStates: Record<string, string> = {
    '6': 'UNDETERMINED',
    UNDETERMINED: 'UNDETERMINED',
    '8': 'CANCELED',
    CANCELED: 'CANCELED',
    CANCELLED: 'CANCELED',
    '12': 'VALIDATORS_TIMEOUT',
    VALIDATORS_TIMEOUT: 'VALIDATORS_TIMEOUT',
    '13': 'LEADER_TIMEOUT',
    LEADER_TIMEOUT: 'LEADER_TIMEOUT',
  };

  if (statusStr in terminalFailureStates) {
    const canonicalName = terminalFailureStates[statusStr];
    return {
      kind: 'TERMINAL_FAILURE',
      statusName: canonicalName,
      error: `Transaction terminated with status ${canonicalName}`,
    };
  }

  // Unknown status fails closed
  return {
    kind: 'MALFORMED',
    error: `Unrecognized or invalid transaction status: "${statusStr}"`,
  };
}

export type ExecutionClassification =
  | { kind: 'SUCCESS'; returnedId: string | null }
  | { kind: 'EXECUTION_FAILURE'; error: string }
  | { kind: 'MALFORMED_EXECUTION'; error: string };

export function classifyExecutionResult(tx: Record<string, any>): ExecutionClassification {
  if (!tx || typeof tx !== 'object') {
    return { kind: 'MALFORMED_EXECUTION', error: 'Finalized transaction data is missing' };
  }

  // 1. Inspect leader_receipt in consensus_data
  const leaderReceipts = tx.consensus_data?.leader_receipt;
  let hasExplicitLeaderSuccess = false;

  if (Array.isArray(leaderReceipts) && leaderReceipts.length > 0) {
    const leader = leaderReceipts[0];
    if (leader && typeof leader === 'object') {
      // Check explicit error string
      if (leader.error !== null && leader.error !== undefined && leader.error !== '') {
        return {
          kind: 'EXECUTION_FAILURE',
          error: String(leader.error),
        };
      }

      // Check leader execution_result
      const execResult = String(leader.execution_result || '').toUpperCase();
      if (execResult === 'FINISHED_WITH_ERROR' || execResult === '2' || execResult === 'ERROR') {
        return {
          kind: 'EXECUTION_FAILURE',
          error: leader.error ? String(leader.error) : 'Leader execution resulted in error on-chain',
        };
      }

      // Check leader vote
      const vote = String(leader.vote || '').toUpperCase();
      if (vote === 'DISAGREE' || vote === 'DETERMINISTIC_VIOLATION') {
        return {
          kind: 'EXECUTION_FAILURE',
          error: `Validator vote failure: ${vote}`,
        };
      }

      if (
        execResult === 'FINISHED_WITH_RETURN' ||
        execResult === '1' ||
        execResult === 'SUCCESS' ||
        (leader.result !== undefined && leader.result !== null && leader.result !== '')
      ) {
        hasExplicitLeaderSuccess = true;
      }
    }
  }

  // 2. Inspect top-level execution result fields
  const topResultName = String(tx.txExecutionResultName || '').toUpperCase();
  const topResultNum = tx.txExecutionResult;

  if (topResultName === 'FINISHED_WITH_ERROR' || topResultNum === 2) {
    return {
      kind: 'EXECUTION_FAILURE',
      error: 'Transaction execution resulted in error on-chain',
    };
  }

  const hasTopSuccess = topResultName === 'FINISHED_WITH_RETURN' || topResultNum === 1;

  if (hasExplicitLeaderSuccess || hasTopSuccess) {
    let returnedId: string | null = null;
    try {
      returnedId = parseReturnedIdFromTransaction(tx);
    } catch {
      // Non-return ID transactions keep returnedId as null
    }
    return {
      kind: 'SUCCESS',
      returnedId,
    };
  }

  // Fail closed: neither leader receipt nor top-level execution fields established explicit success
  return {
    kind: 'MALFORMED_EXECUTION',
    error: 'Finalized transaction is missing an explicitly recognized successful execution result',
  };
}

// ---------------------------------------------------------------------------
// Read Operations (6 Views)
// ---------------------------------------------------------------------------

export async function getMandate(mandateId: string | number | bigint): Promise<MandateView> {
  const contractAddress = requireConfiguredContract();
  const client = getReadClient();

  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_mandate',
    args: [BigInt(mandateId)],
  });

  return parseCanonicalMandate(raw);
}

export async function getCapability(capabilityId: string | number | bigint): Promise<CapabilityView> {
  const contractAddress = requireConfiguredContract();
  const client = getReadClient();

  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_capability',
    args: [BigInt(capabilityId)],
  });

  return parseCanonicalCapability(raw);
}

export async function getAuditCount(): Promise<bigint> {
  const contractAddress = requireConfiguredContract();
  const client = getReadClient();

  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_audit_count',
    args: [],
  });

  return BigInt(raw as any);
}

export async function getAuditEntry(index: number | bigint): Promise<AuditEntryView> {
  const contractAddress = requireConfiguredContract();
  const client = getReadClient();

  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_audit_entry',
    args: [BigInt(index)],
  });

  return parseCanonicalAuditEntry(raw);
}

export async function getAuditTimeline(): Promise<AuditEntryView[]> {
  const count = await getAuditCount();
  const total = Number(count);
  const entries: AuditEntryView[] = [];

  for (let i = 0; i < total; i++) {
    const entry = await getAuditEntry(i);
    entries.push(entry);
  }

  return entries;
}

export async function getMandateCount(): Promise<bigint> {
  const contractAddress = requireConfiguredContract();
  const client = getReadClient();

  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_mandate_count',
    args: [],
  });

  return BigInt(raw as any);
}

export async function getCapabilityCount(): Promise<bigint> {
  const contractAddress = requireConfiguredContract();
  const client = getReadClient();

  const raw = await client.readContract({
    address: contractAddress as any,
    functionName: 'get_capability_count',
    args: [],
  });

  return BigInt(raw as any);
}

// ---------------------------------------------------------------------------
// Transaction Execution & Lifecycle Pipeline with Unified Single Deadline
// ---------------------------------------------------------------------------

export async function executeTransactionWithLifecycle(
  methodName: string,
  provider: EIP1193Provider,
  accountAddress: string,
  functionName: string,
  args: any[],
  options: LifecycleOptions = {}
): Promise<{ txHash: string; returnedId: string | null }> {
  const contractAddress = requireConfiguredContract();
  const writeClient = getWriteClient(provider, accountAddress);

  const {
    timeoutMs = 90000,
    pollIntervalMs = 1500,
    onStageChange,
    readbackFn,
  } = options;

  const updateStage = (
    stage: TransactionStage,
    txHash: string | null,
    returnedId: string | null,
    message: string,
    error: string | null = null
  ) => {
    if (onStageChange) {
      onStageChange({
        stage,
        txHash,
        returnedId,
        message,
        error,
        timestamp: new Date().toISOString(),
        methodName,
      });
    }
  };

  // 1. SIGNING
  updateStage('SIGNING', null, null, `Requesting wallet signature for ${methodName}...`);

  let txHash: string;
  try {
    const res = await writeClient.writeContract({
      address: contractAddress as any,
      functionName,
      args,
      value: 0n,
    });
    txHash = typeof res === 'string' ? res : res?.hash || String(res);
    if (!txHash || txHash === 'undefined' || txHash === 'null') {
      throw new Error('Transaction submission did not return a valid transaction hash');
    }
  } catch (err: unknown) {
    const errorMsg = formatErrorMessage(err);
    updateStage('ERROR', null, null, `Signing failed: ${errorMsg}`, errorMsg);
    throw new Error(`Signing failed: ${errorMsg}`);
  }

  // 2. SUBMITTED
  updateStage('SUBMITTED', txHash, null, `Transaction submitted to mempool: ${txHash}`);

  // 3. CONSENSUS_PENDING with Single Shared Deadline
  updateStage('CONSENSUS_PENDING', txHash, null, 'Awaiting AI consensus & block inclusion...');

  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  let finalTx: any = null;
  let lastRpcError: string | null = null;

  while (Date.now() < deadline) {
    let txResponse: any = null;
    try {
      if (typeof writeClient.getTransaction === 'function') {
        txResponse = await writeClient.getTransaction({ hash: txHash as any });
      } else if (typeof writeClient.waitForTransactionReceipt === 'function') {
        txResponse = await writeClient.waitForTransactionReceipt({
          hash: txHash as any,
          interval: 500,
          retries: 0,
        });
      }
      lastRpcError = null; // Clear transient error upon successful RPC response
    } catch (rpcErr: unknown) {
      // Capture transient RPC error
      lastRpcError = formatErrorMessage(rpcErr);
      const now = Date.now();
      if (now >= deadline) {
        break;
      }
      const sleepTime = Math.min(pollIntervalMs, Math.max(0, deadline - now));
      if (sleepTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
      }
      continue;
    }

    if (txResponse) {
      const classification = classifyTransactionStatus(txResponse);

      if (classification.kind === 'PENDING') {
        updateStage(
          'CONSENSUS_PENDING',
          txHash,
          null,
          `Awaiting consensus & finality: ${classification.message}`
        );
      } else if (classification.kind === 'FINALIZED') {
        finalTx = classification.tx;
        break;
      } else if (classification.kind === 'TERMINAL_FAILURE') {
        const termMsg = `Transaction terminal failure: ${classification.error}`;
        updateStage('ERROR', txHash, null, termMsg, classification.error);
        throw new Error(termMsg);
      } else if (classification.kind === 'MALFORMED') {
        const malMsg = `Malformed transaction status: ${classification.error}`;
        updateStage('ERROR', txHash, null, malMsg, classification.error);
        throw new Error(malMsg);
      }
    }

    const now = Date.now();
    if (now >= deadline) {
      break;
    }
    const sleepTime = Math.min(pollIntervalMs, Math.max(0, deadline - now));
    if (sleepTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }

  if (!finalTx) {
    const timeoutMsg = lastRpcError
      ? `Transaction ${txHash} did not finalize within ${timeoutMs / 1000}s deadline (last RPC error: ${lastRpcError})`
      : `Transaction ${txHash} did not finalize within ${timeoutMs / 1000}s deadline.`;
    updateStage('TIMEOUT', txHash, null, timeoutMsg, timeoutMsg);
    throw new Error(timeoutMsg);
  }

  // 4. FINALIZED
  updateStage('FINALIZED', txHash, null, 'Transaction finalized on-chain. Verifying execution result...');

  // 5. Explicit Execution Classification
  const execClassification = classifyExecutionResult(finalTx);
  if (execClassification.kind === 'EXECUTION_FAILURE') {
    const execErr = execClassification.error;
    updateStage('EXECUTION_FAILED', txHash, null, `Execution failed on-chain: ${execErr}`, execErr);
    throw new Error(`EXECUTION_FAILED: ${execErr}`);
  }
  if (execClassification.kind === 'MALFORMED_EXECUTION') {
    const malErr = execClassification.error;
    updateStage('EXECUTION_FAILED', txHash, null, `Malformed execution payload: ${malErr}`, malErr);
    throw new Error(`EXECUTION_FAILED: ${malErr}`);
  }

  const returnedId = execClassification.returnedId;

  // 6. EXECUTION_SUCCESS
  updateStage(
    'EXECUTION_SUCCESS',
    txHash,
    returnedId,
    'Execution verified successfully. Performing authoritative readback...'
  );

  // 7. READBACK_CONFIRMED
  if (readbackFn) {
    try {
      await readbackFn(finalTx, returnedId);
    } catch (readbackError: unknown) {
      const rbMsg = formatErrorMessage(readbackError);
      updateStage(
        'RECONCILIATION_REQUIRED',
        txHash,
        returnedId,
        `Readback reconciliation required: ${rbMsg}`,
        rbMsg
      );
      throw new Error(`RECONCILIATION_REQUIRED: ${rbMsg}`);
    }
  }

  updateStage(
    'READBACK_CONFIRMED',
    txHash,
    returnedId,
    `Operation confirmed & verified on-chain${returnedId !== null ? ` (ID: ${returnedId})` : ''}.`
  );

  return { txHash, returnedId };
}

// ---------------------------------------------------------------------------
// 6 Public Write Operations
// ---------------------------------------------------------------------------

export async function createMandate(
  params: {
    delegate: string;
    policyUri: string;
    policyText: string;
    exclusionsText: string;
    expiresAt: string;
  },
  provider: EIP1193Provider,
  accountAddress: string,
  onStageChange?: StageCallback,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<{ txHash: string; mandateId: string }> {
  const result = await executeTransactionWithLifecycle(
    'create_mandate',
    provider,
    accountAddress,
    'create_mandate',
    [
      params.delegate.trim(),
      params.policyUri.trim(),
      params.policyText,
      params.exclusionsText,
      params.expiresAt.trim(),
    ],
    {
      ...options,
      onStageChange,
      readbackFn: async (_tx, returnedId) => {
        if (!returnedId) {
          throw new Error('Mandate ID was not decoded from create_mandate receipt');
        }
        const mandate = await getMandate(returnedId);
        if (mandate.status !== 'ACTIVE') {
          throw new Error(
            `Readback mismatch: mandate ${returnedId} status is ${mandate.status}, expected ACTIVE`
          );
        }
      },
    }
  );

  if (!result.returnedId) {
    throw new Error('RECONCILIATION_REQUIRED: mandateId was not decoded from create_mandate transaction');
  }

  return { txHash: result.txHash, mandateId: result.returnedId };
}

export async function submitProposal(
  params: {
    mandateId: string | number | bigint;
    proposalUrl: string;
    proposalTitle: string;
    proposalText: string;
  },
  provider: EIP1193Provider,
  accountAddress: string,
  onStageChange?: StageCallback,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<{ txHash: string; capabilityId: string }> {
  const result = await executeTransactionWithLifecycle(
    'submit_proposal',
    provider,
    accountAddress,
    'submit_proposal',
    [
      BigInt(params.mandateId),
      params.proposalUrl.trim(),
      params.proposalTitle.trim(),
      params.proposalText,
    ],
    {
      ...options,
      onStageChange,
      readbackFn: async (_tx, returnedId) => {
        if (!returnedId) {
          throw new Error('Capability ID was not decoded from submit_proposal receipt');
        }
        const cap = await getCapability(returnedId);
        if (cap.status !== 'PENDING') {
          throw new Error(
            `Readback mismatch: capability ${returnedId} status is ${cap.status}, expected PENDING`
          );
        }
      },
    }
  );

  if (!result.returnedId) {
    throw new Error('RECONCILIATION_REQUIRED: capabilityId was not decoded from submit_proposal transaction');
  }

  return { txHash: result.txHash, capabilityId: result.returnedId };
}

export async function evaluateCapability(
  capabilityId: string | number | bigint,
  provider: EIP1193Provider,
  accountAddress: string,
  onStageChange?: StageCallback,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<{ txHash: string }> {
  const result = await executeTransactionWithLifecycle(
    'evaluate_capability',
    provider,
    accountAddress,
    'evaluate_capability',
    [BigInt(capabilityId)],
    {
      ...options,
      onStageChange,
      readbackFn: async () => {
        const cap = await getCapability(capabilityId);
        if (cap.status !== 'GRANTED' && cap.status !== 'DENIED') {
          throw new Error(`Readback mismatch: capability status is ${cap.status}, expected GRANTED or DENIED`);
        }
      },
    }
  );

  return { txHash: result.txHash };
}

export async function recordIntent(
  capabilityId: string | number | bigint,
  intentText: string,
  provider: EIP1193Provider,
  accountAddress: string,
  onStageChange?: StageCallback,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<{ txHash: string }> {
  const trimmed = intentText.trim();
  const result = await executeTransactionWithLifecycle(
    'record_intent',
    provider,
    accountAddress,
    'record_intent',
    [BigInt(capabilityId), trimmed],
    {
      ...options,
      onStageChange,
      readbackFn: async () => {
        const cap = await getCapability(capabilityId);
        if (cap.intent_text !== trimmed) {
          throw new Error(`Readback mismatch: recorded intent does not match submitted text`);
        }
      },
    }
  );

  return { txHash: result.txHash };
}

export async function useCapability(
  capabilityId: string | number | bigint,
  provider: EIP1193Provider,
  accountAddress: string,
  onStageChange?: StageCallback,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<{ txHash: string }> {
  const result = await executeTransactionWithLifecycle(
    'use_capability',
    provider,
    accountAddress,
    'use_capability',
    [BigInt(capabilityId)],
    {
      ...options,
      onStageChange,
      readbackFn: async () => {
        const cap = await getCapability(capabilityId);
        if (cap.status !== 'USED') {
          throw new Error(`Readback mismatch: capability status is ${cap.status}, expected USED`);
        }
        if (!cap.use_note.startsWith('Verified Snapshot governance action:')) {
          throw new Error('Readback mismatch: capability lacks canonical governance proof');
        }
      },
    }
  );

  return { txHash: result.txHash };
}

export async function revokeMandate(
  mandateId: string | number | bigint,
  reason: string,
  provider: EIP1193Provider,
  accountAddress: string,
  onStageChange?: StageCallback,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<{ txHash: string }> {
  const trimmed = reason.trim();
  const result = await executeTransactionWithLifecycle(
    'revoke_mandate',
    provider,
    accountAddress,
    'revoke_mandate',
    [BigInt(mandateId), trimmed],
    {
      ...options,
      onStageChange,
      readbackFn: async () => {
        const mandate = await getMandate(mandateId);
        if (mandate.status !== 'REVOKED') {
          throw new Error(`Readback mismatch: mandate status is ${mandate.status}, expected REVOKED`);
        }
      },
    }
  );

  return { txHash: result.txHash };
}
