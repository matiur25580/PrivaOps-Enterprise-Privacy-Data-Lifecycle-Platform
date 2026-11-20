import { Schema, model, models, Types, type Model } from 'mongoose';

interface DataAssetRecord {
  organizationId: Types.ObjectId;
  name: string;
  description: string;
  system: string;
  ownerTeam: string;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  dataCategories: string[];
  dataSubjects: string[];
  status: 'active' | 'archived';
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
}
interface ProcessingActivityRecord {
  organizationId: Types.ObjectId;
  name: string;
  purpose: string;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'legitimate_use' | 'public_function' | 'other';
  dataCategories: string[];
  dataSubjects: string[];
  systems: string[];
  assetIds: Types.ObjectId[];
  retentionPeriodDays: number | null;
  status: 'active' | 'under_review' | 'archived';
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
}
interface AuditEventRecord {
  organizationId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: 'data_asset.created' | 'data_asset.updated' | 'data_asset.archived' | 'processing_activity.created' | 'processing_activity.updated' | 'processing_activity.archived';
  resourceType: 'data_asset' | 'processing_activity';
  resourceId: string;
  changedFields: string[];
}

const dataAssetSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  system: { type: String, required: true, trim: true, maxlength: 160 },
  ownerTeam: { type: String, required: true, trim: true, maxlength: 120 },
  classification: { type: String, enum: ['public', 'internal', 'confidential', 'restricted'], required: true },
  dataCategories: [{ type: String, trim: true, maxlength: 80 }],
  dataSubjects: [{ type: String, trim: true, maxlength: 80 }],
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
dataAssetSchema.index({ organizationId: 1, name: 1 });
dataAssetSchema.index({ organizationId: 1, status: 1, classification: 1 });

const processingActivitySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  purpose: { type: String, required: true, trim: true, maxlength: 1000 },
  legalBasis: { type: String, required: true, enum: ['consent', 'contract', 'legal_obligation', 'legitimate_use', 'public_function', 'other'] },
  dataCategories: [{ type: String, trim: true, maxlength: 80 }],
  dataSubjects: [{ type: String, trim: true, maxlength: 80 }],
  systems: [{ type: String, trim: true, maxlength: 160 }],
  assetIds: [{ type: Schema.Types.ObjectId, ref: 'DataAsset' }],
  retentionPeriodDays: { type: Number, min: 1, max: 36500, default: null },
  status: { type: String, enum: ['active', 'under_review', 'archived'], default: 'active', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
processingActivitySchema.index({ organizationId: 1, name: 1 });
processingActivitySchema.index({ organizationId: 1, status: 1 });

// Explicit document types keep the hot-reload registry and schema model types aligned.
export const DataAsset: Model<DataAssetRecord> = (models.DataAsset as Model<DataAssetRecord> | undefined) ?? model<DataAssetRecord>('DataAsset', dataAssetSchema);
export const ProcessingActivity: Model<ProcessingActivityRecord> = (models.ProcessingActivity as Model<ProcessingActivityRecord> | undefined) ?? model<ProcessingActivityRecord>('ProcessingActivity', processingActivitySchema);


// Append-only operational history; keep event metadata free of personal-data values.
const auditEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['data_asset.created', 'data_asset.updated', 'data_asset.archived', 'processing_activity.created', 'processing_activity.updated', 'processing_activity.archived'], required: true },
  resourceType: { type: String, enum: ['data_asset', 'processing_activity'], required: true },
  resourceId: { type: String, required: true, maxlength: 64 },
  changedFields: [{ type: String, maxlength: 80 }],
}, { timestamps: true, versionKey: false });
auditEventSchema.index({ organizationId: 1, createdAt: -1 });
auditEventSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1 });
export const AuditEvent: Model<AuditEventRecord> = (models.AuditEvent as Model<AuditEventRecord> | undefined) ?? model<AuditEventRecord>('AuditEvent', auditEventSchema);
