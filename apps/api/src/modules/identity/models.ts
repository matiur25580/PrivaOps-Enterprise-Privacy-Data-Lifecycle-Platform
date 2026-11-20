import { Schema, model, models, Types, type Model } from 'mongoose';

interface UserRecord {
  fullName: string;
  email: string;
  passwordHash: string;
  status: 'active' | 'suspended';
}
interface OrganizationRecord {
  name: string;
  slug: string;
  status: 'active' | 'suspended';
}
interface MembershipRecord {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'suspended';
}
interface RefreshSessionRecord {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

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

// Explicit document types keep the hot-reload registry and schema model types aligned.
export const User: Model<UserRecord> = (models.User as Model<UserRecord> | undefined) ?? model<UserRecord>('User', userSchema);
export const Organization: Model<OrganizationRecord> = (models.Organization as Model<OrganizationRecord> | undefined) ?? model<OrganizationRecord>('Organization', organizationSchema);
export const Membership: Model<MembershipRecord> = (models.Membership as Model<MembershipRecord> | undefined) ?? model<MembershipRecord>('Membership', membershipSchema);
export const RefreshSession: Model<RefreshSessionRecord> = (models.RefreshSession as Model<RefreshSessionRecord> | undefined) ?? model<RefreshSessionRecord>('RefreshSession', refreshSessionSchema);
