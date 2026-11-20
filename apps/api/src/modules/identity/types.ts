export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  email: string;
  fullName: string;
}

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly string[]> = {
  owner: ['organization:read', 'organization:manage', 'members:read', 'members:manage'],
  admin: ['organization:read', 'organization:manage', 'members:read', 'members:manage'],
  member: ['organization:read', 'members:read'],
  viewer: ['organization:read'],
};