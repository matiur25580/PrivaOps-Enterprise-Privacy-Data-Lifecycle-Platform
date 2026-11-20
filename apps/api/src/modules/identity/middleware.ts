import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import mongoose from 'mongoose';
import { env } from '../../env.js';
import { Membership, Organization, User } from './models.js';
import { hasPermission, type OrganizationRole } from './types.js';

const secret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);

export const authenticate: RequestHandler = async (request, response, next) => {
  const header = request.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' } });
    return;
  }

  let userId: string;
  let organizationId: string;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'privaops-api',
      audience: 'privaops-web',
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.organizationId !== 'string' ||
        !mongoose.isValidObjectId(payload.sub) || !mongoose.isValidObjectId(payload.organizationId)) {
      throw new Error('Invalid token claims');
    }
    userId = payload.sub;
    organizationId = payload.organizationId;
  } catch {
    response.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } });
    return;
  }

  const [user, membership, organization] = await Promise.all([
    User.findOne({ _id: userId, status: 'active' }).select('fullName email').lean(),
    Membership.findOne({ userId, organizationId, status: 'active' }).lean(),
    Organization.exists({ _id: organizationId, status: 'active' }),
  ]);

  if (!user || !membership || !organization) {
    response.status(401).json({ error: { code: 'ACCESS_REVOKED', message: 'The account or organization access is inactive.' } });
    return;
  }

  request.auth = {
    userId,
    organizationId,
    role: membership.role as OrganizationRole,
    email: user.email,
    fullName: user.fullName,
  };
  next();
};

export function requirePermission(permission: string): RequestHandler {
  return (request, response, next) => {
    const role = request.auth?.role;
    if (!role || !hasPermission(role, permission)) {
      response.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' } });
      return;
    }
    next();
  };
}

export const requireOrganizationScope: RequestHandler = (request, response, next) => {
  const organizationId = request.params.organizationId;
  if (!request.auth || typeof organizationId !== 'string' || request.auth.organizationId !== organizationId) {
    response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'The requested organization was not found.' } });
    return;
  }
  next();
};