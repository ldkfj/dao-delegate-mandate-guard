import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as service from '../contract/service';
import * as clientModule from '../contract/client';
import * as configModule from '../contract/config';
import type { EIP1193Provider } from '../wallet/types';
import type { TransactionLifecycleState } from '../contract/types';

describe('Contract Service & Transaction Classifier Matrix', () => {
  const dummyContractAddress = '0x1234567890123456789012345678901234567890';
  const dummyAccount = '0x9999999999999999999999999999999999999999';

  beforeEach(() => {
    vi.spyOn(configModule, 'getContractConfig').mockReturnValue({
      rpcUrl: 'https://studio.genlayer.com/api',
      chainId: 61999,
      explorerUrl: 'https://explorer-studio.genlayer.com',
      contractAddress: dummyContractAddress,
      isConfigured: true,
      configError: null,
    });
  });

  describe('Contract Address Guarding', () => {
    it('blocks reads and writes when contract address is missing or invalid', async () => {
      vi.spyOn(configModule, 'getContractConfig').mockReturnValue({
        rpcUrl: 'https://studio.genlayer.com/api',
        chainId: 61999,
        explorerUrl: 'https://explorer-studio.genlayer.com',
        contractAddress: '',
        isConfigured: false,
        configError: 'VITE_CONTRACT_ADDRESS is not set',
      });

      const dummyProvider: EIP1193Provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };

      await expect(service.getMandate(0)).rejects.toThrow('VITE_CONTRACT_ADDRESS is not set');
      await expect(service.getCapability(0)).rejects.toThrow('VITE_CONTRACT_ADDRESS is not set');
      await expect(service.getAuditTimeline()).rejects.toThrow('VITE_CONTRACT_ADDRESS is not set');
      await expect(
        service.createMandate(
          {
            delegate: '0x2222222222222222222222222222222222222222',
            policyUri: 'ipfs://uri',
            policyText: 'Policy',
            exclusionsText: 'Exclusions',
            expiresAt: '2027-01-01T00:00:00Z',
          },
          dummyProvider,
          dummyAccount,
          vi.fn()
        )
      ).rejects.toThrow('VITE_CONTRACT_ADDRESS is not set');
    });
  });

  describe('Transaction Status Classifier (Fail-Closed Terminal Classification)', () => {
    it('classifies all pending consensus stages strictly as PENDING, never as FINALIZED', () => {
      const pendingStatuses = [
        '0', 'UNINITIALIZED',
        '1', 'PENDING',
        '2', 'PROPOSING',
        '3', 'COMMITTING',
        '4', 'REVEALING',
        '5', 'ACCEPTED', 5,
        '9', 'APPEAL_REVEALING',
        '10', 'APPEAL_COMMITTING',
        '11', 'READY_TO_FINALIZE',
      ];

      for (const st of pendingStatuses) {
        const res = service.classifyTransactionStatus({ status: st });
        expect(res.kind).toBe('PENDING');
      }
    });

    it('classifies status 7 and FINALIZED as FINALIZED', () => {
      expect(service.classifyTransactionStatus({ status: '7' }).kind).toBe('FINALIZED');
      expect(service.classifyTransactionStatus({ status: 'FINALIZED' }).kind).toBe('FINALIZED');
      expect(service.classifyTransactionStatus({ statusName: 'FINALIZED' }).kind).toBe('FINALIZED');
    });

    it('classifies terminal failure states (UNDETERMINED, CANCELED, TIMEOUTs) as TERMINAL_FAILURE', () => {
      const terminalStatuses = [
        { raw: '6', expected: 'UNDETERMINED' },
        { raw: 'UNDETERMINED', expected: 'UNDETERMINED' },
        { raw: '8', expected: 'CANCELED' },
        { raw: 'CANCELED', expected: 'CANCELED' },
        { raw: 'CANCELLED', expected: 'CANCELED' },
        { raw: '12', expected: 'VALIDATORS_TIMEOUT' },
        { raw: 'VALIDATORS_TIMEOUT', expected: 'VALIDATORS_TIMEOUT' },
        { raw: '13', expected: 'LEADER_TIMEOUT' },
        { raw: 'LEADER_TIMEOUT', expected: 'LEADER_TIMEOUT' },
      ];

      for (const item of terminalStatuses) {
        const res = service.classifyTransactionStatus({ status: item.raw });
        expect(res.kind).toBe('TERMINAL_FAILURE');
        if (res.kind === 'TERMINAL_FAILURE') {
          expect(res.statusName).toBe(item.expected);
        }
      }
    });

    it('classifies unrecognized or null transaction receipts as MALFORMED', () => {
      expect(service.classifyTransactionStatus(null).kind).toBe('MALFORMED');
      expect(service.classifyTransactionStatus({}).kind).toBe('MALFORMED');
      expect(service.classifyTransactionStatus({ status: 'WEIRD_UNKNOWN_STATE' }).kind).toBe('MALFORMED');
    });
  });

  describe('Execution Result Classifier', () => {
    it('classifies leader receipt with error as EXECUTION_FAILURE', () => {
      const tx = {
        consensus_data: {
          leader_receipt: [{ error: 'Mandate is already expired' }],
        },
      };
      const res = service.classifyExecutionResult(tx);
      expect(res.kind).toBe('EXECUTION_FAILURE');
      if (res.kind === 'EXECUTION_FAILURE') {
        expect(res.error).toBe('Mandate is already expired');
      }
    });

    it('classifies leader receipt with FINISHED_WITH_ERROR as EXECUTION_FAILURE', () => {
      const tx = {
        consensus_data: {
          leader_receipt: [{ execution_result: 'FINISHED_WITH_ERROR' }],
        },
      };
      const res = service.classifyExecutionResult(tx);
      expect(res.kind).toBe('EXECUTION_FAILURE');
    });

    it('classifies leader receipt with DISAGREE vote as EXECUTION_FAILURE', () => {
      const tx = {
        consensus_data: {
          leader_receipt: [{ vote: 'DISAGREE' }],
        },
      };
      const res = service.classifyExecutionResult(tx);
      expect(res.kind).toBe('EXECUTION_FAILURE');
      if (res.kind === 'EXECUTION_FAILURE') {
        expect(res.error).toContain('DISAGREE');
      }
    });

    it('classifies top-level FINISHED_WITH_ERROR as EXECUTION_FAILURE', () => {
      const tx = {
        txExecutionResultName: 'FINISHED_WITH_ERROR',
        txExecutionResult: 2,
      };
      const res = service.classifyExecutionResult(tx);
      expect(res.kind).toBe('EXECUTION_FAILURE');
    });

    it('classifies missing or unknown execution result as MALFORMED_EXECUTION (fail-closed)', () => {
      const tx = {
        status: 'FINALIZED',
      };
      const res = service.classifyExecutionResult(tx);
      expect(res.kind).toBe('MALFORMED_EXECUTION');
    });

    it('classifies explicit FINISHED_WITH_RETURN or leader success as SUCCESS and extracts returnedId', () => {
      const tx = {
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
        txExecutionResult: 1,
        returnValue: '10',
      };
      const res = service.classifyExecutionResult(tx);
      expect(res.kind).toBe('SUCCESS');
      if (res.kind === 'SUCCESS') {
        expect(res.returnedId).toBe('10');
      }
    });
  });

  describe('Exact Argument Order and Shape for All 6 Write Operations', () => {
    const dummyProvider: EIP1193Provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };

    it('verifies exact argument order for create_mandate', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxcreate');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxcreate',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
        returnValue: '0',
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);
      vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
        readContract: vi.fn().mockResolvedValue({
          id: '0',
          owner: dummyAccount,
          delegate: '0x2222222222222222222222222222222222222222',
          policy_uri: 'ipfs://uri',
          policy_text: 'Policy',
          exclusions_text: 'Exclusions',
          content_hash: 'a'.repeat(64),
          expires_at: '2027-01-01T00:00:00Z',
          status: 'ACTIVE',
          is_expired: false,
          created_at: '2026-08-01T00:00:00Z',
          revoked_at: '',
          revocation_reason: '',
        }),
      } as any);

      await service.createMandate(
        {
          delegate: '0x2222222222222222222222222222222222222222',
          policyUri: 'ipfs://uri',
          policyText: 'Policy',
          exclusionsText: 'Exclusions',
          expiresAt: '2027-01-01T00:00:00Z',
        },
        dummyProvider,
        dummyAccount,
        vi.fn()
      );

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: dummyContractAddress,
        functionName: 'create_mandate',
        args: [
          '0x2222222222222222222222222222222222222222',
          'ipfs://uri',
          'Policy',
          'Exclusions',
          '2027-01-01T00:00:00Z',
        ],
        value: 0n,
      });
    });

    it('verifies exact argument order for submit_proposal', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxsubmit');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxsubmit',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
        returnValue: '1',
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);
      vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
        readContract: vi.fn().mockResolvedValue({
          id: '1',
          mandate_id: '0',
          mandate_content_hash: 'a'.repeat(64),
          proposal_url: 'https://prop.url',
          proposal_title: 'Prop Title',
          proposal_text: 'Prop Text',
          proposal_hash: 'b'.repeat(64),
          status: 'PENDING',
          verdict: '',
          condition_category: 'BUDGET_CAP',
          condition_summary: '',
          reasoning: '',
          intent_text: '',
          use_note: '',
          created_at: '2026-08-01T00:00:00Z',
          evaluated_at: '',
          used_at: '',
        }),
      } as any);

      await service.submitProposal(
        {
          mandateId: '0',
          proposalUrl: 'https://prop.url',
          proposalTitle: 'Prop Title',
          proposalText: 'Prop Text',
        },
        dummyProvider,
        dummyAccount,
        vi.fn()
      );

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: dummyContractAddress,
        functionName: 'submit_proposal',
        args: [0n, 'https://prop.url', 'Prop Title', 'Prop Text'],
        value: 0n,
      });
    });

    it('verifies exact argument order for evaluate_capability', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxeval');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxeval',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);
      vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
        readContract: vi.fn().mockResolvedValue({
          id: '1',
          mandate_id: '0',
          mandate_content_hash: 'a'.repeat(64),
          proposal_url: 'https://prop.url',
          proposal_title: 'Prop Title',
          proposal_text: 'Prop Text',
          proposal_hash: 'b'.repeat(64),
          status: 'GRANTED',
          verdict: 'WITHIN_MANDATE',
          condition_category: 'BUDGET_CAP',
          condition_summary: '',
          reasoning: 'Reasoning',
          intent_text: '',
          use_note: '',
          created_at: '2026-08-01T00:00:00Z',
          evaluated_at: '2026-08-01T00:01:00Z',
          used_at: '',
        }),
      } as any);

      await service.evaluateCapability('1', dummyProvider, dummyAccount, vi.fn());

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: dummyContractAddress,
        functionName: 'evaluate_capability',
        args: [1n],
        value: 0n,
      });
    });

    it('verifies exact argument order for record_intent', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxintent');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxintent',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);
      vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
        readContract: vi.fn().mockResolvedValue({
          id: '1',
          mandate_id: '0',
          mandate_content_hash: 'a'.repeat(64),
          proposal_url: 'https://prop.url',
          proposal_title: 'Prop Title',
          proposal_text: 'Prop Text',
          proposal_hash: 'b'.repeat(64),
          status: 'GRANTED',
          verdict: 'WITHIN_MANDATE',
          condition_category: 'BUDGET_CAP',
          condition_summary: '',
          reasoning: 'Reasoning',
          intent_text: 'Voting YES',
          use_note: '',
          created_at: '2026-08-01T00:00:00Z',
          evaluated_at: '2026-08-01T00:01:00Z',
          used_at: '',
        }),
      } as any);

      await service.recordIntent('1', 'Voting YES', dummyProvider, dummyAccount, vi.fn());

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: dummyContractAddress,
        functionName: 'record_intent',
        args: [1n, 'Voting YES'],
        value: 0n,
      });
    });

    it('verifies exact argument order for use_capability', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxuse');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxuse',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);
      vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
        readContract: vi.fn().mockResolvedValue({
          id: '1',
          mandate_id: '0',
          mandate_content_hash: 'a'.repeat(64),
          proposal_url: 'https://prop.url',
          proposal_title: 'Prop Title',
          proposal_text: 'Prop Text',
          proposal_hash: 'b'.repeat(64),
          status: 'USED',
          verdict: 'WITHIN_MANDATE',
          condition_category: 'BUDGET_CAP',
          condition_summary: '',
          reasoning: 'Reasoning',
          intent_text: 'Voting YES',
          use_note: 'Verified Snapshot governance action: proposal=0xabc; state=closed; outcome=For; scores_total=1',
          created_at: '2026-08-01T00:00:00Z',
          evaluated_at: '2026-08-01T00:01:00Z',
          used_at: '2026-08-01T00:02:00Z',
        }),
      } as any);

      await service.useCapability('1', dummyProvider, dummyAccount, vi.fn());

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: dummyContractAddress,
        functionName: 'use_capability',
        args: [1n],
        value: 0n,
      });
    });

    it('verifies exact argument order for revoke_mandate', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxrevoke');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxrevoke',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);
      vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
        readContract: vi.fn().mockResolvedValue({
          id: '0',
          owner: dummyAccount,
          delegate: '0x2222222222222222222222222222222222222222',
          policy_uri: 'ipfs://uri',
          policy_text: 'Policy',
          exclusions_text: 'Exclusions',
          content_hash: 'a'.repeat(64),
          expires_at: '2027-01-01T00:00:00Z',
          status: 'REVOKED',
          is_expired: false,
          created_at: '2026-08-01T00:00:00Z',
          revoked_at: '2026-08-01T00:05:00Z',
          revocation_reason: 'Revoked by owner',
        }),
      } as any);

      await service.revokeMandate('0', 'Revoked by owner', dummyProvider, dummyAccount, vi.fn());

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: dummyContractAddress,
        functionName: 'revoke_mandate',
        args: [0n, 'Revoked by owner'],
        value: 0n,
      });
    });
  });

  describe('Counter-concurrency and Return ID Extraction', () => {
    const dummyProvider: EIP1193Provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };

    it('exact create return ID wins and is preserved even when counter is higher (concurrency fixture)', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxconcur');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxconcur',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
        returnValue: '3', // Receipt specifically says ID 3 was created
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);

      // Readback returns mandate #3 correctly
      vi.spyOn(clientModule, 'getReadClient').mockReturnValue({
        readContract: vi.fn(async ({ args }) => {
          if (args[0] === 3n) {
            return {
              id: '3',
              owner: dummyAccount,
              delegate: '0x2222222222222222222222222222222222222222',
              policy_uri: 'ipfs://uri',
              policy_text: 'Policy',
              exclusions_text: 'Exclusions',
              content_hash: 'a'.repeat(64),
              expires_at: '2027-01-01T00:00:00Z',
              status: 'ACTIVE',
              is_expired: false,
              created_at: '2026-08-01T00:00:00Z',
              revoked_at: '',
              revocation_reason: '',
            };
          }
          throw new Error('Not found');
        }),
      } as any);

      const res = await service.createMandate(
        {
          delegate: '0x2222222222222222222222222222222222222222',
          policyUri: 'ipfs://uri',
          policyText: 'Policy',
          exclusionsText: 'Exclusions',
          expiresAt: '2027-01-01T00:00:00Z',
        },
        dummyProvider,
        dummyAccount,
        vi.fn()
      );

      expect(res.mandateId).toBe('3');
      expect(res.txHash).toBe('0xtxconcur');
    });

    it('malformed/missing return ID yields RECONCILIATION_REQUIRED, retains hash, and never resubmits', async () => {
      const mockWriteContract = vi.fn().mockResolvedValue('0xtxmissingid');
      const mockWaitForTx = vi.fn().mockResolvedValue({
        hash: '0xtxmissingid',
        status: 'FINALIZED',
        txExecutionResultName: 'FINISHED_WITH_RETURN',
        // Missing returnValue, leader_receipt, and return_data
      });
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: mockWriteContract,
        waitForTransactionReceipt: mockWaitForTx,
      } as any);

      const stages: TransactionLifecycleState[] = [];
      await expect(
        service.createMandate(
          {
            delegate: '0x2222222222222222222222222222222222222222',
            policyUri: 'ipfs://uri',
            policyText: 'Policy',
            exclusionsText: 'Exclusions',
            expiresAt: '2027-01-01T00:00:00Z',
          },
          dummyProvider,
          dummyAccount,
          (s) => stages.push(s)
        )
      ).rejects.toThrow('RECONCILIATION_REQUIRED');

      const reconcilState = stages.find((s) => s.stage === 'RECONCILIATION_REQUIRED');
      expect(reconcilState).toBeDefined();
      expect(reconcilState?.txHash).toBe('0xtxmissingid');

      // writeContract was called only ONCE (never resubmitted!)
      expect(mockWriteContract).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lifecycle integration failures', () => {
    const provider: EIP1193Provider = { request: vi.fn() };

    function mockWriter(responses: unknown[]) {
      const waitForTransactionReceipt = vi.fn();
      for (const response of responses) {
        if (response instanceof Error) waitForTransactionReceipt.mockRejectedValueOnce(response);
        else waitForTransactionReceipt.mockResolvedValueOnce(response);
      }
      vi.spyOn(clientModule, 'getWriteClient').mockReturnValue({
        writeContract: vi.fn().mockResolvedValue('0xlifecycle'),
        waitForTransactionReceipt,
      } as any);
      return waitForTransactionReceipt;
    }

    it('keeps ACCEPTED pending until explicit finalized execution success', async () => {
      const wait = mockWriter([
        { status: 'ACCEPTED' },
        { status: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN' },
      ]);
      const stages: string[] = [];

      await service.executeTransactionWithLifecycle(
        'test', provider, dummyAccount, 'test', [],
        { pollIntervalMs: 0, timeoutMs: 100, onStageChange: (state) => stages.push(state.stage) }
      );

      expect(wait).toHaveBeenCalledTimes(2);
      expect(stages).toContain('FINALIZED');
      expect(stages.at(-1)).toBe('READBACK_CONFIRMED');
    });

    it.each(['UNDETERMINED', 'CANCELED', 'CANCELLED'])(
      'surfaces terminal status %s immediately',
      async (status) => {
        const wait = mockWriter([{ status }]);
        await expect(
          service.executeTransactionWithLifecycle('test', provider, dummyAccount, 'test', [], {
            pollIntervalMs: 0,
            timeoutMs: 100,
          })
        ).rejects.toThrow('terminal failure');
        expect(wait).toHaveBeenCalledTimes(1);
      }
    );

    it('fails closed when finalized execution evidence is missing', async () => {
      mockWriter([{ status: 'FINALIZED' }]);
      await expect(
        service.executeTransactionWithLifecycle('test', provider, dummyAccount, 'test', [], {
          pollIntervalMs: 0,
          timeoutMs: 100,
        })
      ).rejects.toThrow('EXECUTION_FAILED');
    });

    it('retries a transient RPC error within the same deadline', async () => {
      const wait = mockWriter([
        new Error('temporary RPC outage'),
        { status: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN' },
      ]);
      await service.executeTransactionWithLifecycle('test', provider, dummyAccount, 'test', [], {
        pollIntervalMs: 0,
        timeoutMs: 100,
      });
      expect(wait).toHaveBeenCalledTimes(2);
    });

    it('times out without converting pending state into success', async () => {
      mockWriter([{ status: 'PENDING' }]);
      await expect(
        service.executeTransactionWithLifecycle('test', provider, dummyAccount, 'test', [], {
          pollIntervalMs: 0,
          timeoutMs: 1,
        })
      ).rejects.toThrow('did not finalize');
    });

    it('preserves the hash and emits reconciliation when readback mismatches', async () => {
      mockWriter([{ status: 'FINALIZED', txExecutionResultName: 'FINISHED_WITH_RETURN' }]);
      const states: TransactionLifecycleState[] = [];
      await expect(
        service.executeTransactionWithLifecycle('test', provider, dummyAccount, 'test', [], {
          pollIntervalMs: 0,
          timeoutMs: 100,
          onStageChange: (state) => states.push(state),
          readbackFn: async () => { throw new Error('state mismatch'); },
        })
      ).rejects.toThrow('RECONCILIATION_REQUIRED');
      const reconciliation = states.find((state) => state.stage === 'RECONCILIATION_REQUIRED');
      expect(reconciliation?.txHash).toBe('0xlifecycle');
    });
  });
});
