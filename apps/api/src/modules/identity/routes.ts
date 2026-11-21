import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../env.js';
import { EmailActionToken, MfaChallenge, Membership, Organization, RefreshSession, User } from './models.js';
import { authenticate, requireOrganizationScope, requirePermission } from './middleware.js';
import { createAccessToken, createMfaChallengeToken, createRefreshToken, getRefreshCookieOptions, hashRefreshToken, verifyMfaChallengeToken } from './tokens.js';
import { verifyPassword } from './password.js';
import { buildOtpAuthUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, verifyTotp } from './totp.js';
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes.js';
import { createEmailActionToken, hashEmailActionToken, sendAccountActionEmail, type EmailActionPurpose } from './email.js';
import type { OrganizationRole } from './types.js';

export const identityRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
});

const requireTrustedOrigin: RequestHandler = (request, response, next) => {
  const origin = request.header('origin');
  if (origin !== new URL(env.WEB_ORIGIN).origin) {
    response.status(403).json({
      error: { code: 'UNTRUSTED_ORIGIN', message: 'This authentication request did not come from the configured web origin.' },
    });
    return;
  }
  next();
};

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(2).max(160),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  organizationId: z.string().optional(),
});

type SafeUser = { _id: Types.ObjectId; fullName: string; email: string };
type PopulatedMembership = {
  role: OrganizationRole;
  createdAt: Date;
  organizationId: { _id: Types.ObjectId; name: string; slug: string; status: string } | null;
};

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'workspace';
}

function safeUser(user: SafeUser) {
  return { id: user._id.toString(), fullName: user.fullName, email: user.email };
}

async function issueSession(userId: string, organizationId: string, response: Response) {
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await RefreshSession.create({ userId, organizationId, tokenHash: hashRefreshToken(refreshToken), expiresAt });
  response.cookie('privaops_refresh', refreshToken, getRefreshCookieOptions());
  const accessToken = await createAccessToken({ userId, organizationId });
  return { accessToken, tokenType: 'Bearer', expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}


async function issueEmailAction(userId: string, to: string, fullName: string, purpose: EmailActionPurpose) {
  await EmailActionToken.deleteMany({ userId, purpose });
  const generated = createEmailActionToken();
  await EmailActionToken.create({
    userId,
    purpose,
    tokenHash: generated.tokenHash,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  try {
    await sendAccountActionEmail({ to, fullName, purpose, token: generated.token });
  } catch (error) {
    await EmailActionToken.deleteOne({ tokenHash: generated.tokenHash });
    throw error;
  }
}

identityRouter.post('/auth/register', authLimiter, requireTrustedOrigin, async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please provide valid registration details.', details: parsed.error.flatten() } });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email })) {
    response.status(409).json({ error: { code: 'ACCOUNT_EXISTS', message: 'An account with this email already exists.' } });
    return;
  }

  const passwordHash = await argon2.hash(parsed.data.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  let userId: string | undefined;
  let organizationId: string | undefined;
  try {
    const user = await User.create({ fullName: parsed.data.fullName, email, passwordHash, emailVerified: false });
    userId = String(user._id);
    const organization = await Organization.create({
      name: parsed.data.organizationName,
      slug: `${slugify(parsed.data.organizationName)}-${randomUUID().slice(0, 8)}`,
    });
    organizationId = String(organization._id);
    await Membership.create({ userId, organizationId, role: 'owner', status: 'active' });
    let emailDeliveryPending = false;
    try {
      await issueEmailAction(userId, email, user.fullName, 'email_verification');
    } catch (error) {
      emailDeliveryPending = true;
      console.error('Could not send registration verification email:', error);
    }
    response.status(201).json({
      data: {
        emailVerificationRequired: true,
        emailDeliveryPending,
        email: user.email,
        message: emailDeliveryPending
          ? 'Your account is pending verification, but email delivery is temporarily unavailable. Ask an administrator to configure email or request a new link later.'
          : 'Check your inbox for a verification link. You can request another link if needed.',
      },
    });
  } catch (error) {
    if (organizationId) await Organization.deleteOne({ _id: organizationId });
    if (userId) await User.deleteOne({ _id: userId });
    throw error;
  }
});


const emailTokenSchema = z.object({ token: z.string().min(32).max(256) });
identityRouter.post('/auth/email/verify', authLimiter, requireTrustedOrigin, async (request, response) => {
  const parsed = emailTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid verification link.' } });
    return;
  }
  const action = await EmailActionToken.findOneAndDelete({
    tokenHash: hashEmailActionToken(parsed.data.token),
    purpose: 'email_verification',
    expiresAt: { $gt: new Date() },
  });
  if (!action) {
    response.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'This verification link is invalid, expired, or already used.' } });
    return;
  }
  const user = await User.findOneAndUpdate({ _id: action.userId, status: 'active' }, { $set: { emailVerified: true } }, { new: true });
  if (!user) {
    response.status(400).json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'This account is no longer available.' } });
    return;
  }
  await EmailActionToken.deleteMany({ userId: user._id, purpose: 'email_verification' });
  response.status(200).json({ data: { verified: true, message: 'Email verified. You can now sign in.' } });
});

const emailOnlySchema = z.object({ email: z.string().trim().email().max(254) });
identityRouter.post('/auth/email/verification/resend', authLimiter, requireTrustedOrigin, async (request, response) => {
  const parsed = emailOnlySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid email address.' } });
    return;
  }
  const user = await User.findOne({ email: parsed.data.email.toLowerCase(), status: 'active' }).select('fullName email emailVerified');
  if (user && user.emailVerified === false) {
    void issueEmailAction(String(user._id), user.email, user.fullName, 'email_verification')
      .catch((error: unknown) => console.error('Could not resend verification email:', error));
  }
  response.status(202).json({ data: { message: 'If this account needs verification, an email will be sent shortly.' } });
});

identityRouter.post('/auth/password/forgot', authLimiter, requireTrustedOrigin, async (request, response) => {
  const parsed = emailOnlySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid email address.' } });
    return;
  }
  const user = await User.findOne({ email: parsed.data.email.toLowerCase(), status: 'active' }).select('fullName email');
  if (user) {
    void issueEmailAction(String(user._id), user.email, user.fullName, 'password_reset')
      .catch((error: unknown) => console.error('Could not send password reset email:', error));
  }
  response.status(202).json({ data: { message: 'If an active account exists for that address, a password reset link will be sent shortly.' } });
});

const passwordResetSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
});
identityRouter.post('/auth/password/reset', authLimiter, requireTrustedOrigin, async (request, response) => {
  const parsed = passwordResetSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid reset link and a password of at least 12 characters.' } });
    return;
  }
  const action = await EmailActionToken.findOneAndDelete({
    tokenHash: hashEmailActionToken(parsed.data.token),
    purpose: 'password_reset',
    expiresAt: { $gt: new Date() },
  });
  if (!action) {
    response.status(400).json({ error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'This password reset link is invalid, expired, or already used.' } });
    return;
  }
  const passwordHash = await argon2.hash(parsed.data.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await User.findOneAndUpdate({ _id: action.userId, status: 'active' }, { $set: { passwordHash } }, { new: true });
  if (!user) {
    response.status(400).json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'This account is no longer available.' } });
    return;
  }
  await Promise.all([
    RefreshSession.deleteMany({ userId: user._id }),
    EmailActionToken.deleteMany({ userId: user._id, purpose: 'password_reset' }),
  ]);
  response.clearCookie('privaops_refresh', getRefreshCookieOptions());
  response.status(200).json({ data: { passwordReset: true, message: 'Password updated. Sign in with your new password.' } });
});

identityRouter.post('/auth/login', authLimiter, requireTrustedOrigin, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please provide valid login details.' } });
    return;
  }

  const user = await User.findOne({ email: parsed.data.email.toLowerCase(), status: 'active' })
    .select('+passwordHash +totpEnabled fullName email');
  const passwordMatches = await verifyPassword(
    user?.passwordHash as string | undefined,
    parsed.data.password,
  );

  if (!user || !passwordMatches) {
    response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    return;
  }

  if ((user as typeof user & { emailVerified?: boolean }).emailVerified === false) {
    response.status(403).json({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address before signing in.' } });
    return;
  }

  const memberships = await Membership.find({ userId: user._id, status: 'active' })
    .populate<{ organizationId: PopulatedMembership['organizationId'] }>('organizationId', 'name slug status')
    .lean<PopulatedMembership[]>();
  const eligible = memberships.filter((item) => item.organizationId?.status === 'active');
  const selected = parsed.data.organizationId
    ? eligible.find((item) => item.organizationId?._id.toString() === parsed.data.organizationId)
    : eligible[0];

  if (!selected?.organizationId) {
    response.status(403).json({ error: { code: 'NO_ACTIVE_MEMBERSHIP', message: 'No active organization membership was found.' } });
    return;
  }

  const organization = selected.organizationId;
  if ((user as typeof user & { totpEnabled?: boolean }).totpEnabled) {
    const tokenId = randomUUID();
    await MfaChallenge.create({ tokenId, userId: user._id, organizationId: organization._id, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    const challengeToken = await createMfaChallengeToken({ userId: String(user._id), organizationId: organization._id.toString(), tokenId });
    response.status(202).json({ data: { mfaRequired: true, challengeToken, expiresIn: 300 } });
    return;
  }
  const tokens = await issueSession(String(user._id), organization._id.toString(), response);
  response.status(200).json({
    data: {
      user: safeUser(user as SafeUser),
      organization: { id: organization._id.toString(), name: organization.name, slug: organization.slug, role: selected.role },
      memberships: eligible.map((item) => ({
        organization: item.organizationId
          ? { id: item.organizationId._id.toString(), name: item.organizationId.name, slug: item.organizationId.slug }
          : null,
        role: item.role,
      })),
      ...tokens,
    },
  });
});


const mfaLoginSchema = z.object({
  challengeToken: z.string().min(20).max(4096),
  code: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
}).refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode), 'Provide exactly one authenticator or recovery code.');
identityRouter.post('/auth/mfa/verify-login', authLimiter, requireTrustedOrigin, async (request, response) => {
  const parsed = mfaLoginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid six-digit authenticator code.' } });
    return;
  }
  let challenge: { userId: string; organizationId: string; tokenId: string };
  try { challenge = await verifyMfaChallengeToken(parsed.data.challengeToken); }
  catch {
    response.status(401).json({ error: { code: 'INVALID_MFA_CHALLENGE', message: 'The MFA challenge is invalid or expired.' } });
    return;
  }
  const [user, membership, organization] = await Promise.all([
    User.findOne({ _id: challenge.userId, status: 'active' }).select('+totpEnabled +totpSecretEncrypted +recoveryCodeHashes fullName email'),
    Membership.findOne({ userId: challenge.userId, organizationId: challenge.organizationId, status: 'active' }),
    Organization.findOne({ _id: challenge.organizationId, status: 'active' }),
  ]);
  if (!user || !membership || !organization || !user.totpEnabled || !user.totpSecretEncrypted) {
    response.status(401).json({ error: { code: 'MFA_ACCESS_REVOKED', message: 'The account or MFA configuration is no longer active.' } });
    return;
  }
  const recoveryHash = parsed.data.recoveryCode
    ? hashRecoveryCode(parsed.data.recoveryCode)
    : undefined;
  const valid = parsed.data.code
    ? verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.code)
    : Boolean(recoveryHash && user.recoveryCodeHashes.includes(recoveryHash));
  if (!valid) {
    response.status(401).json({ error: { code: 'INVALID_MFA_CODE', message: 'The authenticator code is incorrect or expired.' } });
    return;
  }
  const consumedChallenge = await MfaChallenge.findOneAndDelete({ tokenId: challenge.tokenId, userId: user._id, organizationId: organization._id, expiresAt: { $gt: new Date() } });
  if (!consumedChallenge) {
    response.status(401).json({ error: { code: 'MFA_CHALLENGE_USED', message: 'The MFA challenge has expired or was already used.' } });
    return;
  }
  if (recoveryHash) {
    const consumedRecovery = await User.findOneAndUpdate(
      { _id: user._id, recoveryCodeHashes: recoveryHash },
      { $pull: { recoveryCodeHashes: recoveryHash } },
    );
    if (!consumedRecovery) {
      response.status(401).json({ error: { code: 'RECOVERY_CODE_USED', message: 'This recovery code has already been used.' } });
      return;
    }
  }
  const tokens = await issueSession(String(user._id), String(organization._id), response);
  response.status(200).json({
    data: {
      user: safeUser(user as SafeUser),
      organization: { id: String(organization._id), name: organization.name, slug: organization.slug, role: membership.role },
      ...tokens,
    },
  });
});

const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
identityRouter.get('/auth/mfa/status', authenticate, async (request, response) => {
  const user = await User.findById(request.auth!.userId).select('+totpEnabled +recoveryCodeHashes').lean();
  response.status(200).json({ data: { enabled: Boolean(user?.totpEnabled), recoveryCodesRemaining: user?.recoveryCodeHashes.length ?? 0 } });
});

identityRouter.post('/auth/mfa/setup', authenticate, authLimiter, async (request, response) => {
  const user = await User.findById(request.auth!.userId).select('+totpEnabled');
  if (!user) {
    response.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'The account was not found.' } });
    return;
  }
  if (user.totpEnabled) {
    response.status(409).json({ error: { code: 'MFA_ALREADY_ENABLED', message: 'Disable MFA before starting a new enrollment.' } });
    return;
  }
  const secret = generateTotpSecret();
  user.set('totpPendingSecretEncrypted', encryptTotpSecret(secret));
  await user.save();
  response.status(200).json({
    data: {
      secret,
      otpauthUri: buildOtpAuthUri(secret, user.email),
      instructions: 'Add this account to an authenticator app, then confirm with the current six-digit code. The secret is shown only during setup.',
    },
  });
});

identityRouter.post('/auth/mfa/confirm', authenticate, authLimiter, async (request, response) => {
  const parsed = mfaCodeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid six-digit authenticator code.' } });
    return;
  }
  const user = await User.findById(request.auth!.userId).select('+totpEnabled +totpPendingSecretEncrypted +totpSecretEncrypted');
  if (!user || user.totpEnabled || !user.totpPendingSecretEncrypted) {
    response.status(409).json({ error: { code: 'MFA_SETUP_REQUIRED', message: 'Start MFA setup before confirming it.' } });
    return;
  }
  const secret = decryptTotpSecret(user.totpPendingSecretEncrypted);
  if (!verifyTotp(secret, parsed.data.code)) {
    response.status(401).json({ error: { code: 'INVALID_MFA_CODE', message: 'The authenticator code is incorrect or expired.' } });
    return;
  }
  user.set('totpSecretEncrypted', user.totpPendingSecretEncrypted);
  user.set('totpPendingSecretEncrypted', undefined);
  user.set('totpEnabled', true);
  await user.save();
  response.status(200).json({ data: { enabled: true } });
});


const recoveryGenerateSchema = z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) });
identityRouter.post('/auth/mfa/recovery-codes', authenticate, authLimiter, async (request, response) => {
  const parsed = recoveryGenerateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide your password and a valid six-digit authenticator code.' } });
    return;
  }
  const user = await User.findById(request.auth!.userId).select('+passwordHash +totpEnabled +totpSecretEncrypted');
  if (!user || !user.totpEnabled || !user.totpSecretEncrypted) {
    response.status(409).json({ error: { code: 'MFA_NOT_ENABLED', message: 'Enable authenticator MFA before creating recovery codes.' } });
    return;
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password)) ||
      !verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.code)) {
    response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Password or authenticator code is incorrect.' } });
    return;
  }
  const codes = generateRecoveryCodes();
  user.set('recoveryCodeHashes', codes.map((code) => hashRecoveryCode(code)));
  await user.save();
  response.status(200).json({
    data: {
      recoveryCodes: codes,
      remaining: codes.length,
      warning: 'These codes are shown only once. Generating new codes invalidates all previously issued recovery codes.',
    },
  });
});

const mfaDisableSchema = z.object({ password: z.string().min(1).max(128), code: z.string().regex(/^\d{6}$/) });
identityRouter.post('/auth/mfa/disable', authenticate, authLimiter, async (request, response) => {
  const parsed = mfaDisableSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide your password and a valid six-digit authenticator code.' } });
    return;
  }
  const user = await User.findById(request.auth!.userId).select('+passwordHash +totpEnabled +totpSecretEncrypted');
  if (!user || !user.totpEnabled || !user.totpSecretEncrypted) {
    response.status(409).json({ error: { code: 'MFA_NOT_ENABLED', message: 'MFA is not enabled for this account.' } });
    return;
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password)) ||
      !verifyTotp(decryptTotpSecret(user.totpSecretEncrypted), parsed.data.code)) {
    response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Password or authenticator code is incorrect.' } });
    return;
  }
  user.set('totpEnabled', false);
  user.set('totpSecretEncrypted', undefined);
  user.set('totpPendingSecretEncrypted', undefined);
  user.set('recoveryCodeHashes', []);
  await user.save();
  await RefreshSession.deleteMany({ userId: user._id });
  response.clearCookie('privaops_refresh', getRefreshCookieOptions());
  response.status(200).json({ data: { enabled: false, sessionsRevoked: true } });
});

identityRouter.post('/auth/refresh', requireTrustedOrigin, async (request, response) => {
  const rawToken = request.cookies?.privaops_refresh as string | undefined;
  if (!rawToken) {
    response.status(401).json({ error: { code: 'REFRESH_REQUIRED', message: 'A refresh session is required.' } });
    return;
  }

  // Atomically consume the old token so parallel refresh requests cannot both succeed.
  const session = await RefreshSession.findOneAndDelete({
    tokenHash: hashRefreshToken(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) {
    response.clearCookie('privaops_refresh', getRefreshCookieOptions());
    response.status(401).json({ error: { code: 'INVALID_REFRESH', message: 'The refresh session is invalid, expired, or already used.' } });
    return;
  }

  const [user, membership, organization] = await Promise.all([
    User.findOne({ _id: session.userId, status: 'active' }),
    Membership.findOne({ userId: session.userId, organizationId: session.organizationId, status: 'active' }),
    Organization.findOne({ _id: session.organizationId, status: 'active' }),
  ]);
  if (!user || !membership || !organization) {
    response.clearCookie('privaops_refresh', getRefreshCookieOptions());
    response.status(401).json({ error: { code: 'ACCESS_REVOKED', message: 'The account or organization access is inactive.' } });
    return;
  }

  const tokens = await issueSession(String(user._id), String(organization._id), response);
  response.status(200).json({ data: tokens });
});

identityRouter.post('/auth/logout', requireTrustedOrigin, async (request, response) => {
  const rawToken = request.cookies?.privaops_refresh as string | undefined;
  if (rawToken) await RefreshSession.deleteOne({ tokenHash: hashRefreshToken(rawToken) });
  response.clearCookie('privaops_refresh', getRefreshCookieOptions());
  response.status(204).send();
});

identityRouter.get('/auth/me', authenticate, async (request, response) => {
  response.status(200).json({
    data: {
      user: { id: request.auth!.userId, fullName: request.auth!.fullName, email: request.auth!.email },
      organization: { id: request.auth!.organizationId, role: request.auth!.role },
    },
  });
});

identityRouter.get(
  '/organizations/:organizationId/context',
  authenticate,
  requireOrganizationScope,
  requirePermission('organization:read'),
  async (request, response) => {
    const organization = await Organization.findOne({
      _id: request.auth!.organizationId,
      status: 'active',
    }).select('name slug').lean();
    if (!organization) {
      response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'The requested organization was not found.' } });
      return;
    }
    response.status(200).json({
      data: {
        organization: { id: String(organization._id), name: organization.name, slug: organization.slug },
        membership: { userId: request.auth!.userId, role: request.auth!.role },
      },
    });
  },
);

identityRouter.get(
  '/organizations/:organizationId/members',
  authenticate,
  requireOrganizationScope,
  requirePermission('members:read'),
  async (request, response) => {
    const members = await Membership.find({
      organizationId: request.auth!.organizationId,
      status: 'active',
    })
      .populate<{ userId: { _id: Types.ObjectId; fullName: string; email: string; status: string } | null }>(
        'userId',
        'fullName email status',
      )
      .select('userId role createdAt')
      .lean();

    response.status(200).json({
      data: {
        members: members.filter((member) => member.userId?.status === 'active').map((member) => ({
          user: {
            id: member.userId!._id.toString(),
            fullName: member.userId!.fullName,
            email: member.userId!.email,
          },
          role: member.role,
          joinedAt: member.createdAt,
        })),
      },
    });
  },
);
