import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildOtpAuthUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, verifyTotp } from './totp.js';

function codeAt(secret: string, time: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

describe('TOTP MFA primitives', () => {
  beforeAll(() => { vi.stubEnv('ACCESS_TOKEN_SECRET', 'test-only-secret-with-at-least-32-characters'); });
  it('generates Base32 secrets and builds authenticator provisioning URIs', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(buildOtpAuthUri(secret, 'person@example.com')).toContain('otpauth://totp/PrivaOps%3Aperson%40example.com');
  });
  it('encrypts secrets at rest and decrypts them', () => {
    const secret = generateTotpSecret();
    expect(decryptTotpSecret(encryptTotpSecret(secret))).toBe(secret);
  });
  it('accepts valid current-window codes and rejects malformed or incorrect codes', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, codeAt(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, '12x456', now)).toBe(false);
    expect(verifyTotp(secret, '000000', now)).toBe(false);
  });
});
