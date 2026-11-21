import { describe, expect, it } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS, type OrganizationRole } from '../identity/types.js';

describe('data inventory permissions', () => {
  it('allows every role to read the organization inventory', () => {
    const roles: OrganizationRole[] = ['owner', 'admin', 'member', 'viewer'];
    for (const role of roles) expect(hasPermission(role, 'data:read')).toBe(true);
  });

  it('restricts inventory mutations to owners and admins', () => {
    expect(hasPermission('owner', 'data:manage')).toBe(true);
    expect(hasPermission('admin', 'data:manage')).toBe(true);
    expect(hasPermission('member', 'data:manage')).toBe(false);
    expect(hasPermission('viewer', 'data:manage')).toBe(false);
  });

  it('restricts organization audit history to owners and admins', () => {
    expect(hasPermission('owner', 'audit:read')).toBe(true);
    expect(hasPermission('admin', 'audit:read')).toBe(true);
    expect(hasPermission('member', 'audit:read')).toBe(false);
    expect(hasPermission('viewer', 'audit:read')).toBe(false);
  });

  it('keeps the permission matrix explicit for all roles', () => {
    expect(ROLE_PERMISSIONS.owner).toContain('data:manage');
    expect(ROLE_PERMISSIONS.member).not.toContain('data:manage');
    expect(ROLE_PERMISSIONS.viewer).not.toContain('data:manage');
  });
});
