import { call } from '../../lib/api-client';
import type { Asset } from './types';

export type CreateAssetInput = {
  name: string;
  system: string;
  ownerTeam: string;
  classification: string;
  description: string;
  dataCategories: string[];
  dataSubjects: string[];
};

const organizationPath = (organizationId: string) =>
  '/organizations/' + encodeURIComponent(organizationId);

export function createDataAsset(organizationId: string, accessToken: string, input: CreateAssetInput) {
  return call<{ item: Asset }>(organizationPath(organizationId) + '/data-assets', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function archiveDataAsset(organizationId: string, accessToken: string, assetId: string) {
  return call(organizationPath(organizationId) + '/data-assets/' + encodeURIComponent(assetId), accessToken, {
    method: 'DELETE',
  });
}
