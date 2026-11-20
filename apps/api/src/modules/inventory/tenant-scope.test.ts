import { describe, expect, it } from 'vitest';
import { organizationScopeMatches, tenantScopedFilter } from './tenant-scope.js';

describe('tenant isolation helpers', () => {
  it('accepts only the authenticated organization in the route scope', () => {
    expect(organizationScopeMatches('org-a', 'org-a')).toBe(true);
    expect(organizationScopeMatches('org-a', 'org-b')).toBe(false);
    expect(organizationScopeMatches(undefined, 'org-a')).toBe(false);
    expect(organizationScopeMatches('org-a', undefined)).toBe(false);
  });

  it('always applies the server-derived organization to database filters', () => {
    expect(tenantScopedFilter('org-a', { status: 'active' })).toEqual({ status: 'active', organizationId: 'org-a' });
    expect(tenantScopedFilter('org-a', { organizationId: 'org-b', status: 'active' })).toEqual({ status: 'active', organizationId: 'org-a' });
  });
});
