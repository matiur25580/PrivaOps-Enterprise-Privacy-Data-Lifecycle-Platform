import { call } from '../../lib/api-client';
import type { Activity } from './types';

export type CreateProcessingActivityInput = {
  name: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string[];
  dataSubjects: string[];
  systems: string[];
  assetIds: string[];
  retentionPeriodDays: number | null;
};

export function createProcessingActivity(
  organizationId: string,
  accessToken: string,
  input: CreateProcessingActivityInput,
) {
  return call<{ item: Activity }>(
    '/organizations/' + encodeURIComponent(organizationId) + '/processing-activities',
    accessToken,
    { method: 'POST', body: JSON.stringify(input) },
  );
}
