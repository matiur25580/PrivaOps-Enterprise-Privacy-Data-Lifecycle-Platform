export function organizationScopeMatches(authOrganizationId: string | undefined, routeOrganizationId: string | undefined): boolean {
  return Boolean(authOrganizationId && routeOrganizationId && authOrganizationId === routeOrganizationId);
}

export function tenantScopedFilter(
  organizationId: string,
  filters: Record<string, unknown> = {},
): Record<string, unknown> {
  // The server-derived tenant is deliberately applied last and cannot be overridden.
  return { ...filters, organizationId };
}
