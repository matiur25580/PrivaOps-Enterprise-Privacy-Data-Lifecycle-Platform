import { describe, expect, it } from 'vitest';
import { canActorFulfillPrivacyRequest, canFulfillPrivacyRequest, canTransitionPrivacyRequestStatus } from './workflow.js';

describe('privacy request lifecycle', () => {
  it('allows the expected operational transitions', () => {
    expect(canTransitionPrivacyRequestStatus('submitted', 'identity_verification')).toBe(true);
    expect(canTransitionPrivacyRequestStatus('identity_verification', 'in_progress')).toBe(true);
    expect(canTransitionPrivacyRequestStatus('in_progress', 'fulfilled')).toBe(true);
    expect(canTransitionPrivacyRequestStatus('fulfilled', 'closed')).toBe(true);
  });

  it('rejects skipped and backwards transitions', () => {
    expect(canTransitionPrivacyRequestStatus('submitted', 'fulfilled')).toBe(false);
    expect(canTransitionPrivacyRequestStatus('in_progress', 'submitted')).toBe(false);
    expect(canTransitionPrivacyRequestStatus('closed', 'in_progress')).toBe(false);
  });

  it('allows terminal outcomes to close but not reopen', () => {
    expect(canTransitionPrivacyRequestStatus('rejected', 'closed')).toBe(true);
    expect(canTransitionPrivacyRequestStatus('withdrawn', 'closed')).toBe(true);
    expect(canTransitionPrivacyRequestStatus('closed', 'closed')).toBe(false);
  });

  it('requires verified identity before fulfillment', () => {
    expect(canFulfillPrivacyRequest('pending')).toBe(false);
    expect(canFulfillPrivacyRequest('failed')).toBe(false);
    expect(canFulfillPrivacyRequest('verified')).toBe(true);
  });
});


describe('privacy request separation of duties', () => {
  it('prevents a requester from fulfilling their own request', () => {
    expect(canActorFulfillPrivacyRequest('verified', 'user-1', 'user-2', 'user-1')).toBe(false);
  });

  it('allows a different authorized actor to fulfill after identity verification', () => {
    expect(canActorFulfillPrivacyRequest('verified', 'user-1', 'user-3', 'user-2')).toBe(true);
  });

  it('prevents the identity verifier from fulfilling the same request', () => {
    expect(canActorFulfillPrivacyRequest('verified', 'user-1', 'user-2', 'user-2')).toBe(false);
  });

  it('requires a recorded verifier distinct from the requester', () => {
    expect(canActorFulfillPrivacyRequest('verified', 'user-1', null, 'user-3')).toBe(false);
    expect(canActorFulfillPrivacyRequest('verified', 'user-1', 'user-1', 'user-3')).toBe(false);
  });

  it('still requires verified identity for a different actor', () => {
    expect(canActorFulfillPrivacyRequest('pending', 'user-1', 'user-3', 'user-2')).toBe(false);
  });
});
