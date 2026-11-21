import { describe, expect, it } from 'vitest';
import { hasPermission, type OrganizationRole } from '../identity/types.js';
import { organizationRequestFilter, ownPrivacyRequestFilter, privacyRequestCompareAndSetFilter } from './scope.js';

describe('privacy request access boundaries', () => {
  it('always scopes organization queue queries to the authenticated tenant', () => {
    expect(organizationRequestFilter('tenant-a', {
      status: 'submitted',
      organizationId: 'tenant-b',
    })).toEqual({ status: 'submitted', organizationId: 'tenant-a' });
  });

  it('always scopes member request queries to both tenant and authenticated requester', () => {
    expect(ownPrivacyRequestFilter('tenant-a', 'user-a', {
      _id: 'request-1',
      organizationId: 'tenant-b',
      requestedBy: 'user-b',
    })).toEqual({
      _id: 'request-1',
      organizationId: 'tenant-a',
      requestedBy: 'user-a',
    });
  });

  it('keeps read-own separate from organization-wide read and management', () => {
    const roles: OrganizationRole[] = ['owner', 'admin', 'member', 'viewer'];
    const matrix = roles.map((role) => ({
      role,
      create: hasPermission(role, 'privacy_requests:create'),
      readOwn: hasPermission(role, 'privacy_requests:read_own'),
      readAll: hasPermission(role, 'privacy_requests:read'),
      manage: hasPermission(role, 'privacy_requests:manage'),
    }));

    expect(matrix).toEqual([
      { role: 'owner', create: true, readOwn: false, readAll: true, manage: true },
      { role: 'admin', create: true, readOwn: false, readAll: true, manage: true },
      { role: 'member', create: true, readOwn: true, readAll: false, manage: false },
      { role: 'viewer', create: false, readOwn: false, readAll: false, manage: false },
    ]);
  });
});

describe('privacy request compare-and-set updates', () => {
  it('matches both the current workflow and identity verification state', () => {
    expect(privacyRequestCompareAndSetFilter(
      'tenant-a', 'request-1', 'in_progress', 'verified',
    )).toEqual({
      _id: 'request-1',
      organizationId: 'tenant-a',
      status: 'in_progress',
      identityVerificationStatus: 'verified',
    });
  });
});
