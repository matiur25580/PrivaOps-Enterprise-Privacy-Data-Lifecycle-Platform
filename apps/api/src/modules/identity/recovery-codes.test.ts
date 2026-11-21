import { describe, expect, it } from 'vitest';
import { generateRecoveryCodes, hashRecoveryCode, RECOVERY_CODE_COUNT } from './recovery-codes.js';

describe('MFA recovery codes', () => {
  it('generates ten unique 128-bit hexadecimal codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(/^[A-F0-9]{32}$/);
  });

  it('hashes case-insensitively without storing the plaintext value', () => {
    const code = generateRecoveryCodes()[0]!;
    expect(hashRecoveryCode(code)).toBe(hashRecoveryCode(code.toLowerCase()));
    expect(hashRecoveryCode(code)).not.toBe(code);
  });

  it('rejects malformed recovery codes', () => {
    expect(() => hashRecoveryCode('not-a-recovery-code')).toThrow('Invalid recovery code format');
  });
});
