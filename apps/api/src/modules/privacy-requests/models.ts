import { Schema, model, models, Types, type Model } from 'mongoose';

export type PrivacyRequestType =
  | 'access'
  | 'correction'
  | 'erasure'
  | 'portability'
  | 'withdraw_consent'
  | 'restriction'
  | 'objection'
  | 'other';

export type PrivacyRequestStatus =
  | 'submitted'
  | 'identity_verification'
  | 'in_progress'
  | 'awaiting_information'
  | 'fulfilled'
  | 'rejected'
  | 'withdrawn'
  | 'closed';

interface PrivacyRequestRecord {
  organizationId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  requestType: PrivacyRequestType;
  description: string;
  status: PrivacyRequestStatus;
  identityVerificationStatus: 'pending' | 'verified' | 'failed';
  assignedTo: Types.ObjectId | null;
  dueAt: Date | null;
  resolutionSummary: string;
  rejectionReason: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PrivacyRequestEventRecord {
  organizationId: Types.ObjectId;
  requestId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: 'created' | 'status_changed' | 'assigned' | 'updated';
  changedFields: string[];
  createdAt: Date;
}

const privacyRequestSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestType: {
    type: String,
    enum: ['access', 'correction', 'erasure', 'portability', 'withdraw_consent', 'restriction', 'objection', 'other'],
    required: true,
  },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  status: {
    type: String,
    enum: ['submitted', 'identity_verification', 'in_progress', 'awaiting_information', 'fulfilled', 'rejected', 'withdrawn', 'closed'],
    default: 'submitted',
    index: true,
  },
  identityVerificationStatus: { type: String, enum: ['pending', 'verified', 'failed'], default: 'pending' },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  dueAt: { type: Date, default: null },
  resolutionSummary: { type: String, trim: true, maxlength: 2000, default: '' },
  rejectionReason: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true, versionKey: false });

privacyRequestSchema.index({ organizationId: 1, createdAt: -1 });
privacyRequestSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
privacyRequestSchema.index({ organizationId: 1, requestedBy: 1, createdAt: -1 });

const privacyRequestEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  requestId: { type: Schema.Types.ObjectId, ref: 'PrivacyRequest', required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['created', 'status_changed', 'assigned', 'updated'], required: true },
  changedFields: [{ type: String, maxlength: 80 }],
}, { timestamps: true, versionKey: false });
privacyRequestEventSchema.index({ organizationId: 1, requestId: 1, createdAt: -1 });

export const PrivacyRequest: Model<PrivacyRequestRecord> =
  (models.PrivacyRequest as Model<PrivacyRequestRecord> | undefined) ??
  model<PrivacyRequestRecord>('PrivacyRequest', privacyRequestSchema);

export const PrivacyRequestEvent: Model<PrivacyRequestEventRecord> =
  (models.PrivacyRequestEvent as Model<PrivacyRequestEventRecord> | undefined) ??
  model<PrivacyRequestEventRecord>('PrivacyRequestEvent', privacyRequestEventSchema);
