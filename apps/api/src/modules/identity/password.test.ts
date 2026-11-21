import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { verifyPassword } from './password.js';

describe('password verification', () => {
  it('accepts a matching stored password hash', async () => {
    const hash = await argon2.hash('correct horse battery staple', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const hash = await argon2.hash('correct horse battery staple', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await expect(verifyPassword(hash, 'incorrect password')).resolves.toBe(false);
  });

  it('performs a dummy verification and rejects an unknown account', async () => {
    await expect(verifyPassword(undefined, 'any candidate password')).resolves.toBe(false);
  });

  it('fails closed for a malformed stored hash', async () => {
    await expect(verifyPassword('not-an-argon2-hash', 'any password')).resolves.toBe(false);
  });
});
