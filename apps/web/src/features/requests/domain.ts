export const terminalStatuses = ['fulfilled', 'rejected', 'withdrawn', 'closed'];

export const statusTransitions: Record<string, string[]> = {
  submitted: ['identity_verification', 'in_progress', 'withdrawn'],
  identity_verification: ['in_progress', 'awaiting_information', 'rejected', 'withdrawn'],
  in_progress: ['awaiting_information', 'fulfilled', 'rejected', 'withdrawn'],
  awaiting_information: ['in_progress', 'fulfilled', 'rejected', 'withdrawn'],
  fulfilled: ['closed'],
  rejected: ['closed'],
  withdrawn: ['closed'],
  closed: [],
};
