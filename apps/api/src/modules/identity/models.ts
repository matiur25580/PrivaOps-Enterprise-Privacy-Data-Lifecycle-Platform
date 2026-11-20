import { Schema, model, models, type Model } from 'mongoose';

const userSchema = new Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
}, { timestamps: true });

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
}, { timestamps: true });

const membershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  role: { type: String, enum: ['owner', 'admin', 'member', 'viewer'], required: true, default: 'member' },
  status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
}, { timestamps: true });
membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

// Explicit Model annotations keep the hot-reload registry's Model<any> type
// from forming an incompatible union with each schema-inferred model type.
export const User: Model<any> = (models.User as Model<any> | undefined) ?? model('User', userSchema);
export const Organization: Model<any> = (models.Organization as Model<any> | undefined) ?? model('Organization', organizationSchema);
export const Membership: Model<any> = (models.Membership as Model<any> | undefined) ?? model('Membership', membershipSchema);
export const RefreshSession: Model<any> = (models.RefreshSession as Model<any> | undefined) ?? model('RefreshSession', refreshSessionSchema);
