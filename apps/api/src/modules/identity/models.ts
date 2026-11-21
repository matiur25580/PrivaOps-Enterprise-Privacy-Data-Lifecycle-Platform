import { Schema, model, models, Types, type Model } from 'mongoose';

interface UserRecord {
  fullName: string;
  email: string;
  passwordHash: string;
  totpEnabled: boolean;
  totpSecretEncrypted?: string;
  totpPendingSecretEncrypted?: string;
  recoveryCodeHashes: string[];
  emailVerified: boolean;
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
  createdAt: Date;
  updatedAt: Date;
}
interface MfaChallengeRecord {
  tokenId: string;
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;
  expiresAt: Date;
}
interface EmailActionTokenRecord {
  userId: Types.ObjectId;
  purpose: 'email_verification' | 'password_reset';
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
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
  totpEnabled: { type: Boolean, default: false, select: false },
  totpSecretEncrypted: { type: String, select: false },
  totpPendingSecretEncrypted: { type: String, select: false },
  recoveryCodeHashes: { type: [String], default: [], select: false },
  emailVerified: { type: Boolean, default: true },
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

const mfaChallengeSchema = new Schema({
  tokenId: { type: String, required: true, unique: true, select: false },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

const emailActionTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purpose: { type: String, enum: ['email_verification', 'password_reset'], required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 },
  consumedAt: { type: Date },
}, { timestamps: true });

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

export const MfaChallenge: Model<MfaChallengeRecord> = (models.MfaChallenge as Model<MfaChallengeRecord> | undefined) ?? model<MfaChallengeRecord>('MfaChallenge', mfaChallengeSchema);

export const EmailActionToken: Model<EmailActionTokenRecord> = (models.EmailActionToken as Model<EmailActionTokenRecord> | undefined) ?? model<EmailActionTokenRecord>('EmailActionToken', emailActionTokenSchema);
