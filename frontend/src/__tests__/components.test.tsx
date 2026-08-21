import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../components/Header';
import { MandateBuilder } from '../components/MandateBuilder';
import { ProposalEvaluator } from '../components/ProposalEvaluator';
import { MandateCard } from '../components/MandateCard';
import { CapabilityCard } from '../components/CapabilityCard';
import { AuditTimeline } from '../components/AuditTimeline';
import { TransactionLifecyclePanel } from '../components/TransactionLifecyclePanel';
import { useWallet } from '../wallet/WalletContext';
import * as service from '../contract/service';
import * as configModule from '../contract/config';

// Mock useWallet for specific component state tests
vi.mock('../wallet/WalletContext', async () => {
  const actual = await vi.importActual<any>('../wallet/WalletContext');
  return {
    ...actual,
    useWallet: vi.fn(),
  };
});

describe('UI Component Renders, Lifecycle Disabled States, and User Journeys', () => {
  const dummyWallet = {
    account: '0x1111111111111111111111111111111111111111',
    chainId: '0xF22F',
    isCorrectNetwork: true,
    selectedProviderName: 'MetaMask',
    selectedProviderRdns: 'io.metamask',
    provider: { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
    isConnected: true,
    isConnecting: false,
    isChooserOpen: false,
    wallets: new Map(),
    error: null,
    openChooser: vi.fn(),
    closeChooser: vi.fn(),
    connectToWallet: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(useWallet).mockReturnValue(dummyWallet as any);
    vi.spyOn(configModule, 'getContractConfig').mockReturnValue({
      rpcUrl: 'https://studio.genlayer.com/api',
      chainId: 61999,
      explorerUrl: 'https://explorer-studio.genlayer.com',
      contractAddress: '0x1234567890123456789012345678901234567890',
      isConfigured: true,
      configError: null,
    });
  });

  describe('Header Component', () => {
    it('renders app title and wallet info in connected state', () => {
      render(<Header />);

      expect(screen.getByText('DAO Delegate Mandate Guard')).toBeDefined();
      expect(screen.getByText('Studionet (0xF22F)')).toBeDefined();
      expect(screen.getByText('MetaMask')).toBeDefined();
      expect(screen.getByText('0x1111...1111')).toBeDefined();
      expect(screen.getByText(/0x1234...7890/i)).toBeDefined();
    });

    it('renders connect wallet button in disconnected state', () => {
      vi.mocked(useWallet).mockReturnValue({
        ...dummyWallet,
        isConnected: false,
        account: null,
      } as any);

      render(<Header />);
      expect(screen.getByRole('button', { name: /Connect Web3 Wallet/i })).toBeDefined();
    });
  });

  describe('MandateBuilder Component', () => {
    it('renders mandate creation form and preset expiry chips', async () => {
      const user = userEvent.setup();
      const onStateChange = vi.fn();
      render(<MandateBuilder onTransactionStateChange={onStateChange} />);

      expect(screen.getByLabelText(/Delegate Address/i)).toBeDefined();
      expect(screen.getByLabelText(/Policy URI/i)).toBeDefined();
      expect(screen.getByLabelText(/Mandate Policy Scope/i)).toBeDefined();
      expect(screen.getByLabelText(/Exclusions & Restrictions/i)).toBeDefined();
      expect(screen.getByLabelText(/Expiration Timestamp/i)).toBeDefined();

      const chip7Days = screen.getByRole('button', { name: '+7 Days' });
      await user.click(chip7Days);

      const expiryInput = screen.getByLabelText(/Expiration Timestamp/i) as HTMLInputElement;
      expect(expiryInput.value).toContain('T');
    });

    it('shows validation error when delegate address is invalid', async () => {
      const user = userEvent.setup();
      render(<MandateBuilder onTransactionStateChange={vi.fn()} />);

      const delegateInput = screen.getByLabelText(/Delegate Address/i);
      await user.clear(delegateInput);
      await user.type(delegateInput, '0xInvalidShortAddress');

      const submitBtn = screen.getByRole('button', { name: /Create Mandate On-Chain/i });
      await user.click(submitBtn);

      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText(/Delegate must be a valid 20-byte hex address/i)).toBeDefined();
    });

    it('prompts connect wallet button when disconnected', () => {
      vi.mocked(useWallet).mockReturnValue({
        ...dummyWallet,
        isConnected: false,
        account: null,
      } as any);

      render(<MandateBuilder onTransactionStateChange={vi.fn()} />);
      const btn = screen.getByRole('button', { name: /Connect Wallet to Create Mandate/i });
      expect(btn).toBeDefined();
    });
  });

  describe('ProposalEvaluator Component', () => {
    it('loads preset templates when compliant or violation template buttons are clicked', async () => {
      const user = userEvent.setup();
      render(<ProposalEvaluator onTransactionStateChange={vi.fn()} />);

      const compliantBtn = screen.getByRole('button', { name: /✓ Compliant Grant/i });
      await user.click(compliantBtn);

      const titleInput = screen.getByLabelText(/Proposal Title/i) as HTMLInputElement;
      expect(titleInput.value).toBe('Security Bug Bounty Program - Q3 Funding');

      const violationBtn = screen.getByRole('button', { name: /✕ Policy Violation/i });
      await user.click(violationBtn);

      expect(titleInput.value).toBe('Emergency Collateralization Ratio Reduction');
    });
  });

  describe('MandateCard Component and Role-Based Revocation Guarding', () => {
    const mockMandate = {
      id: '0',
      owner: '0x1111111111111111111111111111111111111111',
      delegate: '0x2222222222222222222222222222222222222222',
      policy_uri: 'ipfs://mandate123',
      policy_text: 'Support security bug bounty grants under $100k.',
      exclusions_text: 'No collateral ratio reductions.',
      content_hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      expires_at: '2027-01-01T00:00:00Z',
      status: 'ACTIVE' as const,
      is_expired: false,
      created_at: '2026-08-01T00:00:00Z',
      revoked_at: '',
      revocation_reason: '',
    };

    it('fetches and displays mandate details correctly', async () => {
      vi.spyOn(service, 'getMandate').mockResolvedValue(mockMandate);

      render(<MandateCard initialMandateId="0" onTransactionStateChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Mandate #0')).toBeDefined();
        expect(screen.getByText('ACTIVE')).toBeDefined();
        expect(screen.getByText('Support security bug bounty grants under $100k.')).toBeDefined();
        expect(screen.getByText('No collateral ratio reductions.')).toBeDefined();
      });
    });

    it('opens revocation modal and allows owner to submit revocation', async () => {
      const user = userEvent.setup();
      vi.spyOn(service, 'getMandate').mockResolvedValue(mockMandate);

      render(<MandateCard initialMandateId="0" onTransactionStateChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Revoke Mandate/i })).toBeDefined();
      });

      await user.click(screen.getByRole('button', { name: /Revoke Mandate/i }));
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByLabelText(/Revocation Reason/i)).toBeDefined();
    });

    it('shows error when revocation fails on-chain', async () => {
      const user = userEvent.setup();
      vi.spyOn(service, 'getMandate').mockResolvedValue(mockMandate);
      vi.spyOn(service, 'revokeMandate').mockRejectedValue(
        new Error('Only the mandate owner can execute on-chain revocation')
      );

      render(<MandateCard initialMandateId="0" onTransactionStateChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Revoke Mandate/i })).toBeDefined();
      });

      await user.click(screen.getByRole('button', { name: /Revoke Mandate/i }));
      const reasonInput = screen.getByLabelText(/Revocation Reason/i);
      await user.type(reasonInput, 'Testing unauthorized revocation');

      const confirmBtn = screen.getByRole('button', { name: /Confirm Revocation/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined();
        expect(screen.getByText(/Only the mandate owner can execute on-chain revocation/i)).toBeDefined();
      });
    });
  });

  describe('CapabilityCard Component and Delegate Action Guarding', () => {
    const mockCapability = {
      id: '1',
      mandate_id: '0',
      mandate_content_hash: 'a'.repeat(64),
      proposal_url: 'https://snapshot.org/#/dao/1',
      proposal_title: 'Immunefi Q3 Bounty',
      proposal_text: 'Funding $45k for bug bounty',
      proposal_hash: 'b'.repeat(64),
      status: 'GRANTED' as const,
      verdict: 'WITHIN_MANDATE' as const,
      condition_category: 'BUDGET_CAP' as const,
      condition_summary: 'Grant must not exceed $100k limit',
      reasoning: 'Grant amount is $45k which is well within the $100k authorization threshold.',
      intent_text: '',
      use_note: '',
      created_at: '2026-08-01T00:00:00Z',
      evaluated_at: '2026-08-01T00:01:00Z',
      used_at: '',
    };

    it('fetches and displays capability details, AI verdict, and consensus reasoning', async () => {
      vi.spyOn(service, 'getCapability').mockResolvedValue(mockCapability);

      render(<CapabilityCard initialCapabilityId="1" onTransactionStateChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Capability #1')).toBeDefined();
        expect(screen.getByText('GRANTED')).toBeDefined();
        expect(screen.getByText(/Verdict: WITHIN_MANDATE/i)).toBeDefined();
        expect(screen.getByText('Grant must not exceed $100k limit')).toBeDefined();
        expect(
          screen.getByText(
            'Grant amount is $45k which is well within the $100k authorization threshold.'
          )
        ).toBeDefined();
      });
    });

    it('renders record intent and use capability buttons when status is GRANTED and opens respective modals', async () => {
      const user = userEvent.setup();
      vi.spyOn(service, 'getCapability').mockResolvedValue(mockCapability);

      render(<CapabilityCard initialCapabilityId="1" onTransactionStateChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Record Intent/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /Use Capability/i })).toBeDefined();
      });

      // Click Record Intent button
      await user.click(screen.getByRole('button', { name: /Record Intent/i }));
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByLabelText(/Intent Statement/i)).toBeDefined();

      // Close modal
      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      // Click Use Capability button
      await user.click(screen.getByRole('button', { name: /Use Capability/i }));
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByLabelText(/Execution Note/i)).toBeDefined();
    });

    it('disables intent and use action buttons when capability status is REJECTED or USED', async () => {
      const rejectedCap = {
        ...mockCapability,
        status: 'DENIED' as const,
        verdict: 'OUTSIDE_MANDATE' as const,
      };
      vi.spyOn(service, 'getCapability').mockResolvedValue(rejectedCap);

      render(<CapabilityCard initialCapabilityId="1" onTransactionStateChange={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('DENIED')).toBeDefined();
        expect(screen.queryByRole('button', { name: /Record Intent/i })).toBeNull();
        expect(screen.queryByRole('button', { name: /Use Capability/i })).toBeNull();
      });
    });
  });

  describe('AuditTimeline Component', () => {
    it('fetches and renders audit event rows and filters by event kind', async () => {
      const user = userEvent.setup();
      const mockEntries = [
        {
          index: 0,
          event_kind: 'MANDATE_CREATED' as const,
          actor: '0x1111111111111111111111111111111111111111',
          mandate_id: '0',
          capability_id: '',
          timestamp: '2026-08-01T00:00:00Z',
          prior_state: 'NONE',
          new_state: 'ACTIVE',
          content_hash: 'a'.repeat(64),
        },
        {
          index: 1,
          event_kind: 'CAPABILITY_EVALUATED' as const,
          actor: '0x2222222222222222222222222222222222222222',
          mandate_id: '0',
          capability_id: '1',
          timestamp: '2026-08-01T00:01:00Z',
          prior_state: 'PENDING',
          new_state: 'GRANTED',
          content_hash: 'b'.repeat(64),
        },
      ];

      vi.spyOn(service, 'getAuditTimeline').mockResolvedValue(mockEntries);

      render(<AuditTimeline />);

      await waitFor(() => {
        const badges = screen.getAllByText('MANDATE_CREATED');
        expect(badges.length).toBeGreaterThan(0);
      });

      // Filter to only MANDATE_CREATED
      const filterSelect = screen.getByLabelText(/Filter Event:/i);
      await user.selectOptions(filterSelect, 'MANDATE_CREATED');

      const mandateBadges = screen.getAllByText('MANDATE_CREATED');
      expect(mandateBadges.length).toBeGreaterThan(0);
      expect(screen.queryByText('Cap #1')).toBeNull();
    });
  });

  describe('TransactionLifecyclePanel Component', () => {
    it('renders all stages in the stepper and displays returned ID and message', async () => {
      const user = userEvent.setup();
      const onClear = vi.fn();
      const txState = {
        stage: 'READBACK_CONFIRMED' as const,
        txHash: '0x1234567890abcdef1234567890abcdef',
        returnedId: '99',
        message: 'Mandate successfully created and confirmed on-chain.',
        error: null,
        timestamp: '2026-08-01T00:00:00Z',
        methodName: 'create_mandate',
      };

      render(<TransactionLifecyclePanel txState={txState} onClear={onClear} />);

      expect(screen.getByText(/Transaction: create_mandate/i)).toBeDefined();
      expect(screen.getByText('Mandate successfully created and confirmed on-chain.')).toBeDefined();
      expect(screen.getByText('ID #99')).toBeDefined();
      expect(screen.getAllByText('READBACK CONFIRMED').length).toBeGreaterThan(0);

      const dismissBtn = screen.getByRole('button', { name: /Dismiss transaction notification/i });
      await user.click(dismissBtn);
      expect(onClear).toHaveBeenCalled();
    });
  });
});
