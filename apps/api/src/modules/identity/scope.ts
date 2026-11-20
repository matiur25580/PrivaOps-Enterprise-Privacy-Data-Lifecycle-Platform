export function organizationScopeMatches(authOrganizationId: string | undefined, routeOrganizationId: string | undefined): boolean {
  return Boolean(authOrganizationId && routeOrganizationId && authOrganizationId === routeOrganizationId);
}
