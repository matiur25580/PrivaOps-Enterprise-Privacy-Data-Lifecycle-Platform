import { describe, expect, it } from 'vitest';
import { hasPermission, type OrganizationRole } from '../identity/types.js';

describe('privacy request permissions', () => {
  it('allows active members to submit requests and read only their own', () => {
    expect(hasPermission('member', 'privacy_requests:create')).toBe(true);
    expect(hasPermission('member', 'privacy_requests:read_own')).toBe(true);
    expect(hasPermission('member', 'privacy_requests:read')).toBe(false);
    expect(hasPermission('member', 'privacy_requests:manage')).toBe(false);
  });

  it('allows owners and admins to operate the organization queue', () => {
    for (const role of ['owner', 'admin'] as OrganizationRole[]) {
      expect(hasPermission(role, 'privacy_requests:create')).toBe(true);
      expect(hasPermission(role, 'privacy_requests:read')).toBe(true);
      expect(hasPermission(role, 'privacy_requests:manage')).toBe(true);
    }
  });

  it('does not expose privacy requests to viewers', () => {
    expect(hasPermission('viewer', 'privacy_requests:create')).toBe(false);
    expect(hasPermission('viewer', 'privacy_requests:read_own')).toBe(false);
    expect(hasPermission('viewer', 'privacy_requests:read')).toBe(false);
    expect(hasPermission('viewer', 'privacy_requests:manage')).toBe(false);
  });
});
