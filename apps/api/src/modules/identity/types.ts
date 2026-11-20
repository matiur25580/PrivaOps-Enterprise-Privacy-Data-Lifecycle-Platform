export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  email: string;
  fullName: string;
}

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly string[]> = {
  owner: [
    'organization:read', 'organization:manage', 'members:read', 'members:manage',
    'data:read', 'data:manage', 'privacy_requests:create', 'privacy_requests:read', 'privacy_requests:manage',
  ],
  admin: [
    'organization:read', 'organization:manage', 'members:read', 'members:manage',
    'data:read', 'data:manage', 'privacy_requests:create', 'privacy_requests:read', 'privacy_requests:manage',
  ],
  member: [
    'organization:read', 'members:read', 'data:read',
    'privacy_requests:create', 'privacy_requests:read_own',
  ],
  viewer: ['organization:read', 'data:read'],
};

export function hasPermission(role: OrganizationRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
