import { describe, expect, it } from 'vitest';
import { createEmailActionToken, hashEmailActionToken } from './email-token.js';

describe('email action tokens', () => {
  it('generates high-entropy URL-safe tokens and stores a one-way hash', () => {
    const first = createEmailActionToken();
    const second = createEmailActionToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toBe(first.token);
    expect(first.token).not.toBe(second.token);
  });

  it('hashes the same token deterministically', () => {
    const { token, tokenHash } = createEmailActionToken();
    expect(hashEmailActionToken(token)).toBe(tokenHash);
  });
});
