import type { PrivacyRequestStatus } from './models.js';

export type IdentityVerificationStatus = 'pending' | 'verified' | 'failed';

const transitions: Record<PrivacyRequestStatus, readonly PrivacyRequestStatus[]> = {
  submitted: ['identity_verification', 'in_progress', 'withdrawn'],
  identity_verification: ['in_progress', 'awaiting_information', 'rejected', 'withdrawn'],
  in_progress: ['awaiting_information', 'fulfilled', 'rejected', 'withdrawn'],
  awaiting_information: ['in_progress', 'fulfilled', 'rejected', 'withdrawn'],
  fulfilled: ['closed'],
  rejected: ['closed'],
  withdrawn: ['closed'],
  closed: [],
};

export function canTransitionPrivacyRequestStatus(
  current: PrivacyRequestStatus,
  next: PrivacyRequestStatus,
): boolean {
  return transitions[current].includes(next);
}

export function canFulfillPrivacyRequest(identityStatus: IdentityVerificationStatus): boolean {
  return identityStatus === 'verified';
}

export function canActorFulfillPrivacyRequest(
  identityStatus: IdentityVerificationStatus,
  requestedBy: string,
  actorId: string,
): boolean {
  return requestedBy !== actorId && canFulfillPrivacyRequest(identityStatus);
}
