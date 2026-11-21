import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../env.js';

const secret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);

export async function createAccessToken(input: { userId: string; organizationId: string }) {
  return new SignJWT({ organizationId: input.organizationId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.userId)
    .setIssuer('privaops-api')
    .setAudience('privaops-web')
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export function createRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
export async function createMfaChallengeToken(input: { userId: string; organizationId: string; tokenId: string }) {
  return new SignJWT({ organizationId: input.organizationId, purpose: 'mfa-challenge', jti: input.tokenId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(input.userId)
    .setIssuer('privaops-api')
    .setAudience('privaops-mfa')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
}

export async function verifyMfaChallengeToken(token: string) {
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'privaops-api', audience: 'privaops-mfa', algorithms: ['HS256'],
  });
  if (payload.purpose !== 'mfa-challenge' || !payload.sub || typeof payload.organizationId !== 'string' || typeof payload.jti !== 'string') {
    throw new Error('Invalid MFA challenge');
  }
  return { userId: payload.sub, organizationId: payload.organizationId, tokenId: payload.jti };
}
