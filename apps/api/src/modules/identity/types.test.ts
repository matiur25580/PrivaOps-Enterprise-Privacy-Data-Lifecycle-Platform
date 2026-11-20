import { describe, expect, it } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS, type OrganizationRole } from './types.js';

describe('organization role permissions', () => {
  it('grants owners and admins organization and membership administration', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(hasPermission(role, 'organization:manage')).toBe(true);
      expect(hasPermission(role, 'members:manage')).toBe(true);
    }
  });

  it('does not grant administrative permissions to members or viewers', () => {
    for (const role of ['member', 'viewer'] as const) {
      expect(hasPermission(role, 'organization:manage')).toBe(false);
      expect(hasPermission(role, 'members:manage')).toBe(false);
    }
  });

  it('limits viewers to read-only organization access', () => {
    expect(ROLE_PERMISSIONS.viewer).toEqual(['organization:read']);
    expect(hasPermission('viewer', 'members:read')).toBe(false);
  });

  it('defines an explicit permission set for every supported role', () => {
    const roles: OrganizationRole[] = ['owner', 'admin', 'member', 'viewer'];
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...roles].sort());
  });
});
