import { call } from '../../lib/api-client';
import type { RequestEvent, RequestItem } from './types';

const organizationPath = (organizationId: string) =>
  '/organizations/' + encodeURIComponent(organizationId) + '/privacy-requests';

export function createPrivacyRequest(
  organizationId: string,
  accessToken: string,
  input: { requestType: string; description: string },
) {
  return call<{ item: RequestItem }>(organizationPath(organizationId), accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getPrivacyRequestEvents(organizationId: string, accessToken: string, requestId: string) {
  return call<{ events: RequestEvent[] }>(
    organizationPath(organizationId) + '/' + encodeURIComponent(requestId) + '/events',
    accessToken,
  );
}

export function updatePrivacyRequest(
  organizationId: string,
  accessToken: string,
  requestId: string,
  payload: Record<string, string | null>,
) {
  return call<{ item: RequestItem }>(
    organizationPath(organizationId) + '/' + encodeURIComponent(requestId),
    accessToken,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}
