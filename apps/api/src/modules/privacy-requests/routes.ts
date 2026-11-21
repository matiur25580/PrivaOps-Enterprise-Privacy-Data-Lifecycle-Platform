import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate, requireOrganizationScope, requirePermission } from '../identity/middleware.js';
import { hasPermission } from '../identity/types.js';
import { Membership } from '../identity/models.js';
import { PrivacyRequest, PrivacyRequestEvent, type PrivacyRequestStatus } from './models.js';
import { canFulfillPrivacyRequest, canTransitionPrivacyRequestStatus } from './workflow.js';
import { organizationRequestFilter, ownPrivacyRequestFilter } from './scope.js';

export const privacyRequestRouter = Router();

const idSchema = z.string().refine((value) => Types.ObjectId.isValid(value), 'Invalid identifier');
const requestTypeSchema = z.enum([
  'access', 'correction', 'erasure', 'portability',
  'withdraw_consent', 'restriction', 'objection', 'other',
]);
const statusSchema = z.enum([
  'submitted', 'identity_verification', 'in_progress', 'awaiting_information',
  'fulfilled', 'rejected', 'withdrawn', 'closed',
]);
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: statusSchema.optional(),
  requestType: requestTypeSchema.optional(),
});
const createSchema = z.object({
  requestType: requestTypeSchema,
  description: z.string().trim().max(2000).default(''),
});
const updateSchema = z.object({
  status: statusSchema.optional(),
  identityVerificationStatus: z.enum(['pending', 'verified', 'failed']).optional(),
  assignedTo: idSchema.nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  resolutionSummary: z.string().trim().max(2000).optional(),
  rejectionReason: z.string().trim().max(1000).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const organizationMiddleware = [authenticate, requireOrganizationScope] as const;

privacyRequestRouter.get(
  '/organizations/:organizationId/privacy-requests',
  ...organizationMiddleware,
  requirePermission('privacy_requests:read'),
  async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request filters.', details: parsed.error.flatten() } });
      return;
    }
    const { page, limit, status, requestType } = parsed.data;
    const filter = organizationRequestFilter(request.auth!.organizationId, {
      ...(status ? { status } : {}),
      ...(requestType ? { requestType } : {}),
    });
    const [items, total] = await Promise.all([
      PrivacyRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PrivacyRequest.countDocuments(filter),
    ]);
    response.json({ data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  },
);

privacyRequestRouter.post(
  '/organizations/:organizationId/privacy-requests',
  ...organizationMiddleware,
  requirePermission('privacy_requests:create'),
  async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request.', details: parsed.error.flatten() } });
      return;
    }
    const item = await PrivacyRequest.create({
      ...parsed.data,
      organizationId: request.auth!.organizationId,
      requestedBy: request.auth!.userId,
    });
    await PrivacyRequestEvent.create({
      organizationId: request.auth!.organizationId,
      requestId: item._id,
      actorId: request.auth!.userId,
      action: 'created',
      changedFields: ['requestType', 'description', 'status'],
    });
    response.status(201).json({ data: { item } });
  },
);

privacyRequestRouter.get(
  '/organizations/:organizationId/privacy-requests/mine',
  ...organizationMiddleware,
  requirePermission('privacy_requests:read_own'),
  async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request filters.', details: parsed.error.flatten() } });
      return;
    }
    const { page, limit, status, requestType } = parsed.data;
    const filter = ownPrivacyRequestFilter(request.auth!.organizationId, request.auth!.userId, {
      ...(status ? { status } : {}),
      ...(requestType ? { requestType } : {}),
    });
    const [items, total] = await Promise.all([
      PrivacyRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PrivacyRequest.countDocuments(filter),
    ]);
    response.json({ data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  },
);

privacyRequestRouter.get(
  '/organizations/:organizationId/privacy-requests/:requestId',
  ...organizationMiddleware,
  async (request, response) => {
    const id = idSchema.safeParse(request.params.requestId);
    if (!id.success) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request identifier.' } });
      return;
    }
    const role = request.auth!.role;
    const canReadAll = hasPermission(role, 'privacy_requests:read');
    const canReadOwn = hasPermission(role, 'privacy_requests:read_own');
    if (!canReadAll && !canReadOwn) {
      response.status(403).json({ error: { code: 'FORBIDDEN', message: 'You cannot read privacy requests.' } });
      return;
    }
    const filter = canReadAll
      ? organizationRequestFilter(request.auth!.organizationId, { _id: id.data })
      : ownPrivacyRequestFilter(request.auth!.organizationId, request.auth!.userId, { _id: id.data });
    const item = await PrivacyRequest.findOne(filter).lean();
    if (!item) {
      response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Privacy request not found.' } });
      return;
    }
    response.json({ data: { item } });
  },
);

privacyRequestRouter.get(
  '/organizations/:organizationId/privacy-requests/:requestId/events',
  ...organizationMiddleware,
  async (request, response) => {
    const id = idSchema.safeParse(request.params.requestId);
    if (!id.success) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request identifier.' } });
      return;
    }
    const role = request.auth!.role;
    const canReadAll = hasPermission(role, 'privacy_requests:read');
    const canReadOwn = hasPermission(role, 'privacy_requests:read_own');
    if (!canReadAll && !canReadOwn) {
      response.status(403).json({ error: { code: 'FORBIDDEN', message: 'You cannot read privacy request events.' } });
      return;
    }
    const requestFilter = canReadAll
      ? organizationRequestFilter(request.auth!.organizationId, { _id: id.data })
      : ownPrivacyRequestFilter(request.auth!.organizationId, request.auth!.userId, { _id: id.data });
    const exists = await PrivacyRequest.exists(requestFilter);
    if (!exists) {
      response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Privacy request not found.' } });
      return;
    }
    const events = await PrivacyRequestEvent.find(organizationRequestFilter(request.auth!.organizationId, { requestId: id.data })).sort({ createdAt: 1 }).lean();
    response.json({ data: { events } });
  },
);

privacyRequestRouter.post(
  '/organizations/:organizationId/privacy-requests/:requestId/withdraw',
  ...organizationMiddleware,
  requirePermission('privacy_requests:create'),
  async (request, response) => {
    const id = idSchema.safeParse(request.params.requestId);
    if (!id.success) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request identifier.' } });
      return;
    }
    const current = await PrivacyRequest.findOne(
      ownPrivacyRequestFilter(request.auth!.organizationId, request.auth!.userId, { _id: id.data }),
    );
    if (!current) {
      response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Privacy request not found.' } });
      return;
    }
    if (!canTransitionPrivacyRequestStatus(current.status, 'withdrawn')) {
      response.status(409).json({ error: { code: 'INVALID_STATUS_TRANSITION', message: 'This request can no longer be withdrawn.' } });
      return;
    }
    const updated = await PrivacyRequest.findOneAndUpdate(
      ownPrivacyRequestFilter(request.auth!.organizationId, request.auth!.userId, { _id: id.data, status: current.status }),
      { $set: { status: 'withdrawn' } },
      { new: true, runValidators: true },
    );
    if (!updated) {
      response.status(409).json({ error: { code: 'CONCURRENT_UPDATE', message: 'The request changed while you were withdrawing it. Reload and retry.' } });
      return;
    }
    await PrivacyRequestEvent.create({
      organizationId: request.auth!.organizationId,
      requestId: updated._id,
      actorId: request.auth!.userId,
      action: 'status_changed',
      changedFields: ['status'],
    });
    response.json({ data: { item: updated } });
  },
);

privacyRequestRouter.patch(
  '/organizations/:organizationId/privacy-requests/:requestId',
  ...organizationMiddleware,
  requirePermission('privacy_requests:manage'),
  async (request, response) => {
    const id = idSchema.safeParse(request.params.requestId);
    const parsed = updateSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid request identifier and at least one valid update.', details: parsed.success ? undefined : parsed.error.flatten() } });
      return;
    }
    const current = await PrivacyRequest.findOne(
      organizationRequestFilter(request.auth!.organizationId, { _id: id.data }),
    );
    if (!current) {
      response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Privacy request not found.' } });
      return;
    }
    const identityStatus = parsed.data.identityVerificationStatus ?? current.identityVerificationStatus;
    if (parsed.data.status === 'fulfilled' && !canFulfillPrivacyRequest(identityStatus)) {
      response.status(409).json({ error: { code: 'IDENTITY_VERIFICATION_REQUIRED', message: 'Verify the requester\'s identity before fulfilling this request.' } });
      return;
    }
    if (parsed.data.status === 'fulfilled' && !(parsed.data.resolutionSummary ?? current.resolutionSummary).trim()) {
      response.status(400).json({ error: { code: 'RESOLUTION_REQUIRED', message: 'Add a resolution summary before fulfilling a request.' } });
      return;
    }
    if (parsed.data.status === 'rejected' && !(parsed.data.rejectionReason ?? current.rejectionReason).trim()) {
      response.status(400).json({ error: { code: 'REJECTION_REASON_REQUIRED', message: 'Add a rejection reason before rejecting a request.' } });
      return;
    }
    if (parsed.data.status && !canTransitionPrivacyRequestStatus(current.status, parsed.data.status as PrivacyRequestStatus)) {
      response.status(409).json({ error: { code: 'INVALID_STATUS_TRANSITION', message: `Cannot move a request from ${current.status} to ${parsed.data.status}.` } });
      return;
    }
    if (parsed.data.assignedTo) {
      const membership = await Membership.exists({
        userId: parsed.data.assignedTo,
        organizationId: request.auth!.organizationId,
        status: 'active',
      });
      if (!membership) {
        response.status(400).json({ error: { code: 'INVALID_ASSIGNEE', message: 'Assignee must be an active member of this organization.' } });
        return;
      }
    }
    const changedFields = Object.keys(parsed.data);
    const updated = await PrivacyRequest.findOneAndUpdate(
      organizationRequestFilter(request.auth!.organizationId, { _id: id.data, status: current.status }),
      { $set: parsed.data },
      { new: true, runValidators: true },
    );
    if (!updated) {
      response.status(409).json({ error: { code: 'CONCURRENT_UPDATE', message: 'The request changed while you were updating it. Reload and retry.' } });
      return;
    }
    const action = parsed.data.status && parsed.data.status !== current.status
      ? 'status_changed'
      : parsed.data.assignedTo !== undefined
        ? 'assigned'
        : 'updated';
    await PrivacyRequestEvent.create({
      organizationId: request.auth!.organizationId,
      requestId: updated._id,
      actorId: request.auth!.userId,
      action,
      changedFields,
    });
    response.json({ data: { item: updated } });
  },
);
