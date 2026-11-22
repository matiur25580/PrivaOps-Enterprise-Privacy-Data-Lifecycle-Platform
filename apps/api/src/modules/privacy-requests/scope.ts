export type PrivacyRequestFilter = Record<string, unknown>;

export function organizationRequestFilter(
  organizationId: string,
  criteria: PrivacyRequestFilter = {},
): PrivacyRequestFilter {
  return { ...criteria, organizationId };
}

export function ownPrivacyRequestFilter(
  organizationId: string,
  userId: string,
  criteria: PrivacyRequestFilter = {},
): PrivacyRequestFilter {
  return { ...criteria, organizationId, requestedBy: userId };
}

export function privacyRequestCompareAndSetFilter(
  organizationId: string,
  requestId: unknown,
  currentStatus: string,
  currentIdentityVerificationStatus: string,
  currentIdentityVerifiedBy: unknown = null,
): PrivacyRequestFilter {
  return {
    _id: requestId,
    organizationId,
    status: currentStatus,
    identityVerificationStatus: currentIdentityVerificationStatus,
    identityVerifiedBy: currentIdentityVerifiedBy,
  };
}
