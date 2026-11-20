import { describe, expect, it } from 'vitest';
import { canTransitionPrivacyRequestStatus } from './workflow.js';

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
});
