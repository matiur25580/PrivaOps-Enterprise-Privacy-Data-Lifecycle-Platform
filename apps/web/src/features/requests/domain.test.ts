import { describe, expect, it } from 'vitest';
import { statusTransitions, terminalStatuses } from './domain';

describe('privacy request workflow domain', () => {
  it('allows only the configured next states for an in-progress request', () => {
    expect(statusTransitions.in_progress).toEqual([
      'awaiting_information',
      'fulfilled',
      'rejected',
      'withdrawn',
    ]);
  });

  it('does not allow transitions out of a closed request', () => {
    expect(statusTransitions.closed).toEqual([]);
  });

  it('recognizes every terminal workflow state', () => {
    expect(terminalStatuses).toEqual(['fulfilled', 'rejected', 'withdrawn', 'closed']);
  });
});
