import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../env.js';
import { Membership, Organization, RefreshSession, User } from './models.js';
import { authenticate, requireOrganizationScope, requirePermission } from './middleware.js';
import { createAccessToken, createRefreshToken, getRefreshCookieOptions, hashRefreshToken } from './tokens.js';
import type { OrganizationRole } from './types.js';

export const identityRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
});

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

identityRouter.post('/auth/register', authLimiter, async (request, response) => {
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
    const user = await User.create({ fullName: parsed.data.fullName, email, passwordHash });
    userId = String(user._id);
    const organization = await Organization.create({
      name: parsed.data.organizationName,
      slug: `${slugify(parsed.data.organizationName)}-${randomUUID().slice(0, 8)}`,
    });
    organizationId = String(organization._id);
    await Membership.create({ userId, organizationId, role: 'owner', status: 'active' });
    const tokens = await issueSession(userId, organizationId, response);
    response.status(201).json({
      data: {
        user: safeUser(user as SafeUser),
        organization: { id: organizationId, name: organization.name, slug: organization.slug, role: 'owner' },
        ...tokens,
      },
    });
  } catch (error) {
    if (organizationId) await Organization.deleteOne({ _id: organizationId });
    if (userId) await User.deleteOne({ _id: userId });
    throw error;
  }
});

identityRouter.post('/auth/login', authLimiter, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please provide valid login details.' } });
    return;
  }

  const user = await User.findOne({ email: parsed.data.email.toLowerCase(), status: 'active' })
    .select('+passwordHash fullName email');
  const passwordMatches = user
    ? await argon2.verify(user.passwordHash as string, parsed.data.password).catch(() => false)
    : false;

  if (!user || !passwordMatches) {
    response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
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

identityRouter.post('/auth/refresh', async (request, response) => {
  const rawToken = request.cookies?.privaops_refresh as string | undefined;
  if (!rawToken) {
    response.status(401).json({ error: { code: 'REFRESH_REQUIRED', message: 'A refresh session is required.' } });
    return;
  }

  const session = await RefreshSession.findOne({
    tokenHash: hashRefreshToken(rawToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) {
    response.clearCookie('privaops_refresh', getRefreshCookieOptions());
    response.status(401).json({ error: { code: 'INVALID_REFRESH', message: 'The refresh session is invalid or expired.' } });
    return;
  }

  const [user, membership, organization] = await Promise.all([
    User.findOne({ _id: session.userId, status: 'active' }),
    Membership.findOne({ userId: session.userId, organizationId: session.organizationId, status: 'active' }),
    Organization.findOne({ _id: session.organizationId, status: 'active' }),
  ]);
  if (!user || !membership || !organization) {
    await RefreshSession.deleteOne({ _id: session._id });
    response.clearCookie('privaops_refresh', getRefreshCookieOptions());
    response.status(401).json({ error: { code: 'ACCESS_REVOKED', message: 'The account or organization access is inactive.' } });
    return;
  }

  await RefreshSession.deleteOne({ _id: session._id });
  const tokens = await issueSession(String(user._id), String(organization._id), response);
  response.status(200).json({ data: tokens });
});

identityRouter.post('/auth/logout', async (request, response) => {
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
