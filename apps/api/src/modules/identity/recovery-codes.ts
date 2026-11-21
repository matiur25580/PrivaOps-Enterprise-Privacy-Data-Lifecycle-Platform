import { createHash, randomBytes } from 'node:crypto';

export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(16).toString('hex').toUpperCase());
}

export function hashRecoveryCode(code: string): string {
  if (!/^[a-f0-9]{32}$/i.test(code)) throw new Error('Invalid recovery code format');
  return createHash('sha256').update(code.toLowerCase()).digest('hex');
}
