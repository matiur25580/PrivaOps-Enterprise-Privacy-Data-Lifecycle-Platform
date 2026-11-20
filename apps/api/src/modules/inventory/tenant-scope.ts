export { organizationScopeMatches } from '../identity/scope.js';

export function tenantScopedFilter(
  organizationId: string,
  filters: Record<string, unknown> = {},
): Record<string, unknown> {
  // The server-derived tenant is deliberately applied last and cannot be overridden.
  return { ...filters, organizationId };
}
