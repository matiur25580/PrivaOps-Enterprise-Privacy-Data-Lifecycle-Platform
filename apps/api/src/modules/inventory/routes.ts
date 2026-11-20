import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate, requireOrganizationScope, requirePermission } from '../identity/middleware.js';
import { AuditEvent, DataAsset, ProcessingActivity } from './models.js';
import { tenantScopedFilter } from './tenant-scope.js';

export const inventoryRouter = Router();

const idSchema = z.string().refine((value) => Types.ObjectId.isValid(value), 'Invalid identifier');
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.string().optional(),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']).optional(),
});
const assetSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(''),
  system: z.string().trim().min(1).max(160),
  ownerTeam: z.string().trim().min(1).max(120),
  classification: z.enum(['public', 'internal', 'confidential', 'restricted']),
  dataCategories: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  dataSubjects: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
const activitySchema = z.object({
  name: z.string().trim().min(2).max(160),
  purpose: z.string().trim().min(5).max(1000),
  legalBasis: z.enum(['consent', 'contract', 'legal_obligation', 'legitimate_use', 'public_function', 'other']),
  dataCategories: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  dataSubjects: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  systems: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  assetIds: z.array(idSchema).max(100).default([]),
  retentionPeriodDays: z.number().int().min(1).max(36500).nullable().default(null),
  status: z.enum(['active', 'under_review', 'archived']).default('active'),
});

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

async function recordInventoryAudit(
  organizationId: string,
  actorId: string,
  action: 'data_asset.created' | 'data_asset.updated' | 'data_asset.archived' | 'processing_activity.created' | 'processing_activity.updated' | 'processing_activity.archived',
  resourceType: 'data_asset' | 'processing_activity',
  resourceId: Types.ObjectId | string,
  changedFields: string[] = [],
) {
  await AuditEvent.create({
    organizationId,
    actorId,
    action,
    resourceType,
    resourceId: String(resourceId),
    changedFields,
  });
}

const organizationMiddleware = [authenticate, requireOrganizationScope] as const;

inventoryRouter.get('/organizations/:organizationId/data-assets', ...organizationMiddleware, requirePermission('data:read'), async (request, response) => {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid list filters.', details: parsed.error.flatten() } });
    return;
  }
  const { page, limit, q, status, classification } = parsed.data;
  const filter: Record<string, unknown> = tenantScopedFilter(request.auth!.organizationId);
  if (status) filter.status = status;
  if (classification) filter.classification = classification;
  if (q) filter.$or = [{ name: { $regex: escapeRegex(q), $options: 'i' } }, { system: { $regex: escapeRegex(q), $options: 'i' } }, { ownerTeam: { $regex: escapeRegex(q), $options: 'i' } }];
  const [items, total] = await Promise.all([
    DataAsset.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DataAsset.countDocuments(filter),
  ]);
  response.json({ data: { items, pagination: pagination(page, limit, total) } });
});

inventoryRouter.post('/organizations/:organizationId/data-assets', ...organizationMiddleware, requirePermission('data:manage'), async (request, response) => {
  const parsed = assetSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data asset.', details: parsed.error.flatten() } });
    return;
  }
  const item = await DataAsset.create({ ...parsed.data, organizationId: request.auth!.organizationId, createdBy: request.auth!.userId, updatedBy: request.auth!.userId });
  await recordInventoryAudit(request.auth!.organizationId, request.auth!.userId, 'data_asset.created', 'data_asset', item._id, Object.keys(parsed.data));
  response.status(201).json({ data: { item } });
});

inventoryRouter.patch('/organizations/:organizationId/data-assets/:assetId', ...organizationMiddleware, requirePermission('data:manage'), async (request, response) => {
  const id = idSchema.safeParse(request.params.assetId);
  const parsed = assetSchema.partial().safeParse(request.body);
  if (!id.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid asset identifier and at least one valid field.' } });
    return;
  }
  const item = await DataAsset.findOneAndUpdate(
    tenantScopedFilter(request.auth!.organizationId, { _id: id.data, status: 'active' }),
    { $set: { ...parsed.data, updatedBy: request.auth!.userId } },
    { new: true, runValidators: true },
  );
  if (!item) {
    response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Data asset not found.' } });
    return;
  }
  await recordInventoryAudit(request.auth!.organizationId, request.auth!.userId, 'data_asset.updated', 'data_asset', item._id, Object.keys(parsed.data));
  response.json({ data: { item } });
});

inventoryRouter.delete('/organizations/:organizationId/data-assets/:assetId', ...organizationMiddleware, requirePermission('data:manage'), async (request, response) => {
  const id = idSchema.safeParse(request.params.assetId);
  if (!id.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid asset identifier.' } });
    return;
  }
  const item = await DataAsset.findOneAndUpdate(
    tenantScopedFilter(request.auth!.organizationId, { _id: id.data, status: 'active' }),
    { $set: { status: 'archived', updatedBy: request.auth!.userId } },
    { new: true },
  );
  if (!item) {
    response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Data asset not found.' } });
    return;
  }
  await recordInventoryAudit(request.auth!.organizationId, request.auth!.userId, 'data_asset.archived', 'data_asset', item._id, ['status']);
  response.status(204).send();
});

inventoryRouter.get('/organizations/:organizationId/processing-activities', ...organizationMiddleware, requirePermission('data:read'), async (request, response) => {
  const parsed = listSchema.omit({ classification: true }).safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid list filters.', details: parsed.error.flatten() } });
    return;
  }
  const { page, limit, q, status } = parsed.data;
  const filter: Record<string, unknown> = tenantScopedFilter(request.auth!.organizationId);
  if (status) filter.status = status;
  if (q) filter.$or = [{ name: { $regex: escapeRegex(q), $options: 'i' } }, { purpose: { $regex: escapeRegex(q), $options: 'i' } }];
  const [items, total] = await Promise.all([
    ProcessingActivity.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProcessingActivity.countDocuments(filter),
  ]);
  response.json({ data: { items, pagination: pagination(page, limit, total) } });
});

inventoryRouter.post('/organizations/:organizationId/processing-activities', ...organizationMiddleware, requirePermission('data:manage'), async (request, response) => {
  const parsed = activitySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid processing activity.', details: parsed.error.flatten() } });
    return;
  }
  if (parsed.data.assetIds.length) {
    const count = await DataAsset.countDocuments(tenantScopedFilter(request.auth!.organizationId, { _id: { $in: parsed.data.assetIds }, status: 'active' }));
    if (count !== parsed.data.assetIds.length) {
      response.status(400).json({ error: { code: 'INVALID_ASSET_REFERENCE', message: 'One or more data assets are unavailable in this organization.' } });
      return;
    }
  }
  const item = await ProcessingActivity.create({ ...parsed.data, organizationId: request.auth!.organizationId, createdBy: request.auth!.userId, updatedBy: request.auth!.userId });
  await recordInventoryAudit(request.auth!.organizationId, request.auth!.userId, 'processing_activity.created', 'processing_activity', item._id, Object.keys(parsed.data));
  response.status(201).json({ data: { item } });
});

inventoryRouter.patch('/organizations/:organizationId/processing-activities/:activityId', ...organizationMiddleware, requirePermission('data:manage'), async (request, response) => {
  const id = idSchema.safeParse(request.params.activityId);
  const parsed = activitySchema.partial().safeParse(request.body);
  if (!id.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid activity identifier and at least one valid field.' } });
    return;
  }
  if (parsed.data.assetIds?.length) {
    const count = await DataAsset.countDocuments(tenantScopedFilter(request.auth!.organizationId, { _id: { $in: parsed.data.assetIds }, status: 'active' }));
    if (count !== parsed.data.assetIds.length) {
      response.status(400).json({ error: { code: 'INVALID_ASSET_REFERENCE', message: 'One or more data assets are unavailable in this organization.' } });
      return;
    }
  }
  const item = await ProcessingActivity.findOneAndUpdate(
    tenantScopedFilter(request.auth!.organizationId, { _id: id.data, status: { $ne: 'archived' } }),
    { $set: { ...parsed.data, updatedBy: request.auth!.userId } },
    { new: true, runValidators: true },
  );
  if (!item) {
    response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Processing activity not found.' } });
    return;
  }
  await recordInventoryAudit(request.auth!.organizationId, request.auth!.userId, 'processing_activity.updated', 'processing_activity', item._id, Object.keys(parsed.data));
  response.json({ data: { item } });
});

inventoryRouter.delete('/organizations/:organizationId/processing-activities/:activityId', ...organizationMiddleware, requirePermission('data:manage'), async (request, response) => {
  const id = idSchema.safeParse(request.params.activityId);
  if (!id.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid activity identifier.' } });
    return;
  }
  const item = await ProcessingActivity.findOneAndUpdate(
    tenantScopedFilter(request.auth!.organizationId, { _id: id.data, status: { $ne: 'archived' } }),
    { $set: { status: 'archived', updatedBy: request.auth!.userId } },
    { new: true },
  );
  if (!item) {
    response.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Processing activity not found.' } });
    return;
  }
  await recordInventoryAudit(request.auth!.organizationId, request.auth!.userId, 'processing_activity.archived', 'processing_activity', item._id, ['status']);
  response.status(204).send();
});
