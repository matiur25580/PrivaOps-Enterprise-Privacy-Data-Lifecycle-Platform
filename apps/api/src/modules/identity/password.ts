import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

const passwordHashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// Keep unknown/inactive-account login attempts close to the cost of a real
// Argon2id verification so account existence is harder to infer from timing.
const dummyPasswordHash = argon2.hash(randomBytes(32).toString('hex'), passwordHashOptions);

export async function verifyPassword(
  storedHash: string | undefined,
  candidate: string,
): Promise<boolean> {
  const hash = storedHash ?? await dummyPasswordHash;
  const matches = await argon2.verify(hash, candidate).catch(() => false);
  return Boolean(storedHash) && matches;
}
