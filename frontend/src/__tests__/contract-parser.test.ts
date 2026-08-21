import { describe, it, expect } from 'vitest';
import {
  parseCanonicalMandate,
  parseCanonicalCapability,
  parseCanonicalAuditEntry,
  parseReturnedIdFromTransaction,
  formatErrorMessage,
} from '../contract/parser';
import { validateContractAddress } from '../contract/config';

describe('Contract Parser & Configuration Validation', () => {
  describe('validateContractAddress', () => {
    it('accepts valid 20-byte 0x hex addresses', () => {
      const addr = '0x1234567890123456789012345678901234567890';
      const res = validateContractAddress(addr);
      expect(res.isValid).toBe(true);
      expect(res.address).toBe(addr);
      expect(res.error).toBeNull();
    });

    it('accepts uppercase and mixed-case 20-byte hex addresses', () => {
      const addr = '0xAbCdEf1234567890123456789012345678901234';
      const res = validateContractAddress(addr);
      expect(res.isValid).toBe(true);
      expect(res.address).toBe(addr);
    });

    it('rejects missing, empty, non-hex, and invalid length addresses', () => {
      expect(validateContractAddress('0x123').isValid).toBe(false);
      expect(validateContractAddress('0xZZZZ567890123456789012345678901234567890').isValid).toBe(false);
      expect(validateContractAddress('').isValid).toBe(false);
      expect(validateContractAddress('   ').isValid).toBe(false);
      expect(validateContractAddress(null).isValid).toBe(false);
      expect(validateContractAddress(undefined).isValid).toBe(false);
    });
  });

  describe('parseCanonicalMandate', () => {
    const validMandateObj = {
      id: '0',
      owner: '0x1111111111111111111111111111111111111111',
      delegate: '0x2222222222222222222222222222222222222222',
      policy_uri: 'ipfs://mandate123',
      policy_text: 'Support security bug bounty grants under $100k.',
      exclusions_text: 'No collateral ratio reductions.',
      content_hash: 'a'.repeat(64),
      expires_at: '2027-01-01T00:00:00Z',
      status: 'ACTIVE',
      is_expired: false,
      created_at: '2026-08-01T00:00:00Z',
      revoked_at: '',
      revocation_reason: '',
    };

    it('parses valid mandate object correctly', () => {
      const parsed = parseCanonicalMandate(validMandateObj);
      expect(parsed.id).toBe('0');
      expect(parsed.status).toBe('ACTIVE');
      expect(parsed.delegate).toBe(validMandateObj.delegate);
      expect(parsed.is_expired).toBe(false);
    });

    it('parses valid mandate JSON string correctly', () => {
      const jsonStr = JSON.stringify(validMandateObj);
      const parsed = parseCanonicalMandate(jsonStr);
      expect(parsed.id).toBe('0');
      expect(parsed.policy_text).toBe(validMandateObj.policy_text);
    });

    it('parses mandate JSON string with large 18-digit ID without precision loss', () => {
      const largeIdJson = JSON.stringify({
        ...validMandateObj,
        id: 9007199254740993123456n.toString(), // Beyond JS MAX_SAFE_INTEGER
      });
      const parsed = parseCanonicalMandate(largeIdJson);
      expect(typeof parsed.id).toBe('string');
      expect(parsed.id).toBe('9007199254740993123456');
    });

    it('rejects mandate missing required keys', () => {
      const incomplete = { ...validMandateObj };
      delete (incomplete as any).content_hash;
      expect(() => parseCanonicalMandate(incomplete)).toThrow('missing key "content_hash"');
    });

    it('rejects invalid mandate status', () => {
      const invalid = { ...validMandateObj, status: 'UNKNOWN_STATUS' };
      expect(() => parseCanonicalMandate(invalid)).toThrow('Invalid mandate status');
    });

    it('rejects non-object or null input', () => {
      expect(() => parseCanonicalMandate(null)).toThrow('Invalid mandate data type');
      expect(() => parseCanonicalMandate(123)).toThrow('Invalid mandate data type');
    });
  });

  describe('parseCanonicalCapability', () => {
    const validCapObj = {
      id: '42',
      mandate_id: '0',
      mandate_content_hash: 'a'.repeat(64),
      proposal_url: 'https://snapshot.org/#/dao/42',
      proposal_title: 'Bug Bounty Funding',
      proposal_text: 'Fund $50k bounty',
      proposal_hash: 'b'.repeat(64),
      status: 'GRANTED',
      verdict: 'WITHIN_MANDATE',
      condition_category: 'BUDGET_CAP',
      condition_summary: 'Amount must stay under $100k',
      reasoning: 'Grant amount is $50k which is within policy budget limit of $100k.',
      intent_text: 'Voting YES',
      use_note: 'Vote cast in block 12345',
      created_at: '2026-08-01T00:00:00Z',
      evaluated_at: '2026-08-01T00:01:00Z',
      used_at: '2026-08-01T00:02:00Z',
    };

    it('parses valid capability object correctly', () => {
      const parsed = parseCanonicalCapability(validCapObj);
      expect(parsed.id).toBe('42');
      expect(parsed.status).toBe('GRANTED');
      expect(parsed.verdict).toBe('WITHIN_MANDATE');
      expect(parsed.condition_category).toBe('BUDGET_CAP');
    });

    it('parses valid capability with CONDITIONAL verdict enum correctly', () => {
      const cap = { ...validCapObj, verdict: 'CONDITIONAL' };
      const parsed = parseCanonicalCapability(cap);
      expect(parsed.verdict).toBe('CONDITIONAL');
    });

    it('rejects capability missing required keys', () => {
      const incomplete = { ...validCapObj };
      delete (incomplete as any).reasoning;
      expect(() => parseCanonicalCapability(incomplete)).toThrow('missing key "reasoning"');
    });

    it('rejects invalid capability status', () => {
      const invalid = { ...validCapObj, status: 'INVALID_CAP_STATUS' };
      expect(() => parseCanonicalCapability(invalid)).toThrow('Invalid capability status');
    });

    it('rejects invalid capability verdict', () => {
      const invalid = { ...validCapObj, verdict: 'NOT_A_VALID_VERDICT' };
      expect(() => parseCanonicalCapability(invalid)).toThrow('Invalid capability verdict');
    });
  });

  describe('parseCanonicalAuditEntry', () => {
    const validAuditObj = {
      index: 0,
      event_kind: 'MANDATE_CREATED',
      actor: '0x1111111111111111111111111111111111111111',
      mandate_id: '0',
      capability_id: '',
      timestamp: '2026-08-01T00:00:00Z',
      prior_state: 'NONE',
      new_state: 'ACTIVE',
      content_hash: 'a'.repeat(64),
    };

    it('parses valid audit entry correctly', () => {
      const parsed = parseCanonicalAuditEntry(validAuditObj);
      expect(parsed.index).toBe(0);
      expect(parsed.event_kind).toBe('MANDATE_CREATED');
      expect(parsed.new_state).toBe('ACTIVE');
    });

    it('rejects audit entry missing required keys', () => {
      const incomplete = { ...validAuditObj };
      delete (incomplete as any).prior_state;
      expect(() => parseCanonicalAuditEntry(incomplete)).toThrow('missing key "prior_state"');
    });

    it('rejects audit entry with invalid event_kind', () => {
      const invalid = { ...validAuditObj, event_kind: 'UNKNOWN_EVENT_KIND' };
      expect(() => parseCanonicalAuditEntry(invalid)).toThrow('Invalid audit event kind');
    });
  });

  describe('parseReturnedIdFromTransaction', () => {
    it('extracts ID from direct returnValue', () => {
      const tx = { returnValue: '7' };
      expect(parseReturnedIdFromTransaction(tx)).toBe('7');
    });

    it('extracts ID from leader receipt JSON result', () => {
      const tx = {
        consensus_data: {
          leader_receipt: [{ result: '"15"' }],
        },
      };
      expect(parseReturnedIdFromTransaction(tx)).toBe('15');
    });

    it('extracts ID from leader receipt plain number result', () => {
      const tx = {
        consensus_data: {
          leader_receipt: [{ result: 23 }],
        },
      };
      expect(parseReturnedIdFromTransaction(tx)).toBe('23');
    });

    it('extracts ID from direct result field', () => {
      const tx = { result: '99' };
      expect(parseReturnedIdFromTransaction(tx)).toBe('99');
    });

    it('extracts ID from return_data array', () => {
      const tx = { return_data: ['55'] };
      expect(parseReturnedIdFromTransaction(tx)).toBe('55');
    });

    it('throws RECONCILIATION_REQUIRED when ID cannot be extracted from empty object', () => {
      expect(() => parseReturnedIdFromTransaction({})).toThrow('RECONCILIATION_REQUIRED');
    });
  });

  describe('formatErrorMessage safe formatting', () => {
    it('formats string errors safely', () => {
      expect(formatErrorMessage('Direct error message')).toBe('Direct error message');
    });

    it('formats Error objects safely', () => {
      expect(formatErrorMessage(new Error('Sample error'))).toBe('Sample error');
    });

    it('formats bigint safely without crashing JSON.stringify', () => {
      const errorWithBigInt = { code: 4001, balance: 1000000000000000000n };
      const formatted = formatErrorMessage(errorWithBigInt);
      expect(formatted).toContain('1000000000000000000');
    });
  });
});
